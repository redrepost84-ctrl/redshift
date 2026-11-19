import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const HELPER_CS = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public static class RedshiftDesktopCapture {
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] private static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hWnd, int nIndex);
  [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);
  [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);
  [DllImport("shcore.dll")] private static extern int SetProcessDpiAwareness(int value);

  [StructLayout(LayoutKind.Sequential)]
  private struct RECT { public int Left, Top, Right, Bottom; }

  private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024 };
  private static ImageCodecInfo JpegCodec;

  public static void Init() {
    try { SetProcessDpiAwareness(2); } catch {}
    foreach (var enc in ImageCodecInfo.GetImageEncoders()) {
      if (enc.FormatID == ImageFormat.Jpeg.Guid) { JpegCodec = enc; break; }
    }
  }

  private static bool TryGetWindowBounds(IntPtr hwnd, out RECT rect) {
    rect = new RECT();
    try {
      if (DwmGetWindowAttribute(hwnd, 9, out rect, Marshal.SizeOf(typeof(RECT))) == 0 &&
          (rect.Right - rect.Left) > 0 && (rect.Bottom - rect.Top) > 0) {
        return true;
      }
    } catch {}
    return GetWindowRect(hwnd, out rect);
  }

  private static string EncodeBitmapJpeg(Bitmap src, int maxW, int maxH, long quality) {
    int dstW = src.Width;
    int dstH = src.Height;
    if (maxW > 0 && maxH > 0 && (dstW > maxW || dstH > maxH)) {
      double scale = Math.Min((double)maxW / dstW, (double)maxH / dstH);
      dstW = Math.Max(2, (int)Math.Round(dstW * scale));
      dstH = Math.Max(2, (int)Math.Round(dstH * scale));
    }
    Bitmap target = src;
    bool createdScaled = false;
    if (dstW != src.Width || dstH != src.Height) {
      target = new Bitmap(dstW, dstH, PixelFormat.Format24bppRgb);
      createdScaled = true;
      using (var g = Graphics.FromImage(target)) {
        g.CompositingMode = CompositingMode.SourceCopy;
        g.CompositingQuality = CompositingQuality.HighSpeed;
        g.InterpolationMode = InterpolationMode.Bilinear;
        g.DrawImage(src, 0, 0, dstW, dstH);
      }
    }
    try {
      using (var ms = new MemoryStream()) {
        if (JpegCodec != null) {
          using (var ep = new EncoderParameters(1)) {
            ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
            target.Save(ms, JpegCodec, ep);
          }
        } else {
          target.Save(ms, ImageFormat.Jpeg);
        }
        return Convert.ToBase64String(ms.GetBuffer(), 0, (int)ms.Length);
      }
    } finally {
      if (createdScaled) target.Dispose();
    }
  }

  private static Bitmap CaptureMonitorBitmap(Screen scr) {
    var b = scr.Bounds;
    var bmp = new Bitmap(Math.Max(2, b.Width), Math.Max(2, b.Height), PixelFormat.Format24bppRgb);
    using (var g = Graphics.FromImage(bmp)) {
      g.CopyFromScreen(b.X, b.Y, 0, 0, b.Size, CopyPixelOperation.SourceCopy);
    }
    return bmp;
  }

  private static Bitmap CaptureWindowBitmap(IntPtr hwnd, RECT rect) {
    int w = Math.Max(2, rect.Right - rect.Left);
    int h = Math.Max(2, rect.Bottom - rect.Top);
    var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
    bool printed = false;
    using (var g = Graphics.FromImage(bmp)) {
      IntPtr hdc = g.GetHdc();
      try {
        printed = PrintWindow(hwnd, hdc, 2);
        if (!printed) printed = PrintWindow(hwnd, hdc, 0);
      } finally {
        g.ReleaseHdc(hdc);
      }
      if (!printed) {
        g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(w, h), CopyPixelOperation.SourceCopy);
      }
    }
    return bmp;
  }

  public static string HandleCommand(string line) {
    if (string.IsNullOrWhiteSpace(line)) return "{}";
    var parts = line.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
    string cmd = parts[0].ToUpperInvariant();

    if (cmd == "LIST") {
      var list = new List<Dictionary<string, object>>();
      var errs = new List<string>();
      var screens = Screen.AllScreens;
      for (int i = 0; i < screens.Length; i++) {
        var s = screens[i];
        try {
          using (var bmp = CaptureMonitorBitmap(s)) {
            string thumb = EncodeBitmapJpeg(bmp, 320, 180, 72L);
            string title = s.Primary
              ? ("Primary Screen (" + s.Bounds.Width + "x" + s.Bounds.Height + ")")
              : ("Display " + (i + 1) + " (" + s.Bounds.Width + "x" + s.Bounds.Height + ")");
            list.Add(new Dictionary<string, object> {
              { "id", "monitor:" + i },
              { "kind", "screen" },
              { "name", title },
              { "processName", "Desktop" },
              { "width", s.Bounds.Width },
              { "height", s.Bounds.Height },
              { "thumbnailDataUrl", "data:image/jpeg;base64," + thumb }
            });
          }
        } catch (Exception ex) {
          errs.Add("scr" + i + ":" + ex.GetType().Name + ":" + ex.Message);
        }
      }

      var ignoredClasses = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd",
        "Windows.UI.Core.CoreWindow", "ApplicationFrameWindow"
      };
      int selfPid = Process.GetCurrentProcess().Id;
      EnumWindows((hwnd, _) => {
        try {
          if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
          int cloaked = 0;
          try { DwmGetWindowAttribute(hwnd, 14, out cloaked, 4); } catch {}
          if (cloaked != 0) return true;
          int exStyle = GetWindowLong(hwnd, -20);
          if ((exStyle & 0x00000080) != 0 && (exStyle & 0x00040000) == 0) return true;
          int len = GetWindowTextLength(hwnd);
          if (len <= 0) return true;
          var sbTitle = new StringBuilder(len + 1);
          GetWindowText(hwnd, sbTitle, sbTitle.Capacity);
          string title = sbTitle.ToString().Trim();
          if (string.IsNullOrEmpty(title)) return true;
          var sbCls = new StringBuilder(128);
          GetClassName(hwnd, sbCls, sbCls.Capacity);
          string cls = sbCls.ToString();
          if (ignoredClasses.Contains(cls)) return true;
          uint pid = 0;
          GetWindowThreadProcessId(hwnd, out pid);
          if ((int)pid == selfPid) return true;
          RECT r;
          if (!TryGetWindowBounds(hwnd, out r)) return true;
          int w = r.Right - r.Left;
          int h = r.Bottom - r.Top;
          if (w < 120 || h < 90) return true;
          string procName = "App";
          try { procName = Process.GetProcessById((int)pid).ProcessName; } catch {}
          if (string.Equals(procName, "TextInputHost", StringComparison.OrdinalIgnoreCase)) return true;
          using (var bmp = CaptureWindowBitmap(hwnd, r)) {
            string thumb = EncodeBitmapJpeg(bmp, 320, 180, 68L);
            list.Add(new Dictionary<string, object> {
              { "id", "window:" + hwnd.ToInt64() },
              { "kind", "window" },
              { "name", title },
              { "processName", procName },
              { "width", w },
              { "height", h },
              { "thumbnailDataUrl", "data:image/jpeg;base64," + thumb }
            });
          }
        } catch (Exception ex) {
          if (errs.Count < 8) errs.Add("win:" + ex.GetType().Name + ":" + ex.Message);
        }
        return true;
      }, IntPtr.Zero);

      return Json.Serialize(new Dictionary<string, object> {
        { "ok", true },
        { "sources", list },
        { "errors", errs }
      });
    }

    if (cmd == "FRAME" && parts.Length >= 2) {
      string srcId = parts[1];
      int maxW = parts.Length >= 3 ? int.Parse(parts[2]) : 1920;
      int maxH = parts.Length >= 4 ? int.Parse(parts[3]) : 1080;
      long q = parts.Length >= 5 ? long.Parse(parts[4]) : 74L;

      if (srcId.StartsWith("monitor:")) {
        int idx;
        if (!int.TryParse(srcId.Substring(8), out idx) || idx < 0 || idx >= Screen.AllScreens.Length) {
          return "{\"ok\":false,\"closed\":true}";
        }
        var scr = Screen.AllScreens[idx];
        using (var bmp = CaptureMonitorBitmap(scr)) {
          string jpeg = EncodeBitmapJpeg(bmp, maxW, maxH, q);
          return Json.Serialize(new Dictionary<string, object> {
            { "ok", true },
            { "width", bmp.Width },
            { "height", bmp.Height },
            { "jpeg", jpeg }
          });
        }
      }

      if (srcId.StartsWith("window:")) {
        long handleVal;
        if (!long.TryParse(srcId.Substring(7), out handleVal)) {
          return "{\"ok\":false,\"closed\":true}";
        }
        var hwnd = new IntPtr(handleVal);
        if (!IsWindow(hwnd) || !IsWindowVisible(hwnd)) {
          return "{\"ok\":false,\"closed\":true}";
        }
        if (IsIconic(hwnd)) {
          return "{\"ok\":true,\"minimized\":true}";
        }
        RECT r;
        if (!TryGetWindowBounds(hwnd, out r) || (r.Right - r.Left) < 2 || (r.Bottom - r.Top) < 2) {
          return "{\"ok\":false,\"closed\":true}";
        }
        using (var bmp = CaptureWindowBitmap(hwnd, r)) {
          string jpeg = EncodeBitmapJpeg(bmp, maxW, maxH, q);
          return Json.Serialize(new Dictionary<string, object> {
            { "ok", true },
            { "width", bmp.Width },
            { "height", bmp.Height },
            { "jpeg", jpeg }
          });
        }
      }
    }

    return "{\"ok\":false,\"error\":\"unknown_command\"}";
  }
}
`;

/**
 * Provides lazy local Windows screen/window enumeration and JPEG frame capture
 * over a persistent PowerShell/.NET worker for loopback Redshift sessions.
 */
export function createLocalScreenCaptureService() {
  let proc = null;
  let scriptPath = null;
  let bootPromise = null;
  let idleTimer = null;
  let commandQueue = Promise.resolve();
  /** @type {Array<(line: string) => void>} */
  const waiters = [];

  const cleanupProc = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    const cur = proc;
    const oldScript = scriptPath;
    proc = null;
    scriptPath = null;
    bootPromise = null;
    while (waiters.length > 0) {
      const w = waiters.shift();
      w?.('');
    }
    if (cur) {
      try {
        cur.kill();
      } catch {
        // Ignore termination failures.
      }
    }
    if (oldScript) {
      try {
        fs.unlinkSync(oldScript);
      } catch {
        // Ignore cleanup failure.
      }
    }
  };

  const bumpIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => {
      cleanupProc();
    }, 90_000);
    if (typeof idleTimer.unref === 'function') {
      idleTimer.unref();
    }
  };

  const ensureWorker = () => {
    if (process.platform !== 'win32') {
      return Promise.reject(new Error('Host screen enumeration only supported on Windows'));
    }
    if (proc && bootPromise) {
      bumpIdleTimer();
      return bootPromise;
    }
    cleanupProc();
    const tmpScript = path.join(os.tmpdir(), `redshift_cap_${process.pid}_${Date.now()}.ps1`);
    const psSource = [
      `$code = @'`,
      HELPER_CS,
      `'@`,
      `Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions -TypeDefinition $code`,
      `[RedshiftDesktopCapture]::Init()`,
      `[Console]::Out.WriteLine('__RS_CAP_READY__')`,
      `[Console]::Out.Flush()`,
      `while ($true) {`,
      `  $line = [Console]::In.ReadLine()`,
      `  if ($null -eq $line -or $line -eq '__EXIT__') { break }`,
      `  try {`,
      `    $out = [RedshiftDesktopCapture]::HandleCommand($line)`,
      `    [Console]::Out.WriteLine($out)`,
      `  } catch {`,
      `    [Console]::Out.WriteLine('{"ok":false,"error":"worker_exception"}')`,
      `  }`,
      `  [Console]::Out.Flush()`,
      `}`,
    ].join('\r\n');
    fs.writeFileSync(tmpScript, psSource, 'utf8');
    scriptPath = tmpScript;

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', tmpScript],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    proc = child;
    let bootErr = '';
    child.stderr.on('data', (d) => {
      if (bootErr.length < 2048) bootErr += String(d);
    });
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const nextWaiter = waiters.shift();
      if (nextWaiter) {
        nextWaiter(line);
      }
    });
    child.once('exit', () => {
      if (proc === child) {
        cleanupProc();
      }
    });
    child.once('error', () => {
      if (proc === child) {
        cleanupProc();
      }
    });

    bootPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanupProc();
        reject(new Error(`Capture helper startup timed out${bootErr ? `: ${bootErr.trim()}` : ''}`));
      }, 15_000);
      waiters.push((readyLine) => {
        clearTimeout(timer);
        if (readyLine.trim() === '__RS_CAP_READY__') {
          bumpIdleTimer();
          resolve();
        } else {
          cleanupProc();
          reject(new Error(`Capture helper failed to initialize${bootErr ? `: ${bootErr.trim()}` : ''}`));
        }
      });
    });

    return bootPromise;
  };

  const runWorkerCommand = (cmdLine) => {
    const task = commandQueue.then(async () => {
      await ensureWorker();
      if (!proc || proc.killed || !proc.stdin.writable) {
        throw new Error('Capture worker unavailable');
      }
      bumpIdleTimer();
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Capture worker command timed out'));
        }, 12_000);
        waiters.push((line) => {
          clearTimeout(timer);
          if (!line) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(line));
          } catch {
            resolve(null);
          }
        });
        proc.stdin.write(`${cmdLine}\n`);
      });
    });
    commandQueue = task.catch(() => {});
    return task;
  };

  return {
    isSupported: () => process.platform === 'win32',
    listSources: async () => {
      if (process.platform !== 'win32') {
        return { supported: false, sources: [] };
      }
      try {
        const res = await runWorkerCommand('LIST');
        if (!res || !res.ok || !Array.isArray(res.sources) || res.sources.length === 0) {
          return { supported: false, sources: [] };
        }
        return { supported: true, sources: res.sources };
      } catch {
        return { supported: false, sources: [] };
      }
    },
    captureFrame: async (sourceId, maxW = 1920, maxH = 1080, quality = 74) => {
      if (process.platform !== 'win32' || !sourceId) {
        return { ok: false, closed: true };
      }
      const cleanId = String(sourceId).replace(/[\r\n\s]/g, '');
      const res = await runWorkerCommand(
        `FRAME ${cleanId} ${Math.max(0, Math.round(maxW))} ${Math.max(0, Math.round(maxH))} ${Math.min(92, Math.max(35, Math.round(quality)))}`,
      );
      if (!res) {
        return { ok: false, error: 'empty_response' };
      }
      if (res.ok && typeof res.jpeg === 'string') {
        return {
          ok: true,
          width: Number(res.width) || 1280,
          height: Number(res.height) || 720,
          jpegBuffer: Buffer.from(res.jpeg, 'base64'),
        };
      }
      return res;
    },
    shutdown: cleanupProc,
  };
}

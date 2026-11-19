const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  shell,
  desktopCapturer,
  session,
  nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

// Keep user data & SQLite DB safely in %AppData%\Redshift so updates never wipe user data.
const USER_DATA_DIR = path.join(app.getPath('appData'), 'Redshift');
app.setPath('userData', USER_DATA_DIR);
app.setAppUserModelId('com.redshift.desktop');
process.env.REDSHIFT_DATA_DIR = path.join(USER_DATA_DIR, 'data');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Prevent duplicate instances unless performing a fresh install handoff.
const isInstallerFlag = process.argv.includes('--install');
const isPortableFlag = process.argv.includes('--portable') || process.argv.includes('--no-install');
const isUpdateNowFlag = process.argv.includes('--update-now');
const gotLock = isInstallerFlag ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let currentVersion = '0.1.0';
try {
  const pkg = require('../package.json');
  if (pkg && pkg.version) currentVersion = pkg.version;
} catch (_) {}

let bundledUpdaterConfig = {
  githubRepo: 'redrepost84-ctrl/redshift',
  customManifestUrl: '',
  defaultServerUrl: '',
  channel: 'stable',
};
try {
  const cfgPath = path.join(__dirname, 'updater-config.json');
  if (fs.existsSync(cfgPath)) {
    const rawCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    bundledUpdaterConfig = {
      ...bundledUpdaterConfig,
      ...rawCfg,
      githubRepo: (rawCfg && rawCfg.githubRepo) || bundledUpdaterConfig.githubRepo,
    };
  }
} catch (_) {}

const CONFIG_PATH = path.join(USER_DATA_DIR, 'desktop-config.json');

function readDesktopConfig() {
  const defaults = {
    serverUrl: bundledUpdaterConfig.defaultServerUrl || '',
    githubRepo: bundledUpdaterConfig.githubRepo || 'redrepost84-ctrl/redshift',
    customManifestUrl: bundledUpdaterConfig.customManifestUrl || '',
    minimizeToTray: true,
    channel: bundledUpdaterConfig.channel || 'stable',
  };
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      const merged = { ...defaults, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
      if (!merged.githubRepo || !String(merged.githubRepo).trim()) {
        merged.githubRepo = defaults.githubRepo;
      }
      return merged;
    }
  } catch (_) {}
  return defaults;
}

function writeDesktopConfig(patch) {
  const next = { ...readDesktopConfig(), ...(patch && typeof patch === 'object' ? patch : {}) };
  if (typeof next.serverUrl === 'string') {
    next.serverUrl = next.serverUrl.trim().replace(/\/+$/, '');
  }
  if (typeof next.githubRepo === 'string') {
    next.githubRepo = next.githubRepo
      .trim()
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/\/+$/, '');
  }
  if (typeof next.customManifestUrl === 'string') {
    next.customManifestUrl = next.customManifestUrl.trim();
  }
  next.minimizeToTray = Boolean(next.minimizeToTray);
  try {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('[Redshift Desktop] Failed to write desktop-config.json:', err);
  }
  return next;
}

function getIconPath(preferIco = true) {
  const candidates = preferIco
    ? [
        path.join(__dirname, '../dist/icon.ico'),
        path.join(__dirname, '../public/icon.ico'),
        path.join(__dirname, '../dist/icon.png'),
        path.join(__dirname, '../public/icon.png'),
      ]
    : [
        path.join(__dirname, '../dist/icon.png'),
        path.join(__dirname, '../public/icon.png'),
        path.join(__dirname, '../dist/icon.ico'),
        path.join(__dirname, '../public/icon.ico'),
      ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function compareSemver(a, b) {
  const pa = String(a || '0.0.0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function getLocalInstallDir() {
  const localAppData = process.env.LOCALAPPDATA || app.getPath('appData');
  return path.join(localAppData, 'Redshift');
}

function isRunningFromInstalledLocation() {
  if (!app.isPackaged) return true;
  const exeDir = path.dirname(app.getPath('exe')).toLowerCase();
  const localAppData = (process.env.LOCALAPPDATA || app.getPath('appData')).toLowerCase();
  const standardDir = path.join(localAppData, 'redshift');
  const nsisDir = path.join(localAppData, 'programs', 'redshift');
  const progFiles = (process.env.PROGRAMFILES || 'C:\\Program Files').toLowerCase();
  return (
    exeDir === standardDir ||
    exeDir.startsWith(standardDir + path.sep) ||
    exeDir === nsisDir ||
    exeDir.startsWith(nsisDir + path.sep) ||
    exeDir.startsWith(path.join(progFiles, 'redshift'))
  );
}

function shouldRunFirstTimeInstaller() {
  if (!app.isPackaged) return false;
  if (isPortableFlag || isUpdateNowFlag) return false;
  if (isInstallerFlag) return true;
  return !isRunningFromInstalledLocation();
}

let launcherWindow = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;
let isTransitioningWindow = false;
let embeddedServer = null;
let embeddedServerPort = null;
let backgroundTunnelProc = null;
let pendingDisplaySource = null;
let lastManifestResult = null;
let bgUpdateTimer = null;
let lastUnreadCount = 0;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function probeHttpUrl(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureEmbeddedServer() {
  if (embeddedServer && embeddedServerPort) {
    return `http://127.0.0.1:${embeddedServerPort}`;
  }

  const serverModPath = path.join(__dirname, '../server/redshiftServer.js');
  const mod = await import(pathToFileURL(serverModPath).href);
  const apiMiddleware = mod.createRedshiftServerMiddleware();
  const distDir = path.join(__dirname, '../dist');

  const srv = http.createServer((req, res) => {
    apiMiddleware(req, res, () => {
      const urlPath = (req.url || '/').split('?')[0];
      if (fs.existsSync(distDir)) {
        const safePath = path
          .normalize(urlPath === '/' ? '/index.html' : urlPath)
          .replace(/^(\.\.[\/\\])+/, '');
        let filePath = path.join(distDir, safePath);
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          filePath = path.join(distDir, 'index.html');
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          fs.readFile(filePath, (readErr, data) => {
            if (readErr) {
              res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end('Failed to read build asset.\n');
              return;
            }
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
            res.end(data);
          });
          return;
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Redshift build assets not found.\n');
    });
  });

  mod.attachRedshiftWebSocket(srv);

  await new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = srv.address();
  embeddedServer = srv;
  embeddedServerPort = typeof addr === 'object' && addr ? addr.port : 8080;
  setTimeout(() => {
    void ensureWorldwideHostTunnelIfNeeded(embeddedServerPort);
  }, 4000).unref();
  return `http://127.0.0.1:${embeddedServerPort}`;
}

function readHostGitHubTokenAsync() {
  if (process.env.GITHUB_TOKEN) return Promise.resolve(process.env.GITHUB_TOKEN);
  if (process.platform !== 'win32') return Promise.resolve('');
  const ps = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool CredRead(string target, uint type, int reservedFlag, out IntPtr credentialPtr);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern void CredFree([In] IntPtr cred);
  public static string GetPass(string target) {
    IntPtr ptr;
    if (!CredRead(target, 1, 0, out ptr)) return "";
    try {
      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
      byte[] b = new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob, b, 0, (int)c.CredentialBlobSize);
      string u = Encoding.Unicode.GetString(b).TrimEnd('\\0');
      string a = Encoding.UTF8.GetString(b).TrimEnd('\\0');
      return u.StartsWith("gh") || u.StartsWith("github_") ? u : a;
    } finally { CredFree(ptr); }
  }
}
"@
$t = [CredHelper]::GetPass("GitHub - https://api.github.com/redrepost84-ctrl")
if (-not $t) { $t = [CredHelper]::GetPass("LegacyGeneric:target=GitHub - https://api.github.com/redrepost84-ctrl") }
Write-Output $t
`;
  return new Promise((resolve) => {
    try {
      const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      let out = '';
      child.stdout.on('data', (d) => (out += d.toString()));
      child.on('exit', () => resolve(out.trim()));
      child.on('error', () => resolve(''));
    } catch (_) {
      resolve('');
    }
  });
}

async function ensureWorldwideHostTunnelIfNeeded(localPort) {
  if (backgroundTunnelProc) return;
  const cfg = readDesktopConfig();
  const repo = (cfg.githubRepo || 'redrepost84-ctrl/redshift').trim();
  if (!repo) return;

  // 1. Check if the worldwide server published in online-server.json on GitHub is already alive
  try {
    const { data } = await fetchJsonWithRedirects(
      `https://raw.githubusercontent.com/${repo}/main/online-server.json?t=${Date.now()}`,
      3500,
    );
    const liveUrl = typeof data?.serverUrl === 'string' ? data.serverUrl.trim().replace(/\/+$/, '') : '';
    if (liveUrl) {
      const alive = await probeHttpUrl(`${liveUrl}/api/health`, 3500);
      if (alive) {
        writeDesktopConfig({ serverUrl: liveUrl });
        return;
      }
    }
  } catch (_) {}

  // 2. If offline and this machine is the host (has GitHub credential), auto-start Cloudflare Tunnel in background
  const token = await readHostGitHubTokenAsync();
  if (!token) return;

  const cfCandidates = [
    path.join(USER_DATA_DIR, 'cloudflared.exe'),
    path.join(__dirname, '../scripts/cloudflared.exe'),
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ];
  let cfBin = cfCandidates.find((cand) => fs.existsSync(cand)) || null;

  if (!cfBin && process.platform === 'win32') {
    const destCf = path.join(USER_DATA_DIR, 'cloudflared.exe');
    const tmpCf = `${destCf}.download`;
    try {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true });
      await downloadFileWithProgress(
        'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
        tmpCf,
      );
      fs.renameSync(tmpCf, destCf);
      cfBin = destCf;
    } catch (_) {
      try { fs.unlinkSync(tmpCf); } catch (_) {}
    }
  }
  if (!cfBin) return;

  backgroundTunnelProc = spawn(cfBin, ['tunnel', '--url', `http://127.0.0.1:${localPort}`], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let published = false;
  const onOut = async (chunk) => {
    const match = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match && !published) {
      published = true;
      const publicUrl = match[0];
      writeDesktopConfig({ serverUrl: publicUrl });
      try {
        const apiUrl = `https://api.github.com/repos/${repo}/contents/online-server.json`;
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Redshift-Desktop-Host',
        };
        let existingSha = undefined;
        const getRes = await fetch(apiUrl, { headers });
        if (getRes.ok) {
          const getJson = await getRes.json();
          existingSha = getJson?.sha;
        }
        const payloadObj = { serverUrl: publicUrl, updatedAt: new Date().toISOString() };
        const contentB64 = Buffer.from(JSON.stringify(payloadObj, null, 2) + '\n', 'utf8').toString('base64');
        await fetch(apiUrl, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Auto-update worldwide server endpoint (${publicUrl})`,
            content: contentB64,
            ...(existingSha ? { sha: existingSha } : {}),
          }),
        });
      } catch (_) {}
    }
  };
  backgroundTunnelProc.stdout.on('data', onOut);
  backgroundTunnelProc.stderr.on('data', onOut);
  backgroundTunnelProc.on('exit', () => {
    backgroundTunnelProc = null;
  });
}

function fetchJsonWithRedirects(url, timeoutMs = 4000, maxRedirects = 6) {
  return new Promise((resolve, reject) => {
    function get(currentUrl, hops = 0) {
      if (hops > maxRedirects) {
        return reject(new Error('Too many redirects'));
      }
      const client = currentUrl.startsWith('https') ? https : http;
      const req = client.get(
        currentUrl,
        {
          timeout: timeoutMs,
          headers: {
            'User-Agent': `Redshift-Desktop/${currentVersion}`,
            Accept: 'application/json',
          },
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let nextUrl = res.headers.location;
            if (!nextUrl.startsWith('http')) {
              const u = new URL(currentUrl);
              nextUrl = `${u.protocol}//${u.host}${nextUrl}`;
            }
            res.resume();
            return get(nextUrl, hops + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          let raw = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            raw += chunk;
            if (raw.length > 512 * 1024) {
              req.destroy();
              reject(new Error('Manifest too large'));
            }
          });
          res.on('end', () => {
            try {
              resolve({ data: JSON.parse(raw), finalUrl: currentUrl });
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Manifest fetch timed out'));
      });
    }
    get(url);
  });
}

function downloadFileWithProgress(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    function get(currentUrl, hops = 0) {
      if (hops > 8) {
        return reject(new Error('Too many redirects while downloading update'));
      }
      const client = currentUrl.startsWith('https') ? https : http;
      const req = client.get(
        currentUrl,
        {
          headers: { 'User-Agent': `Redshift-Desktop/${currentVersion}` },
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let nextUrl = res.headers.location;
            if (!nextUrl.startsWith('http')) {
              const u = new URL(currentUrl);
              nextUrl = `${u.protocol}//${u.host}${nextUrl}`;
            }
            res.resume();
            return get(nextUrl, hops + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`Update server responded with HTTP ${res.statusCode}`));
          }
          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let receivedBytes = 0;
          const out = fs.createWriteStream(destPath);
          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            out.write(chunk);
            if (onProgress) {
              const percent =
                totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0;
              onProgress({ receivedBytes, totalBytes, percent });
            }
          });
          res.on('end', () => {
            out.end();
            out.on('finish', () => resolve(destPath));
          });
          res.on('error', (err) => {
            out.destroy();
            try { fs.unlinkSync(destPath); } catch (_) {}
            reject(err);
          });
        },
      );
      req.on('error', (err) => {
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(err);
      });
      req.setTimeout(60000, () => {
        req.destroy();
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(new Error('Update download timed out'));
      });
    }
    get(url);
  });
}

function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function buildManifestCandidateUrls() {
  const cfg = readDesktopConfig();
  const candidates = [];

  if (process.env.REDSHIFT_MANIFEST_URL) {
    candidates.push({ source: 'env', url: process.env.REDSHIFT_MANIFEST_URL });
  }
  if (cfg.githubRepo) {
    candidates.push({
      source: 'github',
      url: `https://github.com/${cfg.githubRepo}/releases/latest/download/version.json`,
    });
  }
  if (cfg.customManifestUrl) {
    candidates.push({ source: 'custom', url: cfg.customManifestUrl });
  }
  if (cfg.serverUrl) {
    candidates.push({
      source: 'server',
      url: `${cfg.serverUrl}/api/desktop/version.json`,
    });
  }
  return candidates;
}

async function fetchLatestManifest() {
  const candidates = buildManifestCandidateUrls();
  for (const cand of candidates) {
    try {
      const { data, finalUrl } = await fetchJsonWithRedirects(cand.url, 3800);
      if (data && typeof data.version === 'string' && data.version.trim()) {
        const remoteVer = data.version.trim();
        let resolvedAsarUrl = typeof data.asarUrl === 'string' ? data.asarUrl.trim() : '';
        if (resolvedAsarUrl && !resolvedAsarUrl.startsWith('http')) {
          resolvedAsarUrl = new URL(resolvedAsarUrl, finalUrl).href;
        }
        const updateAvailable = compareSemver(remoteVer, currentVersion) > 0;
        const result = {
          ok: true,
          source: cand.source,
          updateAvailable,
          currentVersion,
          latestVersion: remoteVer,
          changelog: typeof data.changelog === 'string' ? data.changelog : '',
          asarUrl: resolvedAsarUrl || undefined,
          sha256: typeof data.sha256 === 'string' ? data.sha256.trim().toLowerCase() : undefined,
          size: typeof data.size === 'number' ? data.size : undefined,
        };
        lastManifestResult = result;
        return result;
      }
    } catch (_) {
      // Try next update source silently.
    }
  }

  return {
    ok: true,
    source: candidates.length > 0 ? 'unreachable' : 'unconfigured',
    updateAvailable: false,
    currentVersion,
    latestVersion: currentVersion,
  };
}

function createLauncherWindow(mode = 'boot') {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.focus();
    return;
  }

  launcherWindow = new BrowserWindow({
    title: 'Redshift Launcher',
    width: 460,
    height: 340,
    useContentSize: true,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: '#0d0e13',
    show: true,
    icon: getIconPath(true),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);
  launcherWindow.loadFile(path.join(__dirname, 'launcher.html'), { query: { mode } });
  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });
}

function ensureSystemTray() {
  if (tray) return;
  const iconPath = getIconPath(false);
  if (!iconPath) return;

  const img = nativeImage.createFromPath(iconPath);
  tray = new Tray(img.resize({ width: 16, height: 16 }));
  tray.setToolTip('Redshift');

  const rebuildTrayMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Redshift',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            void createMainWindow();
          }
        },
      },
      {
        label: 'Check for Updates...',
        click: async () => {
          const res = await fetchLatestManifest();
          if (res.updateAvailable && res.asarUrl) {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('background-update-available', res);
              mainWindow.show();
              mainWindow.focus();
            } else {
              createLauncherWindow('update');
            }
          } else if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Redshift',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
  };

  rebuildTrayMenu();
  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      void createMainWindow();
    }
  });
}

function setupNativeDisplayCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 },
      });
      const wanted = pendingDisplaySource;
      pendingDisplaySource = null;

      let chosen = null;
      if (wanted && wanted.sourceId) {
        chosen = sources.find((s) => s.id === wanted.sourceId) || null;
      }
      if (!chosen && sources.length > 0) {
        chosen = sources[0];
      }
      if (!chosen) {
        callback({});
        return;
      }

      const payload = { video: chosen };
      if (wanted?.withAudio && process.platform === 'win32') {
        payload.audio = 'loopback';
      }
      callback(payload);
    } catch (err) {
      console.error('[Redshift Desktop] Display capture handler error:', err);
      callback({});
    }
  });
}

async function resolveStartUrl() {
  const cfg = readDesktopConfig();
  if (cfg.serverUrl && (cfg.serverUrl.startsWith('http://') || cfg.serverUrl.startsWith('https://'))) {
    // Load local built UI (served from local loopback) or remote server directly
    const localUrl = await ensureEmbeddedServer();
    return localUrl;
  }

  if (!app.isPackaged) {
    const viteAlive = await probeHttpUrl('http://localhost:5173/');
    if (viteAlive) {
      return 'http://localhost:5173/';
    }
  }

  return await ensureEmbeddedServer();
}

async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  ensureSystemTray();
  const targetUrl = await resolveStartUrl();

  mainWindow = new BrowserWindow({
    title: 'Redshift',
    width: 1320,
    height: 840,
    minWidth: 880,
    minHeight: 580,
    backgroundColor: '#13141a',
    autoHideMenuBar: true,
    show: true,
    icon: getIconPath(true),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  Menu.setApplicationMenu(null);

  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.close();
    launcherWindow = null;
  }
  isTransitioningWindow = false;
  mainWindow.show();
  mainWindow.focus();

  // Open external http/https links in the user's default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    isTransitioningWindow = false;
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.close();
      launcherWindow = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    const cfg = readDesktopConfig();
    if (cfg.minimizeToTray && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.flashFrame(false);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown' && mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  await mainWindow.loadURL(targetUrl);

  // Schedule gentle background update check (15s after startup + every 30 min)
  const checkBgUpdate = async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const res = await fetchLatestManifest();
    if (res.updateAvailable && res.asarUrl && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('background-update-available', res);
    }
  };
  setTimeout(checkBgUpdate, 8_000).unref();
  if (bgUpdateTimer) clearInterval(bgUpdateTimer);
  bgUpdateTimer = setInterval(checkBgUpdate, 45 * 1000);
  bgUpdateTimer.unref();
}

// First-time Discord/Roblox-style self-installer into %LocalAppData%\Redshift
async function performFirstTimeInstall() {
  const sendProg = (percent, text, meta = '') => {
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.webContents.send('install-progress', { percent, text, meta });
    }
  };

  try {
    const srcDir = path.dirname(app.getPath('exe'));
    const destDir = getLocalInstallDir();

    sendProg(5, 'Preparing install directory...', destDir);
    fs.mkdirSync(destDir, { recursive: true });

    // Count all files first for smooth progress
    const filesToCopy = [];
    const walk = (dir, relBase = '') => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.toLowerCase() === 'd3dcompiler_47.dll') continue;
        const full = path.join(dir, entry.name);
        const rel = relBase ? path.join(relBase, entry.name) : entry.name;
        if (entry.isDirectory()) {
          walk(full, rel);
        } else {
          filesToCopy.push({ full, rel });
        }
      }
    };
    walk(srcDir);

    const total = Math.max(1, filesToCopy.length);
    for (let i = 0; i < filesToCopy.length; i += 1) {
      const item = filesToCopy[i];
      const outPath = path.join(destDir, item.rel);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.copyFileSync(item.full, outPath);
      if (i % 4 === 0 || i === filesToCopy.length - 1) {
        const pct = Math.min(82, 10 + Math.round(((i + 1) / total) * 72));
        sendProg(pct, 'Installing Redshift...', `${pct}%`);
        await new Promise((r) => setTimeout(r, 4));
      }
    }

    sendProg(88, 'Creating Desktop & Start Menu shortcuts...', '88%');
    const installedExe = path.join(destDir, path.basename(app.getPath('exe')));
    const iconCandidate = path.join(destDir, 'icon.ico');
    const iconTarget = fs.existsSync(iconCandidate) ? iconCandidate : installedExe;

    // Write clean uninstaller command
    const uninstallBat = path.join(destDir, 'uninstall-redshift.cmd');
    fs.writeFileSync(
      uninstallBat,
      [
        '@echo off',
        'taskkill /F /IM Redshift.exe >nul 2>&1',
        'del /F /Q "%USERPROFILE%\\Desktop\\Redshift.lnk" >nul 2>&1',
        'del /F /Q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Redshift.lnk" >nul 2>&1',
        'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Redshift" /f >nul 2>&1',
        'start "" /min cmd /c "timeout /t 2 /nobreak >nul & rmdir /s /q "%~dp0""',
      ].join('\r\n'),
      'utf8',
    );

    const psSetup = [
      `$sh = New-Object -ComObject WScript.Shell;`,
      `$exe = '${installedExe.replace(/'/g, "''")}';`,
      `$dir = '${destDir.replace(/'/g, "''")}';`,
      `$ico = '${iconTarget.replace(/'/g, "''")}';`,
      `$desk = [System.Environment]::GetFolderPath('Desktop');`,
      `$s1 = $sh.CreateShortcut((Join-Path $desk 'Redshift.lnk'));`,
      `$s1.TargetPath = $exe; $s1.WorkingDirectory = $dir; $s1.IconLocation = $ico; $s1.Description = 'Redshift Chat & Voice'; $s1.Save();`,
      `$start = [System.Environment]::GetFolderPath('Programs');`,
      `$s2 = $sh.CreateShortcut((Join-Path $start 'Redshift.lnk'));`,
      `$s2.TargetPath = $exe; $s2.WorkingDirectory = $dir; $s2.IconLocation = $ico; $s2.Description = 'Redshift Chat & Voice'; $s2.Save();`,
      `$reg = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Redshift';`,
      `New-Item -Path $reg -Force | Out-Null;`,
      `Set-ItemProperty -Path $reg -Name DisplayName -Value 'Redshift';`,
      `Set-ItemProperty -Path $reg -Name DisplayVersion -Value '${currentVersion.replace(/'/g, "''")}';`,
      `Set-ItemProperty -Path $reg -Name Publisher -Value 'Redshift';`,
      `Set-ItemProperty -Path $reg -Name InstallLocation -Value $dir;`,
      `Set-ItemProperty -Path $reg -Name DisplayIcon -Value $ico;`,
      `Set-ItemProperty -Path $reg -Name UninstallString -Value ('cmd.exe /c "' + '${uninstallBat.replace(/'/g, "''")}' + '"');`,
      `Set-ItemProperty -Path $reg -Name NoModify -Type DWord -Value 1;`,
      `Set-ItemProperty -Path $reg -Name NoRepair -Type DWord -Value 1;`,
    ].join(' ');

    await new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psSetup], {
        windowsHide: true,
      });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Shortcut setup exited ${code}`))));
      child.on('error', reject);
    });

    sendProg(100, 'Installed! Launching Redshift...', '100%');
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.webContents.send('install-complete', { version: currentVersion, destDir });
    }

    setTimeout(() => {
      spawn(installedExe, ['--just-installed'], {
        cwd: destDir,
        detached: true,
        stdio: 'ignore',
      }).unref();
      isQuitting = true;
      app.quit();
    }, 600);
  } catch (err) {
    console.error('[Redshift Desktop] First-time install error:', err);
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.webContents.send('install-error', {
        message: err instanceof Error ? err.message : 'Installation failed',
      });
    }
  }
}

// IPC Handlers
ipcMain.on('launcher-close', () => {
  isQuitting = true;
  app.quit();
});

ipcMain.on('app-quit', () => {
  isQuitting = true;
  app.quit();
});

ipcMain.on('relaunch-app', () => {
  isQuitting = true;
  app.relaunch();
  app.quit();
});

ipcMain.on('launcher-finished', async () => {
  if (isTransitioningWindow) return;
  isTransitioningWindow = true;
  try {
    await createMainWindow();
  } catch (err) {
    isTransitioningWindow = false;
    console.error('[Redshift Desktop] Failed to start main window:', err);
  }
});

ipcMain.on('start-first-time-install', () => {
  void performFirstTimeInstall();
});

ipcMain.on('initiate-update', () => {
  if (app.isPackaged) {
    // Relaunch a clean Redshift.exe process straight into update mode so the
    // Launcher always reads a fresh ASAR header table and releases any file locks.
    const exePath = process.execPath;
    const exeDir = path.dirname(exePath);
    const pid = process.pid;
    const psRelaunch = [
      `$pidToWait = ${pid};`,
      `$t = 40; while ((Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) -and ($t -gt 0)) { Start-Sleep -Milliseconds 120; $t--; }`,
      `Start-Sleep -Milliseconds 150;`,
      `Start-Process -FilePath '${exePath.replace(/'/g, "''")}' -ArgumentList '--update-now' -WorkingDirectory '${exeDir.replace(/'/g, "''")}';`,
    ].join(' ');

    spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psRelaunch], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();

    isQuitting = true;
    if (bgUpdateTimer) {
      clearInterval(bgUpdateTimer);
      bgUpdateTimer = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.destroy(); } catch (_) {}
      mainWindow = null;
    }
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      try { launcherWindow.destroy(); } catch (_) {}
      launcherWindow = null;
    }
    if (tray) {
      try { tray.destroy(); } catch (_) {}
      tray = null;
    }
    if (backgroundTunnelProc) {
      try { backgroundTunnelProc.kill(); } catch (_) {}
      backgroundTunnelProc = null;
    }
    if (embeddedServer) {
      try { embeddedServer.close(); } catch (_) {}
      embeddedServer = null;
    }
    app.exit(0);
    return;
  }

  isTransitioningWindow = true;
  createLauncherWindow('update');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }
  isTransitioningWindow = false;
});

ipcMain.handle('check-for-updates', async () => {
  return await fetchLatestManifest();
});

ipcMain.on('start-download-update', async () => {
  if (!launcherWindow || launcherWindow.isDestroyed()) return;
  try {
    const manifest = lastManifestResult?.updateAvailable
      ? lastManifestResult
      : await fetchLatestManifest();
    if (!manifest.updateAvailable) {
      if (launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.webContents.send('update-complete', {
          newVersion: currentVersion,
          hasFile: false,
          alreadyUpToDate: true,
        });
      }
      return;
    }
    if (!manifest.asarUrl) {
      throw new Error('No update package URL found in manifest');
    }

    const resourcesDir = app.isPackaged
      ? process.resourcesPath || path.join(path.dirname(app.getPath('exe')), 'resources')
      : path.join(__dirname, '../dist');
    fs.mkdirSync(resourcesDir, { recursive: true });
    const downloadAsar = path.join(resourcesDir, 'app.asar.download');

    launcherWindow.webContents.send('update-progress', {
      stage: 'connecting',
      percent: 0,
      currentVersion,
      latestVersion: manifest.latestVersion,
      text: `Downloading Redshift v${manifest.latestVersion}...`,
    });

    await downloadFileWithProgress(manifest.asarUrl, downloadAsar, (prog) => {
      if (launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.webContents.send('update-progress', {
          stage: 'downloading',
          percent: prog.percent,
          receivedBytes: prog.receivedBytes,
          totalBytes: prog.totalBytes,
          currentVersion,
          latestVersion: manifest.latestVersion,
          text: `Downloading update v${manifest.latestVersion} (${prog.percent}%)`,
        });
      }
    });

    if (!fs.existsSync(downloadAsar) || fs.statSync(downloadAsar).size < 16_384) {
      throw new Error('Downloaded update package is incomplete');
    }

    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.webContents.send('update-progress', {
        stage: 'verifying',
        percent: 100,
        text: 'Verifying SHA-256 package integrity...',
      });
    }

    if (manifest.sha256) {
      const actualHash = await computeFileSha256(downloadAsar);
      if (actualHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
        try { fs.unlinkSync(downloadAsar); } catch (_) {}
        throw new Error('Update integrity check failed (SHA-256 mismatch)');
      }
    }

    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.webContents.send('update-complete', {
        newVersion: manifest.latestVersion,
        hasFile: true,
      });
    }
  } catch (err) {
    console.error('[Redshift Desktop] Update error:', err);
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      launcherWindow.webContents.send('update-error', {
        message: err instanceof Error ? err.message : 'Update failed to download',
      });
    }
  }
});

ipcMain.on('apply-update-and-restart', () => {
  const resourcesDir = app.isPackaged
    ? process.resourcesPath || path.join(path.dirname(app.getPath('exe')), 'resources')
    : path.join(__dirname, '../dist');
  const targetAsar = path.join(resourcesDir, 'app.asar');
  const downloadAsar = path.join(resourcesDir, 'app.asar.download');

  if (app.isPackaged && fs.existsSync(downloadAsar)) {
    const exePath = process.execPath;
    const exeDir = path.dirname(exePath);
    const pid = process.pid;

    const psSwap = [
      `$pidToWait = ${pid};`,
      `$t = 50; while ((Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) -and ($t -gt 0)) { Start-Sleep -Milliseconds 150; $t--; }`,
      `Start-Sleep -Milliseconds 400;`,
      `$ok = $false; for ($i = 0; $i -lt 25; $i++) {`,
      `  try { Move-Item -LiteralPath '${downloadAsar.replace(/'/g, "''")}' -Destination '${targetAsar.replace(/'/g, "''")}' -Force -ErrorAction Stop; $ok = $true; break; }`,
      `  catch { Start-Sleep -Milliseconds 350; }`,
      `}`,
      `Start-Process -FilePath '${exePath.replace(/'/g, "''")}' -WorkingDirectory '${exeDir.replace(/'/g, "''")}';`,
    ].join(' ');

    spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psSwap], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();

    isQuitting = true;
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      try { launcherWindow.destroy(); } catch (_) {}
      launcherWindow = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.destroy(); } catch (_) {}
      mainWindow = null;
    }
    if (tray) {
      try { tray.destroy(); } catch (_) {}
      tray = null;
    }
    if (embeddedServer) {
      try { embeddedServer.close(); } catch (_) {}
      embeddedServer = null;
    }
    app.exit(0);
    return;
  }

  // Dev fallback: just launch the main window cleanly.
  isTransitioningWindow = true;
  void createMainWindow();
});

ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true,
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnailDataUrl: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL(),
    appIconDataUrl: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : '',
  }));
});

ipcMain.handle('select-desktop-source', (_event, payload) => {
  pendingDisplaySource = {
    sourceId: typeof payload?.sourceId === 'string' ? payload.sourceId : '',
    withAudio: Boolean(payload?.withAudio),
  };
  return { ok: true };
});

ipcMain.handle('get-desktop-config', () => {
  return {
    ...readDesktopConfig(),
    version: currentVersion,
    isPackaged: app.isPackaged,
    installDir: path.dirname(app.getPath('exe')),
    dataDir: process.env.REDSHIFT_DATA_DIR,
  };
});

ipcMain.handle('save-desktop-config', (_event, patch) => {
  return writeDesktopConfig(patch);
});

ipcMain.on('set-unread-count', (_event, count) => {
  const clean = Math.max(0, Math.floor(Number(count) || 0));
  if (tray) {
    tray.setToolTip(clean > 0 ? `Redshift — ${clean} unread` : 'Redshift');
  }
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused() && clean > lastUnreadCount) {
    mainWindow.flashFrame(true);
  }
  lastUnreadCount = clean;
});

ipcMain.on('open-external', (_event, rawUrl) => {
  if (typeof rawUrl === 'string' && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
    void shell.openExternal(rawUrl);
  }
});

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else if (launcherWindow && !launcherWindow.isDestroyed()) {
    if (launcherWindow.isMinimized()) launcherWindow.restore();
    launcherWindow.show();
    launcherWindow.focus();
  } else {
    void createMainWindow();
  }
});

app.whenReady().then(() => {
  setupNativeDisplayCapture();
  if (isUpdateNowFlag) {
    createLauncherWindow('update');
  } else if (shouldRunFirstTimeInstaller()) {
    createLauncherWindow('install');
  } else {
    createLauncherWindow('boot');
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (bgUpdateTimer) {
    clearInterval(bgUpdateTimer);
    bgUpdateTimer = null;
  }
  if (backgroundTunnelProc) {
    try { backgroundTunnelProc.kill(); } catch (_) {}
    backgroundTunnelProc = null;
  }
  if (embeddedServer) {
    try { embeddedServer.close(); } catch (_) {}
    embeddedServer = null;
  }
});

app.on('window-all-closed', () => {
  if (isTransitioningWindow) {
    return;
  }
  if (isQuitting || process.platform !== 'darwin') {
    if (isQuitting || !tray) {
      app.quit();
    }
  }
});

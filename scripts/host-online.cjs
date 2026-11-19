const { spawn, execSync, execFileSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const localCfBin = path.join(__dirname, 'cloudflared.exe');
const updaterCfgPath = path.join(rootDir, 'electron', 'updater-config.json');

function readGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
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
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

async function publishLiveUrlToGitHub(publicUrl) {
  let repo = 'redrepost84-ctrl/redshift';
  try {
    if (fs.existsSync(updaterCfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(updaterCfgPath, 'utf8'));
      if (cfg.githubRepo) repo = cfg.githubRepo.trim();
    }
  } catch (_) {}

  const payloadObj = {
    serverUrl: publicUrl,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(rootDir, 'online-server.json'),
    JSON.stringify(payloadObj, null, 2) + '\n',
    'utf8',
  );

  const token = readGitHubToken();
  if (!token || !repo) return false;

  try {
    const apiUrl = `https://api.github.com/repos/${repo}/contents/online-server.json`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Redshift-Online-Host',
    };
    let existingSha = undefined;
    const getRes = await fetch(apiUrl, { headers });
    if (getRes.ok) {
      const getJson = await getRes.json();
      existingSha = getJson?.sha;
    }
    const contentB64 = Buffer.from(JSON.stringify(payloadObj, null, 2) + '\n', 'utf8').toString('base64');
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Update live online server endpoint (${publicUrl})`,
        content: contentB64,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });
    return putRes.ok;
  } catch (_) {
    return false;
  }
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function findCloudflared() {
  const candidates = [
    localCfBin,
    'cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ];
  for (const bin of candidates) {
    try {
      execSync(`"${bin}" --version`, { stdio: 'ignore' });
      return bin;
    } catch (_) {}
  }
  return null;
}

function downloadFileWithRedirects(url, destPath) {
  return new Promise((resolve, reject) => {
    function get(currentUrl, hops = 0) {
      if (hops > 8) return reject(new Error('Too many redirects'));
      https
        .get(currentUrl, { headers: { 'User-Agent': 'Redshift-Host' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return get(res.headers.location, hops + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          const out = fs.createWriteStream(destPath);
          res.pipe(out);
          out.on('finish', () => out.close(() => resolve(destPath)));
          out.on('error', reject);
        })
        .on('error', reject);
    }
    get(url);
  });
}

async function ensureCloudflared() {
  const existing = findCloudflared();
  if (existing) return existing;
  if (process.platform !== 'win32') return null;
  console.log('[Host] Downloading official Cloudflare Tunnel binary (one-time setup, free)...');
  const tmpPath = `${localCfBin}.download`;
  try {
    await downloadFileWithRedirects(
      'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
      tmpPath,
    );
    fs.renameSync(tmpPath, localCfBin);
    return localCfBin;
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    console.warn('[Host] Could not auto-download cloudflared:', err.message);
    return null;
  }
}

async function main() {
  const lanIp = getLanIp();
  console.log('====================================================');
  console.log('  Redshift Worldwide Online Server Host (100% Free)');
  console.log('====================================================');
  console.log(`  Local URL : http://127.0.0.1:${PORT}`);
  console.log(`  LAN URL   : http://${lanIp}:${PORT}`);
  console.log('  Health    : /api/health');
  console.log('  Updates   : /api/desktop/version.json');
  console.log('====================================================\n');

  const serverProc = spawn(process.execPath, ['--no-warnings', 'server.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(PORT),
    },
    stdio: 'inherit',
  });

  let tunnelProc = null;
  const noTunnel = process.argv.includes('--no-tunnel');
  const cfBin = noTunnel ? null : await ensureCloudflared();

  if (cfBin) {
    console.log('[Host] Starting Cloudflare Quick Tunnel for worldwide HTTPS/WSS access...');
    tunnelProc = spawn(cfBin, ['tunnel', '--url', `http://127.0.0.1:${PORT}`], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let printedUrl = false;
    const handleTunnelOutput = (chunk) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !printedUrl) {
        printedUrl = true;
        const publicUrl = match[0];
        console.log('\n====================================================');
        console.log('  WORLDWIDE PUBLIC SERVER URL READY:');
        console.log(`  ${publicUrl}`);
        console.log('  Publishing live URL to GitHub directory so all');
        console.log('  Redshift clients auto-connect on startup...');
        console.log('====================================================\n');
        void publishLiveUrlToGitHub(publicUrl).then((ok) => {
          if (ok) {
            console.log(`[Host] Auto-discovery directory updated on GitHub (${publicUrl})`);
          }
        });
      }
    };
    tunnelProc.stdout.on('data', handleTunnelOutput);
    tunnelProc.stderr.on('data', handleTunnelOutput);
  }

  function shutdown() {
    if (tunnelProc) {
      try { tunnelProc.kill(); } catch (_) {}
    }
    try { serverProc.kill(); } catch (_) {}
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  serverProc.on('exit', (code) => {
    if (tunnelProc) {
      try { tunnelProc.kill(); } catch (_) {}
    }
    process.exit(code || 0);
  });
}

void main();

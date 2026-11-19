const { spawn, execSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const localCfBin = path.join(__dirname, 'cloudflared.exe');

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
        console.log('\n====================================================');
        console.log('  WORLDWIDE PUBLIC SERVER URL READY:');
        console.log(`  ${match[0]}`);
        console.log('  Anyone in the world can paste this URL into');
        console.log('  Redshift -> Switch Server to chat & call with you!');
        console.log('====================================================\n');
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

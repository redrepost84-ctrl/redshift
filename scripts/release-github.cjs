const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const publishDir = path.join(rootDir, 'publishedbuilds');
const manifestPath = path.join(publishDir, 'version.json');
const updaterCfgPath = path.join(rootDir, 'electron', 'updater-config.json');

if (!fs.existsSync(manifestPath)) {
  console.error('[Release] Missing publishedbuilds/version.json. Run "npm run publish:patch" or "npm run publish:desktop" first.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const updaterCfg = fs.existsSync(updaterCfgPath)
  ? JSON.parse(fs.readFileSync(updaterCfgPath, 'utf8'))
  : {};
const repo = (process.env.GITHUB_REPO || updaterCfg.githubRepo || 'redrepost84-ctrl/redshift').trim();
const tag = `v${manifest.version}`;
const skipInstaller = process.argv.includes('--patch-only');

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

async function ghFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Redshift-Release-Publisher',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { ok: res.ok, status: res.status, data: json, text };
}

async function main() {
  const token = readGitHubToken();
  if (!token) {
    console.error('[Release] No GitHub token found in GITHUB_TOKEN or Windows Credential Manager.');
    process.exit(1);
  }

  console.log('====================================================');
  console.log(`  Publishing Redshift ${tag} to GitHub Releases`);
  console.log(`  Repository: ${repo}`);
  console.log('====================================================');

  // 0. Ensure GitHub repository exists and push main branch
  const [owner, repoName] = repo.split('/');
  const repoCheck = await ghFetch(`https://api.github.com/repos/${repo}`, token);
  if (repoCheck.status === 404) {
    console.log(`[Release] Creating GitHub repository ${repo}...`);
    const cr = await ghFetch('https://api.github.com/user/repos', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: repoName,
        description: 'Redshift Desktop Chat, Voice and Screen Share',
        private: false,
      }),
    });
    if (!cr.ok) {
      console.error(`[Release] Failed to create repository ${repo}:`, cr.text);
      process.exit(1);
    }
  }

  if (!fs.existsSync(path.join(rootDir, '.git'))) {
    execSync('git init -b main', { cwd: rootDir, stdio: 'inherit' });
  }
  execSync('git add -A', { cwd: rootDir, stdio: 'inherit' });
  try {
    execSync(`git commit -m "Release Redshift ${tag}"`, { cwd: rootDir, stdio: 'inherit' });
  } catch (_) {}
  try {
    execSync('git remote remove origin', { cwd: rootDir, stdio: 'ignore' });
  } catch (_) {}
  execSync(`git remote add origin https://github.com/${repo}.git`, { cwd: rootDir, stdio: 'inherit' });
  execSync('git push -u origin main --force', { cwd: rootDir, stdio: 'inherit' });

  // 1. Check or create release for tag
  let relRes = await ghFetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, token);
  let release = relRes.ok ? relRes.data : null;

  if (!release) {
    console.log(`[Release] Creating new GitHub Release ${tag}...`);
    const createRes = await ghFetch(`https://api.github.com/repos/${repo}/releases`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tag,
        name: `Redshift ${tag}`,
        body: manifest.changelog || `Redshift Desktop ${tag}`,
        draft: false,
        prerelease: false,
      }),
    });
    if (!createRes.ok) {
      console.error(`[Release] Failed to create release (${createRes.status}):`, createRes.text);
      process.exit(1);
    }
    release = createRes.data;
  } else {
    console.log(`[Release] Updating existing GitHub Release ${tag}...`);
  }

  const uploadBaseUrl = release.upload_url.replace(/\{\?name,label\}$/, '');
  const existingAssets = Array.isArray(release.assets) ? release.assets : [];

  const filesToUpload = [
    { name: 'version.json', filePath: path.join(publishDir, 'version.json'), mime: 'application/json' },
    { name: 'Redshift-patch.asar', filePath: path.join(publishDir, 'Redshift-patch.asar'), mime: 'application/octet-stream' },
  ];
  const setupExe = path.join(publishDir, 'RedshiftSetup.exe');
  if (!skipInstaller && fs.existsSync(setupExe)) {
    filesToUpload.push({ name: 'RedshiftSetup.exe', filePath: setupExe, mime: 'application/vnd.microsoft.portable-executable' });
  }

  for (const item of filesToUpload) {
    if (!fs.existsSync(item.filePath)) continue;
    const prev = existingAssets.find((a) => a.name === item.name);
    if (prev) {
      console.log(`[Release] Replacing existing asset ${item.name}...`);
      await ghFetch(`https://api.github.com/repos/${repo}/releases/assets/${prev.id}`, token, {
        method: 'DELETE',
      });
    }
    const buf = fs.readFileSync(item.filePath);
    const mb = (buf.length / (1024 * 1024)).toFixed(2);
    console.log(`[Release] Uploading ${item.name} (${mb} MB)...`);
    const upRes = await ghFetch(
      `${uploadBaseUrl}?name=${encodeURIComponent(item.name)}`,
      token,
      {
        method: 'POST',
        headers: {
          'Content-Type': item.mime,
          'Content-Length': String(buf.length),
        },
        body: buf,
      },
    );
    if (!upRes.ok) {
      console.error(`[Release] Failed to upload ${item.name} (${upRes.status}):`, upRes.text);
      process.exit(1);
    }
  }

  console.log('\n====================================================');
  console.log(`  GITHUB RELEASE LIVE: ${release.html_url}`);
  console.log(`  Auto-Update Manifest: https://github.com/${repo}/releases/latest/download/version.json`);
  console.log(`  First-Time Installer: https://github.com/${repo}/releases/latest/download/RedshiftSetup.exe`);
  console.log('====================================================\n');
}

void main();

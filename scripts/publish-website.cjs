const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const updaterCfgPath = path.join(rootDir, 'electron', 'updater-config.json');
const updaterCfg = fs.existsSync(updaterCfgPath)
  ? JSON.parse(fs.readFileSync(updaterCfgPath, 'utf8'))
  : {};
const repo = (process.env.GITHUB_REPO || updaterCfg.githubRepo || 'redrepost84-ctrl/redshift').trim();

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
      'User-Agent': 'Redshift-Website-Publisher',
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
    console.error('[Website] No GitHub token found.');
    process.exit(1);
  }

  // Sync latest publishedbuilds/version.json into docs/version.json if present
  const pubVer = path.join(rootDir, 'publishedbuilds', 'version.json');
  const docsVer = path.join(rootDir, 'docs', 'version.json');
  if (fs.existsSync(pubVer)) {
    fs.copyFileSync(pubVer, docsVer);
  }

  // Stage, commit, and push docs/ to GitHub main
  execSync('git add docs scripts/publish.cjs scripts/publish-website.cjs', { cwd: rootDir, stdio: 'inherit' });
  try {
    execSync('git commit -m "Publish official Redshift download website (GitHub Pages)"', {
      cwd: rootDir,
      stdio: 'inherit',
    });
  } catch (_) {}

  const basicAuth = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  execSync(
    `git -c http.extraHeader="Authorization: Basic ${basicAuth}" push -u origin main`,
    {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    },
  );

  // Enable or update GitHub Pages serving from main /docs
  const pagesUrl = `https://api.github.com/repos/${repo}/pages`;
  const existing = await ghFetch(pagesUrl, token);
  let liveUrl = existing.data?.html_url || '';

  if (existing.status === 404) {
    console.log('[Website] Enabling GitHub Pages on branch main (/docs)...');
    const created = await ghFetch(pagesUrl, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        build_type: 'legacy',
        source: { branch: 'main', path: '/docs' },
      }),
    });
    if (!created.ok && created.status !== 409) {
      console.error('[Website] Failed to enable GitHub Pages:', created.status, created.text);
      process.exit(1);
    }
    liveUrl = created.data?.html_url || liveUrl;
  } else {
    await ghFetch(pagesUrl, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        build_type: 'legacy',
        source: { branch: 'main', path: '/docs' },
      }),
    });
  }

  const [owner, repoName] = repo.split('/');
  if (!liveUrl) {
    liveUrl = `https://${owner}.github.io/${repoName}/`;
  }

  // Set GitHub repo homepage to the live website
  await ghFetch(`https://api.github.com/repos/${repo}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ homepage: liveUrl }),
  });

  console.log('\n====================================================');
  console.log(`  OFFICIAL REDSHIFT WEBSITE CONFIGURED: ${liveUrl}`);
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('[Website] Unexpected error:', err);
  process.exit(1);
});

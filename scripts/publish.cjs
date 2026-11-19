const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version || '0.1.0';

// Optional CLI flags:
//   node scripts/publish.cjs --notes "Changelog summary"
//   node scripts/publish.cjs --bump patch|minor|major
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : '';
}

const bumpKind =
  getArg('--bump') ||
  args.find((a) => a === 'patch' || a === 'minor' || a === 'major') ||
  '';
let buildVersion = version;
if (bumpKind === 'patch' || bumpKind === 'minor' || bumpKind === 'major') {
  const parts = version.split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  if (bumpKind === 'major') {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (bumpKind === 'minor') {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }
  buildVersion = parts.join('.');
  pkg.version = buildVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`[Publish] Bumped version: ${version} -> ${buildVersion}`);
}

const changelog = getArg('--notes') || `Redshift Desktop v${buildVersion}`;
const patchOnly =
  args.includes('--patch-only') &&
  fs.existsSync(path.join(rootDir, 'publishedbuilds', 'Redshift', 'resources', 'app.asar')) &&
  fs.existsSync(path.join(rootDir, 'publishedbuilds', 'RedshiftSetup.exe'));
const publishDir = path.join(rootDir, 'publishedbuilds');
const tempOutDir = path.join(os.tmpdir(), `redshift-electron-build-${Date.now()}`);

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function run(cmd, extraEnv = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

console.log('====================================================');
console.log(`  Redshift Desktop Builder & Auto-Update Publisher`);
console.log(`  Version: v${buildVersion}`);
console.log('====================================================');

// 1. Ensure icons are freshly generated from official Textures/Icons/Icon.png
const iconSrc = path.join(rootDir, 'Textures', 'Icons', 'Icon.png');
const iconIco = path.join(rootDir, 'public', 'icon.ico');
const iconPng = path.join(rootDir, 'public', 'icon.png');
const iconNeedsRefresh =
  !fs.existsSync(iconIco) ||
  !fs.existsSync(iconPng) ||
  (fs.existsSync(iconSrc) &&
    (fs.statSync(iconSrc).mtimeMs > fs.statSync(iconIco).mtimeMs ||
      fs.statSync(iconSrc).mtimeMs > fs.statSync(iconPng).mtimeMs));
if (iconNeedsRefresh) {
  const genExe = path.join(rootDir, 'scripts', 'GenerateIcon.exe');
  if (fs.existsSync(genExe) && fs.existsSync(iconSrc)) {
    run(`"${genExe}" "${path.join(rootDir, 'public')}" "${iconSrc}"`);
  } else if (!fs.existsSync(iconIco) || !fs.existsSync(iconPng)) {
    throw new Error('Missing public/icon.ico or public/icon.png. Compile scripts/GenerateIcon.cs first.');
  }
}

// 2. Build Vite + TypeScript frontend
console.log('\n[1/4] Building TypeScript & Vite bundle...');
run('npm run build');

// Make sure icons are present in dist/ too
fs.copyFileSync(iconIco, path.join(rootDir, 'dist', 'icon.ico'));
fs.copyFileSync(iconPng, path.join(rootDir, 'dist', 'icon.png'));

const outInstaller = path.join(publishDir, 'RedshiftSetup.exe');
const outPatchAsar = path.join(publishDir, 'Redshift-patch.asar');
const outManifest = path.join(publishDir, 'version.json');
const outUnpacked = path.join(publishDir, 'Redshift');

function copyDirSafe(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.toLowerCase() === 'd3dcompiler_47.dll') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSafe(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

if (patchOnly) {
  console.log('\n[2/4] Fast Delta Patch Mode (--patch-only): Refreshing app.asar...');
  const unpackTmp = path.join(os.tmpdir(), `redshift-asar-patch-${Date.now()}`);
  const existingAsar = path.join(outUnpacked, 'resources', 'app.asar');
  run(`npx asar extract "${existingAsar}" "${unpackTmp}"`);
  const unpackDist = path.join(unpackTmp, 'dist');
  if (fs.existsSync(unpackDist)) {
    fs.rmSync(unpackDist, { recursive: true, force: true });
  }
  copyDirSafe(path.join(rootDir, 'dist'), unpackDist);
  copyDirSafe(path.join(rootDir, 'electron'), path.join(unpackTmp, 'electron'));
  copyDirSafe(path.join(rootDir, 'server'), path.join(unpackTmp, 'server'));
  const dataInsideTmp = path.join(unpackTmp, 'server', 'data');
  if (fs.existsSync(dataInsideTmp)) {
    fs.rmSync(dataInsideTmp, { recursive: true, force: true });
  }
  fs.copyFileSync(pkgPath, path.join(unpackTmp, 'package.json'));
  fs.copyFileSync(iconIco, path.join(unpackTmp, 'public', 'icon.ico'));
  fs.copyFileSync(iconPng, path.join(unpackTmp, 'public', 'icon.png'));
  run(`npx asar pack "${unpackTmp}" "${outPatchAsar}"`);
  fs.copyFileSync(outPatchAsar, existingAsar);
  // IMPORTANT: Never overwrite %LOCALAPPDATA%\Programs\Redshift\resources\app.asar directly here!
  // Overwriting app.asar while Redshift.exe is open corrupts Electron's in-memory ASAR byte offsets.
  // Installed apps will cleanly download Redshift-patch.asar and swap it after exit via the Launcher.
  try {
    fs.rmSync(unpackTmp, { recursive: true, force: true });
  } catch (_) {}
} else {
  // 3. Package Electron app + NSIS one-click first-time installer in temp dir
  //    (avoids Windows Controlled Folder Access blocking d3dcompiler_47.dll inside Documents)
  console.log(`\n[2/4] Packaging Windows Desktop App & One-Click Installer in ${tempOutDir}...`);
  fs.mkdirSync(tempOutDir, { recursive: true });

  try {
    run(
      `npx electron-builder --win nsis --x64 --publish never --config.directories.output="${tempOutDir}"`,
      {
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      },
    );
  } catch (err) {
    console.error('\n[Publish] electron-builder failed:', err.message);
    process.exit(1);
  }

  // 4. Collect release artifacts into publishedbuilds/
  console.log('\n[3/4] Collecting installer, delta patch & SHA-256 manifest...');
  fs.mkdirSync(publishDir, { recursive: true });

  const builtInstaller = path.join(tempOutDir, 'RedshiftSetup.exe');
  const builtAsar = path.join(tempOutDir, 'win-unpacked', 'resources', 'app.asar');

  if (!fs.existsSync(builtInstaller)) {
    throw new Error(`Expected NSIS installer not found at ${builtInstaller}`);
  }
  if (!fs.existsSync(builtAsar)) {
    throw new Error(`Expected app.asar not found at ${builtAsar}`);
  }

  fs.copyFileSync(builtInstaller, outInstaller);
  fs.copyFileSync(builtAsar, outPatchAsar);

  // Also copy unpacked portable folder (skipping d3dcompiler_47.dll for Controlled Folder Access safety)
  console.log('\n[4/4] Exporting unpacked Redshift folder for local testing...');
  if (fs.existsSync(outUnpacked)) {
    fs.rmSync(outUnpacked, { recursive: true, force: true });
  }
  const srcUnpacked = path.join(tempOutDir, 'win-unpacked');
  copyDirSafe(srcUnpacked, outUnpacked);

  // Clean up temp staging folder
  try {
    fs.rmSync(tempOutDir, { recursive: true, force: true });
  } catch (_) {}
}

const asarStat = fs.statSync(outPatchAsar);
const installerStat = fs.statSync(outInstaller);
const asarSha256 = sha256File(outPatchAsar);
const installerSha256 = sha256File(outInstaller);

const manifest = {
  version: buildVersion,
  releasedAt: new Date().toISOString(),
  changelog,
  asarUrl: 'Redshift-patch.asar',
  sha256: asarSha256,
  size: asarStat.size,
  installerUrl: 'RedshiftSetup.exe',
  installerSha256,
  installerSize: installerStat.size,
};

fs.writeFileSync(outManifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

console.log('\n====================================================');
console.log(`  BUILD COMPLETE — Redshift v${buildVersion}`);
console.log('====================================================');
console.log(`  1) First-Time Installer : publishedbuilds/RedshiftSetup.exe   (${mb(installerStat.size)})`);
console.log(`  2) Auto-Update Patch    : publishedbuilds/Redshift-patch.asar (${mb(asarStat.size)})`);
console.log(`  3) Update Manifest      : publishedbuilds/version.json`);
console.log(`     SHA-256 (patch)      : ${asarSha256}`);
console.log(`  4) Portable Preview Dir : publishedbuilds/Redshift/Redshift.exe`);
console.log('\nHow to ship this update (no Netlify / third-party site needed):');
console.log('  - GitHub Releases: Upload RedshiftSetup.exe, Redshift-patch.asar, and version.json');
console.log('    to a new Release on your repo, and set githubRepo ("owner/repo") in');
console.log('    electron/updater-config.json (or Settings -> Desktop & Updates).');
console.log('  - Self-Hosted Redshift Server: Drop version.json + Redshift-patch.asar into');
console.log('    publishedbuilds/ on your Redshift server — clients auto-fetch from');
console.log('    /api/desktop/version.json & /api/desktop/patch.asar!');
console.log('====================================================\n');

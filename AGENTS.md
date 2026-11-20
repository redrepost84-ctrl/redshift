# Redshift Workspace Rules — Automatic Online Server & Auto-Update Publishing

Whenever you finish implementing a feature, bug fix, UI change, or asset update in Redshift, **you MUST automatically publish the update and ensure the worldwide online server is active before ending your turn** — never ask the user to run these commands themselves:

1. **Verify Build & Tests:**
   - Run `npm run build` and `npm test` to confirm zero regressions.
2. **Keep the 24/7 Cloudflare Workers Cloud Server Updated & Healthy:**
   - The permanent worldwide Redshift server runs 24/7 on **Cloudflare Workers + SQLite Durable Objects** at `https://redshift-server.redrepost84.workers.dev` (listed in `online-server.json`). It stays online even when the user's PC is powered off and Antigravity is closed — **DO NOT start local `npm run host:online` / `trycloudflare.com` tunnels** or overwrite `online-server.json` with a temporary tunnel URL.
   - Whenever you change backend API/WebSocket logic in `server/redshiftServer.js` / `server/dbStore.js`, you **MUST mirror the same change into `cloudflare/worker.js` / `cloudflare/doStore.js`**, keep `cloudflare/wrangler.jsonc` `REDSHIFT_VERSION` aligned, and deploy to Cloudflare using the `CLOUDFLARE_API_TOKEN` stored in local gitignored `.env`:
     ```powershell
     Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }
     cd cloudflare; .\node_modules\.bin\wrangler.cmd deploy
     ```
   - Verify `https://redshift-server.redrepost84.workers.dev/api/health` returns `200 OK` before ending your turn.
3. **Automatically Bump, Package & Publish the Update to GitHub Releases:**
   - Run:
     ```powershell
     node scripts/publish.cjs --patch-only --bump patch --notes "<short summary of what changed>"
     node scripts/release-github.cjs --patch-only
     ```
   - This updates `publishedbuilds/Redshift-patch.asar`, `publishedbuilds/Redshift/resources/app.asar`, and `publishedbuilds/version.json`, pushes the commit (including the latest `online-server.json`) to `https://github.com/redrepost84-ctrl/redshift`, and uploads `version.json` + `Redshift-patch.asar` to the new GitHub Release tag so every user's Redshift Launcher auto-updates immediately.
   - Only run the full `npm run publish:desktop` (instead of `publish:patch`) if Electron main/preload dependencies or the NSIS installer configuration itself changed.
4. **Keep the Official Download Website (`docs/`) Updated on Every Release:**
   - Official website URL: `https://redrepost84-ctrl.github.io/redshift/` (served by GitHub Pages from `main` branch `/docs`).
   - Whenever you publish a new Redshift release or add/change major features, **always update `docs/` before pushing** (keep `docs/index.html` feature highlights, fallback version strings, and `docs/app.js` `FALLBACK_RELEASES` aligned with the new release, and ensure `docs/version.json` is synced — `scripts/publish.cjs` automatically refreshes `docs/version.json` and `scripts/release-github.cjs` pushes `docs/` to `main`, automatically redeploying GitHub Pages; for website-only edits, run `node scripts/publish-website.cjs`).
   - Do **NOT** add fake/inaccurate app UI mockups to the website; keep the landing page clean, minimal, and focused on downloading Redshift, real features, install steps, live server status, and live release notes.

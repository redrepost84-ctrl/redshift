# Redshift Workspace Rules — Automatic Online Server & Auto-Update Publishing

Whenever you finish implementing a feature, bug fix, UI change, or asset update in Redshift, **you MUST automatically publish the update and ensure the worldwide online server is active before ending your turn** — never ask the user to run these commands themselves:

1. **Verify Build & Tests:**
   - Run `npm run build` and `npm test` to confirm zero regressions.
2. **Ensure Worldwide Online Server (`npm run host:online`) Is Running:**
   - Check if the `npm run host:online` background daemon (or port `8080` + `cloudflared` tunnel) is active and reachable via `/api/health`.
   - If `server/` did NOT change and the live tunnel is healthy (`200 OK`), **DO NOT restart `npm run host:online`** (keep the live tunnel URL uninterrupted for connected users).
   - If `server/redshiftServer.js` / `server/` changed and `host:online` is running with hot-reload support, prefer touching `.reload-server` in the project root to restart only `server.js` without dropping the live `cloudflared` tunnel URL; otherwise start/restart `cmd.exe /c "npm.cmd run host:online"` with `IsDaemon: true`, wait for it to write the live `https://....trycloudflare.com` URL into `online-server.json`, and verify `<serverUrl>/api/health` returns `200 OK`.
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

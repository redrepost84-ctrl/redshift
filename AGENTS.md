# Redshift Workspace Rules — Automatic Online Server & Auto-Update Publishing

Whenever you finish implementing a feature, bug fix, UI change, or asset update in Redshift, **you MUST automatically publish the update and ensure the worldwide online server is active before ending your turn** — never ask the user to run these commands themselves:

1. **Verify Build & Tests:**
   - Run `npm run build` and `npm test` to confirm zero regressions.
2. **Ensure Worldwide Online Server (`npm run host:online`) Is Running:**
   - Check if the `npm run host:online` background daemon (or port `8080` + `cloudflared` tunnel) is active and reachable via `/api/health`.
   - If it is not running (or if `server/redshiftServer.js` / `server/` changed), start or restart `cmd.exe /c "npm.cmd run host:online"` with `IsDaemon: true`, wait for it to write the live `https://....trycloudflare.com` URL into `online-server.json`, and verify `<serverUrl>/api/health` returns `200 OK`.
3. **Automatically Bump, Package & Publish the Update to GitHub Releases:**
   - Run:
     ```powershell
     node scripts/publish.cjs --patch-only --bump patch --notes "<short summary of what changed>"
     node scripts/release-github.cjs --patch-only
     ```
   - This updates `publishedbuilds/Redshift-patch.asar`, `publishedbuilds/Redshift/resources/app.asar`, and `publishedbuilds/version.json`, pushes the commit (including the latest `online-server.json`) to `https://github.com/redrepost84-ctrl/redshift`, and uploads `version.json` + `Redshift-patch.asar` to the new GitHub Release tag so every user's Redshift Launcher auto-updates immediately.
   - Only run the full `npm run publish:desktop` (instead of `publish:patch`) if Electron main/preload dependencies or the NSIS installer configuration itself changed.

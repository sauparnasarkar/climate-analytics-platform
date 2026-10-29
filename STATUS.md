# STATUS

Follow-ups recorded so they are not lost. Not a changelog: `SPEC.md` has the history.

## Rename to Degrees of Carbon: cutover not done yet

The code is merged or in review (#58 name and copy, #59 hosts and the old-origin switch, #60 back-end allow-lists, this PR for the docs).
**Nothing is deployed.** Target: production by Nov 6 (before the Nov 9-11 freeze), or after Nov 11.

- **New origin:** `degreesofcarbon.syena.io` (production, :4173), `degreesofcarbon-preview.syena.io` (preview, :4273).
- **Old origin:** `climate-analytics.syena.io` and `climate-analytics-preview.syena.io`: kill-switch `/sw.js` plus redirects, kept indefinitely.
- **Cutover order** (each step only after the one before is checked):
  1. Cloudflare, new hosts: public hostnames with the same ordered path rules as the old ones (`^/api` :8081, `^/mcp` :8765, `^/agent` :8766, catch-all :4173; preview catch-all :4273), the hostname-scoped WAF, rate-limit, cache and transform rules copied, and **Access**: `/admin`, `/agent/admin` (login policy) and `/mcp` (Service Auth) added to the Access application *before* the hostname resolves. Check `curl -I https://degreesofcarbon.syena.io/admin` redirects to the Access login, and `/api/health` is 200 through the host.
  2. Preview first: merge #58-#60; on the mini, deploy the preview checkout (`NODE_BIN_DIR=$HOME/node/bin NO_PULL=1 deploy/preview/deploy-preview.sh`); check the new preview host; then the sign-off.
  3. Production: deploy `main` (design system at the pin, build with `DEPLOY_BASE_PATH=/`), `launchctl kickstart -k` for `uvicorn`, `mcpserver`, `agent`, `vitepreview`; check the new host.
  4. Retire the old origin, **both together**: `RETIRE_OLD_ORIGIN=1` in the `vitepreview` job's environment (edit the plist, then `launchctl bootout` + `bootstrap`; kickstart keeps the old environment) and the same for the preview instance, and the Cloudflare redirect rule (host is the old host and path is not `/sw.js`, redirect to the new origin with the path and query kept).
- **Rollback:** remove the Cloudflare redirect rule, remove `RETIRE_OLD_ORIGIN` from the plist (bootout + bootstrap) so the old host serves the app again. Browsers that already moved stay on the new origin, which keeps working. Rollback copies of `dist` are in `~/ClaudeWorkspace/rollback/`.
- **Not carried over:** the theme preference (per-origin `localStorage`) and any installed home-screen app on the old origin (reinstall from the new one).
- **Left unchanged on purpose:** repo and folder names, the MCP server name (`ghg-emissions-analysis-mcp...`), launchd labels (`com.ghgemissions.*`), service names, the theme storage key `climate-analytics-theme`, the pipeline's HTTP `User-Agent` (`climate-emissions-pipeline/1.0 (+https://climate-analytics.syena.io)`, `pipeline/common.py`, a pipeline file), and test fixtures that use the old host as an example URL.
- **Checks that name a hostname:** none in the repo or on the mini. The `com.ghgemissions.vitepreview` health check probes `http://127.0.0.1:4173/`, the uptime script `~/bin/syena-apps-healthcheck.sh` probes loopback, and the data refresh (`pipeline/ops/ghg-data-refresh.sh`, Nov 10 03:30) does not use the public hostname.
- **Client configs that name the old URL (not changed):** `~/Library/Application Support/Claude/claude_desktop_config.json` (remote MCP, `https://climate-analytics.syena.io/mcp`) and `~/.claude/settings.json` line 71 (descriptive text). The MCP URL keeps working through the 308 redirect, but should be repointed to `https://degreesofcarbon.syena.io/mcp`.

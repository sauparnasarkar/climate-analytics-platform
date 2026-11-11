# STATUS

Follow-ups recorded so they are not lost. Not a changelog: `SPEC.md` has the history.

## Degrees of Carbon: live since 2026-10-29

- **Origins:** production `degreesofcarbon.syena.io`, preview `degreesofcarbon-preview.syena.io`. The old hosts `climate-analytics.syena.io` and `climate-analytics-preview.syena.io` stay on the tunnel indefinitely and only retire visitors.
- **Old-origin switch:** `RETIRE_OLD_ORIGIN=1` is set in the production `vitepreview` plist (and the preview instance's environment). On a retired host `/sw.js` is a kill-switch worker (200, `no-store`, never a redirect: claims the tab, clears caches, unregisters, moves it to the same path on the new origin) and every other front-end path is a 301 to the same path and query. The Cloudflare redirect rule (host is the old host, path is not `/sw.js`, dynamic target, query kept) covers the paths the tunnel sends straight to a back end (`/api`, `/mcp`, `/agent`) as well. Plist backup: `~/Library/LaunchAgents/com.ghgemissions.vitepreview.plist.pre-retire-20261029`.
- **Rollback:** disable the Cloudflare redirect rule, remove `RETIRE_OLD_ORIGIN` from the plist (`launchctl bootout` + `bootstrap`; kickstart keeps the old environment) and the old host serves the app again. Browsers that already moved stay on the new origin, which keeps working. Previous front end: `~/ClaudeWorkspace/rollback/dist-before-6ce64a3-was-fa15087`.
- **Not carried over:** the theme preference (per-origin `localStorage`) and any installed home-screen app of the old origin (reinstall from the new one).
- **Left unchanged on purpose:** repo and folder names, the MCP server name (`ghg-emissions-analysis-mcp...`), launchd labels (`com.ghgemissions.*`), service names, the pipeline's HTTP `User-Agent` (`pipeline/common.py`, a pipeline file), the generic phrase "climate analytics platform" in README and CLAUDE.md, and test fixtures using the old host as an example URL.
- **Checks that name a hostname:** none. The front-end health check and the uptime script probe loopback; the monthly data refresh does not use the public hostname.
- **Still to repoint by hand:** `~/Library/Application Support/Claude/claude_desktop_config.json` (remote MCP, still `https://climate-analytics.syena.io/mcp`) and `~/.claude/settings.json` line 71 (descriptive text). The Cloudflare redirect rule answers a POST with a 301, which many clients turn into a GET, so the MCP client may stop working until it is repointed to `https://degreesofcarbon.syena.io/mcp` (a 308 in the rule would keep the method).

## Chart colours: follow-ups from §5.34 (2026-11-10)

- **`SHARE_PALETTE`** (`climate-dashboard-react/src/lib/shareBars.ts`, used by `ShareSection.tsx` on Overview's share view) is a separate ten-colour palette, beyond the design system's eight categorical slots, so it was left out of §5.34. Its colours are not validated by the design system and do not follow the theme. Revisit if the share view needs to match a chart's key.
- **Ask `compare_scenarios_across_countries` chart** (`CompareScenariosWidget` in `climate-dashboard-react/src/agent/WidgetRenderer.tsx`): one line per country and scenario ("China — BAU"), coloured by position, up to 10 countries × 3 scenarios, beyond the eight slots. Its colours cannot follow §5.34's one-colour-per-pathway rule without a second cue (dash per scenario, colour per country, or one panel per scenario as Scenario Comparison does). Left as is.

## Dependencies: follow-ups from the security triage (2026-11-11)

- **Upgrade `vite-plugin-pwa` 1.x to 2.x** (`climate-dashboard-react/package.json`, currently `^1.3.0`). `npm audit` flags `glob` GHSA-3g3m-2fjr-6pw4 (moderate, AbortSignal cancellation bypass; `>=9.0.0 <=14.0.1`) through `vite-plugin-pwa` → `workbox-build` → `glob`. Build-time only: `npm audit --omit=dev` is clean and nothing reaches the shipped site. The fix is a major-version upgrade that may change the PWA build, so it is its own piece of work: read the 2.x migration notes, then check the generated `sw.js`/manifest, the update prompt, offline behaviour and the old-origin kill-switch worker (`RETIRE_OLD_ORIGIN`, above) on the preview before production.
- **`deepmerge` Dependabot alert #56** (low, GHSA-gcqx-w48m-w2h4): build-time only, through `@rollup/plugin-node-resolve` under `vite-plugin-pwa`. No patched version exists yet; left open on purpose. Recheck after the upgrade above or when a fix is published.
- **CodeQL #1–#5** were dismissed as false positives on 2026-11-11, each with its reason in the Security tab (two test assertions on lists or fixed strings, and an e-mail redaction regex writing Markdown). Dependabot #58 (`minimatch`) was fixed by #109.

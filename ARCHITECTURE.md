# Architecture

A current-state description of how this system is actually built, as of `SPEC.md` v44.
Unlike `SPEC.md` (weekly curriculum requirements + a versioned decision log), this document doesn't
narrate history — it describes what exists today. For *why* a given piece is shaped the
way it is, follow the `SPEC.md §` cross-references
inline rather than expecting the reasoning to be repeated here.

---

## 1. Two parallel deliverables, one dataset

This repo contains two genuinely separate things sharing the same `data/` pipeline:

- **The notebook project** (`SPEC.md` §§1–2): five per-week Jupyter notebooks
  (`notebook/week1_eda.ipynb` … `week5_scenarios.ipynb`) producing a documented analysis,
  plus an optional Streamlit app (`app.py`).
- **The reference architecture** (`SPEC.md` §5): a FastAPI
  backend (`api/`) and a React + TypeScript dashboard (`climate-dashboard-react/`)
  exposing the same computations as a production-shaped web app — a separate example of a
  full data-engineering + front-end stack on top of the same analysis.

Both read from the same `data/` CSVs; neither depends on the other at runtime.

A third strand, `services/mcp-server/` (§7), is joining the second group — it's a client of
`api/` (over HTTP, not the shared `data/` pipeline directly), so it doesn't fit this section's
"reads from `data/`" framing, but the same boundary applies to it: it belongs with the reference architecture, not the notebook project.

## 2. Data pipeline

```
data/owid-co2-data.csv (manual download, ~50MB, gitignored)
        │
        ▼
notebook/week1_eda.ipynb ──▶ data/ghg_filtered.csv, data/selected_countries.json
        │
        ▼
notebook/week2_features.ipynb ──▶ data/ghg_features.csv
        │
        ▼
notebook/week3_regression.ipynb ──▶ data/model_comparison_regression.csv, data/feature_importance.csv
        │
        ▼
notebook/week4_ets_forecasting.ipynb ──▶ data/ets_forecasts.csv, data/ets_parameters.csv, data/model_comparison.csv
        │
        ▼
notebook/week5_scenarios.ipynb (optional) ──▶ data/scenario_projections.csv
```

Every notebook runs independently, loading whatever the previous week already wrote —
`notebook/constants.py` is the single source of truth for shared constants
(`FEATURED_COUNTRIES`, `NON_SOVEREIGN`, `FEATURES`, `TARGET`, `TRAIN_CUTOFF`,
`FORECAST_END`, …), imported via `from constants import *`, never redefined inline.

**Consumers read the same CSVs, not each other.** `app.py` (`@st.cache_data`) and
`api/data_loaders.py` (`@lru_cache(maxsize=1)`) each independently load and cache the
same files in-process — the two loader modules are hand-mirrored 1:1, not shared code.
Cache invalidation is "restart the process" (a deploy, or the monthly refresh below); there
is no explicit invalidation path.

**Monthly automated refresh** (`pipeline/ops/ghg-data-refresh.sh`, `com.ghgemissions.datarefresh`
launchd agent, **the 10th of each month 03:30** local on the Mac Mini): re-downloads `owid-co2-data.csv` (URL read from `notebook/constants.py`) and
re-runs the full notebook pipeline non-interactively (`jupyter nbconvert --execute`
writing the executed copies to `data/notebook-runs/`, stopping at the first failure), validating the new download against the previous
backup inside `week1_eda.ipynb` (hard-fail / soft-flag thresholds, see `SPEC.md` §6.1) and
restoring the backup (mtime preserved) on failure. Once the OWID file is final it runs the
Area 2 pipeline stage below (its own failure domain), and after a validated refresh it
**restarts `com.ghgemissions.uvicorn`** (`launchctl kickstart -k`) because the API's `@lru_cache` loaders only see new CSVs after a
restart; a failed restart is reported, never fatal. One ntfy push per run carries the notebook
outcome plus the pipeline summary (priority = the higher of the two). The versioned script lives in
`pipeline/ops/` and the plist template in `deploy/launchd/`.

### Area 2 climate-context pipeline (`pipeline/`)

Separate from the notebooks: one versioned ingestion module per
source, run by `python -m pipeline.run`, writing a normalized store to `data/climate/`
(gitignored) that the `/api/correlation/*` domain (§4) reads.

```
NOAA GML Mauna Loa + Law Dome ice core ─▶ co2_concentration_{annual,monthly_mlo}.csv
Berkeley Earth High-Res Land/Ocean (prelim.) ─▶ temperature_anomaly_annual.csv  (+ computed 1850–1900 offset)
PRIMAP-hist (Zenodo, latest release)   ─▶ primap_{country_annual,global_composition_annual}.csv, country_crosswalk.csv
OWID (the file the refresh job downloaded; registered, not re-downloaded)
                                       ─▶ owid_world_co2_annual.csv
        every series ─▶ provenance.json (source, release, checksums, coverage, licence, citations)
        every run    ─▶ last_run.json + last_run.{priority,title,message}  (→ the refresh job's ntfy push)
EDGAR (shelved: IEA CC BY-NC-ND fuel-combustion CO₂) ─▶ data/internal/edgar/ only, never data/climate/
```

Each source validates before publishing (missing years raise, source checksums verified,
trailing incomplete years excluded rather than extrapolated) and reports *deviations from
norm* (stale source, licence change, completeness exclusions, reconciliation gaps) that the
refresh job turns into alerts. The monthly schedule, the `pipeline_stage` and the post-refresh API restart are versioned in
`pipeline/ops/` and deployed. Design
and decisions: `SPEC.md` §5.26.

## 3. The two/three-tier country pattern

`FEATURED_COUNTRIES` (10, hardcoded) is the original curated set, still the default
everywhere a fixed-size UI needs one (5×2 subplot grids, seeded picker defaults).
`get_expanded_countries()` (`notebook/constants.py`) / `load_expanded_countries()`
(`api/data_loaders.py`) load a data-driven ~40-country set (coverage + materiality
thresholds, computed in Week 1 §1.2, persisted to `data/selected_countries.json`), used
everywhere else — per-country training loops, aggregate sums, any interactive picker's
searchable pool. The Overview page extends this into three simultaneous tiers (All
Countries / Expanded / Selected) rather than picking one. Full rationale in `CLAUDE.md`'s
"Key Design Decisions" and `SPEC.md` §5.6–§5.7.

## 4. Backend (`api/`)

FastAPI (`0.139.2`) + Uvicorn (`0.51.0`), one router per dashboard page
(`api/routers/{overview,historical,country_profile,forecasts,scenarios,explorer,countries}.py`),
Pydantic response models (`api/schemas.py`). Mirrors `app.py`'s pandas logic
endpoint-by-endpoint — same computations, same cache shape, different transport.

**Climate-context endpoints** (`api/routers/correlation.py`, `api/climate_loaders.py`,
`api/schemas_correlation.py`): seven read-only
`GET /api/correlation/*` endpoints (`meta`, `concentration`, `temperature`,
`emissions-temperature`, `ghg-composition`, `country-share`, `scenario-temperature`) over what
`pipeline/` wrote to `data/climate/` (directory overridable with `CLIMATE_DATA_DIR`). `api/` does
not import `pipeline/`: the two meet at the files. Nothing is recomputed per request; a missing
file, a stage's explicit-null output (`unavailable_reason`), an unsupported `schema_version`, a
non-finite number, or a CSV that disagrees with its JSON metadata is a 503 naming the cause, never
a 200 with nulls to chart. Every response carries one envelope (`schema_version`, `generated_at`,
`note`, `caveats`, `attribution`, `source_vintage`), so licences and the interpretive-context
note travel with the numbers. A published regression fit is attached only when its window matches
the served pair exactly; nothing is fitted on the fly. The API tests build their climate directory
by running the real `pipeline` stages on small stubbed inputs, so a pipeline schema change breaks
them rather than production.

**Deploy-prefix handling** (`api/main.py`): `DEPLOY_BASE_PATH` (same env var the frontend
build reads, see §6) is normalized and used two ways — `root_path=DEPLOY_PATH_PREFIX` on
the `FastAPI()` instance so Starlette's own URL generation (`/docs`, `/redoc`,
`openapi.json`) stays prefix-aware, and a `StripDeployPrefixMiddleware` that actually
strips the prefix from `scope["path"]`/`scope["raw_path"]` before routing — necessary
because Cloudflare Tunnel forwards the *full* prefixed path with no stripping of its own,
while every route is mounted at plain `/api/...`. `redirect_slashes=False` throughout,
since Starlette's trailing-slash redirect builds its `Location` header from the
un-prefixed path regardless of `root_path`, which would otherwise redirect to a broken URL.

**Tests**: `pytest api/tests` — every endpoint's happy path, 4xx/503 error paths, and
pandas edge cases, against small fixture CSVs written to a temp dir rather than the real
(gitignored) data.

## 5. Frontend (`climate-dashboard-react/`)

React (`19.2.7`) + TypeScript + Vite (`8.1.1`), React Router (one page per route:
Overview, Climate Correlation, Historical Trends, Country Profile, Data Explorer, Forecasts,
Scenario Comparison, and Methods & data at `/about` — `src/navigation.ts`'s `NAV_ITEMS`, in that order; the
landing page at `/` and the agent at `/ask` sit outside it), a typed fetch client (`src/api/`) mirroring
`api/schemas.py`, AG Grid for tabular data, Plotly (via `@syena/ds`'s `Chart`) for
charts.

### Area 2 pages (Landing, Overview climate layer, `/climate-correlation`, Methods & data)

Routes: `/` (Landing), `/overview`, `/climate-correlation`, `/about` (Methods & data) (see `SPEC.md` §5.26 and, for the
consolidation that gave each visual one owning page, §5.29–5.33). Patterns worth knowing before changing them:

- **Each visual has one owning page; elsewhere it gets at most a line and a link.** Home: the story and the way in
  (a compact chain row, the cumulative ranking race, the globe). Overview: who emits (the map, tiers, shares, By Country).
  Climate Correlation: emissions and warming (the chain, the relationship, all-gas, gas composition). Historical Trends and
  Country Profile: drill-down, with Top Movers and % Change on Historical (own `?year=`). Forecasts and Scenario Comparison:
  projections, including the implied temperature by scenario. Methods & data: how every number is made and where the data
  comes from. Every other page carries a two-line `MethodNote` with a "Method →" link to its section (`lib/methodology.ts`
  holds the anchors).

- **Every shown figure comes from `/api/correlation/*`.** Typed `lib/` builders turn responses into view models
  (`climateSignal`, `headline`, `allGas`, `gasComposition`, `scenarioView`, `methodology`, `derivation`, `movers`, `cumulative`);
  a missing value is omitted, never drawn as zero. Fixed copy is limited to baseline/source labels, the IPCC AR6
  range and the methodology table. `lib/climateCopy.ts` holds the guardrail wording (descriptive, not a climate
  model; the all-gas view is never called TCRE).
- **Independent sections.** Each section renders from its own request state (`useAsync`; `useClimateSignal` runs
  four independent requests), so one failing endpoint leaves the others on screen.
- **One page year.** `usePageYear` owns the Overview's year (synced to `?year=`), shared by the map, tier cards,
  share bars and By Country (`lib/yearViews.ts`, computed client-side to match the API); `useYearAnimation` drives Play.
  There is no Year control in the header: the map's Play, decade stops and slider move the year, and the Share section's
  Replay animates 1970 → that year. Historical Trends' Top Movers and % Change (`lib/movers.ts`) have their own Year control.
- **The sources table reads everything from `/correlation/meta`.** Each public source's provenance entry carries its landing
  pages, short citation and short licence (`landing_links`, `short_citation`, `short_license`, from `pipeline/presentation.py`,
  added by `write_provenance`); the dashboard keeps no list of its own. `python -m pipeline.presentation` adds them to an
  existing `provenance.json` without refetching any source.
- **The ranking race is cumulative.** Home's Top 10 ranks on everything emitted since the API's `cumulative_from`, built as the
  Overview's Cumulative map is built (`lib/cumulative.ts`: one all-countries snapshot plus the running sum of the annual
  values the page holds); if the snapshot is unavailable the race is left out, not shown on another basis.
- **Sticky anchor rows + deep links.** `StickyAnchorRow`/`AnchorScroll` give both pages one scrolling line on phones;
  `useJumpToHashOnLoad` waits for the target and the measured row height before scrolling, so a hash lands correctly
  after async content loads.
- **Contrast.** The design system tunes its text and surface tokens (`--syn-color-*`) per theme, so each theme meets
  contrast on its own surfaces. Chart panels stay dark in both themes (the `--syn-data-panel-*` tokens); the app adds only
  `--area2-warning`/`--area2-link`.

### Design system integration

Built on `@syena/ds`, the Syena design system: a separate checkout of `syena-design-system` that sits beside this
repo (`../syena-design-system` from the repo root), not a submodule. It provides the tokens, the night (dark) and
tidewater (light) themes and the component catalog; for those, see its `FOUNDATIONS.md`. This section covers only how
*this app* consumes it.

- **Sourced, not published.** `vite.config.ts`, `vitest.config.ts` and the tsconfigs alias `@syena/ds` to the
  checkout's `src/index.ts` and `@syena/ds/styles.css` to its `src/styles.css`. There is no installed package and no
  version to bump: a change merged to the design system's `main` reaches this app when its checkout is pulled and the
  app rebuilt (deploy sequencing, §6). `SYN_DS_PATH` points the aliases at a checkout somewhere else.
- **Pinned commit, generated tokens.** `climate-dashboard-react/syena-design-system.pin` records the design system
  commit this app is built and tested against, and `scripts/setup-design-system.sh` clones it beside this repo at that
  commit. The design system's generated token files are not committed: run `npm run tokens` in its checkout after
  pulling it (and `npm ci` there if its dependencies changed), before building this app. The script does both.
- **Single React instance.** Because the design system's components run inside this app's own bundle rather than as an
  installed package, `react`/`react-dom` are aliased to this app's `node_modules` copies explicitly — two copies would
  break hooks.
- **The source strip's control is a link.** `DashboardLayout` passes `SourceStrip` `detailsLabel`, `detailsHref` and
  `onDetailsClick`, so the control at the foot of every page is a Methods & data link that navigates within the app. The
  design system's `Globe` hides the later of two overlapping labels, which is why the Home globe can name ten countries.
- **A design-system change is its own PR, then a pin bump.** Change `syena-design-system` in its repo, merge it, then
  bump `syena-design-system.pin` here. A PR that only bumps the pin needs no code review; one that also changes the app does.
- **One theme, set at the shell.** `App.tsx` wraps every route in `SynThemeProvider`, which applies the night or the
  tidewater theme; individual pages don't opt in or out. The visitor chooses System, Light or Dark (`ThemeToggle`); System,
  the default, follows `prefers-color-scheme` live and stores nothing, Light and Dark are kept in `localStorage` under
  `degrees-of-carbon-theme` (`src/lib/theme.ts`). The provider owns the choice; the app adds only that choosing System removes
  the stored key, and a one-time migration (`migrateLegacyTheme`, run in `main.tsx`) carries a choice from the old
  `climate-analytics-theme` key.

### PWA / service worker

`vite-plugin-pwa` (Workbox, `registerType: 'prompt'`): a new version waits, and the visitor is offered a Reload
banner only when a worker is really waiting on a page that is already controlled (`src/pwa/updates.ts`); Reload tells
the waiting worker to take over and reloads once it has. `NetworkFirst` for `/api/*`
(data freshness matters more than offline access for a live dashboard; 5s timeout before
falling back to cache), default precache-then-serve for the built JS/CSS/icons.
`navigateFallbackDenylist` excludes any path with a file extension from the SPA-shell
fallback, so a direct link to a static asset (a PDF in `public/`, say) opens it
instead of resolving to `index.html`.

### Deploy-prefix handling

`DEPLOY_BASE_PATH` is read by both `vite.config.ts`
(`normalizeBase`, sets Vite's own `base` + rewrites the dev/preview `/api` proxy target)
and `api/main.py` (`_normalize_deploy_prefix`, §4) from the **same** env var, so the two
can't drift on what prefix is being stripped. Must be set at *build* time for the
frontend, not just serve time — the prefix is baked into the built assets. Production is served
from the **host root** of `degreesofcarbon.syena.io` (`SPEC.md` §5.25), so its value is
`/`; a prefix (the retired `labs.syena.io/app-prefix/` deploy used one) still works.
`services/agent` is the exception among the services: its routes are bare (`/query`,
`/admin/llm`) and the tunnel forwards `/agent/...` unstripped, so its value is `/agent/`.

### Tests

`npx vitest run` (`climate-dashboard-react/`) — API client URL/param construction plus a
loading/data/error smoke test per page, mocking `api/client.ts` rather than hitting a live
backend; `Chart` is stubbed in page tests (Plotly's own DOM lifecycle is the design system's
test suite's concern, not this app's).

### Security headers

The dashboard's own server sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that switches off
camera, microphone, geolocation, payment and USB (`src/lib/securityHeaders.ts`, wired into
`vite preview` in `vite.config.ts`, with a test). They duplicate the Cloudflare edge's
response-header rule on purpose, so a lost or edited edge rule no longer drops them.
`Content-Security-Policy` is **not** sent from the app, because a second CSP intersects with the
edge's rather than replacing it. The edge CSP must allow, in `connect-src`: `'self'`,
`https://cdn.plot.ly` (the world map's topojson), `https://*.cloudflareaccess.com` (the
Access-gated `/admin` fetch) and `https://cloudflareinsights.com`.

## 6. Deploy topology

Everything runs on a single Mac Mini, exposed publicly via Cloudflare Tunnel — no cloud
hosting. Five `launchd` agents plus the tunnel (`~/Library/LaunchAgents/com.ghgemissions.*.plist`, templates in
`deploy/launchd/`):

| Agent | Runs | Port | Notes |
|---|---|---|---|
| `cloudflared` | `cloudflared tunnel run` | — | Publishes `degreesofcarbon.syena.io` and `degreesofcarbon-preview.syena.io` (the preview, §6; path rules in order: `^/api` → :8081, `^/mcp` → :8765, `^/agent` → :8766, catch-all → :4173) plus `labs.syena.io` for the other apps on this tunnel; forwards full paths with no stripping (`KeepAlive`) |
| `uvicorn` | `api.main:app` | `127.0.0.1:8081` | `DEPLOY_BASE_PATH=/` |
| `vitepreview` | `vite preview` (built `climate-dashboard-react/dist`) | `127.0.0.1:4173` | `DEPLOY_BASE_PATH=/`; must be rebuilt (not just restarted) after any change, since the prefix is baked in at build time |
| `mcpserver` | `python -m mcp_server` (Streamable HTTP) | `127.0.0.1:8765` | `DEPLOY_BASE_PATH=/`, `MCP_TRANSPORT=streamable-http`, `API_BASE_URL=http://127.0.0.1:8081/api` — publicly reachable at `climate-analytics.syena.io/mcp`, gated by a Cloudflare Access application (Service Auth policy, named per-client Service Tokens, §7) rather than app-layer code |
| `agent` | `deploy/launchd/ghg-agent-launch.sh` → `agent.server:app` (`services/agent`) | `127.0.0.1:8766` | `DEPLOY_BASE_PATH=/agent/`, `MCP_SERVER_URL=http://127.0.0.1:8765/mcp` (co-located, unauthenticated loopback — §9) |
| `datarefresh` | `pipeline/ops/ghg-data-refresh.sh` | — | Monthly (day 10, 03:30), §2 above |

**Deploy sequencing**: `syena-design-system` must be pulled (`git merge --ff-only`) *before*
`climate-dashboard-react` is rebuilt, since the frontend build reads the design system's
source directly (§5) — pulling frontend changes without first updating a design system
dependency they need fails the build. Standard sequence for a frontend-affecting change:
pull `syena-design-system` (+ `npm install` there if its dependencies changed, then `npm run tokens`) → pull this repo →
`DEPLOY_BASE_PATH=/ npm run build` in `climate-dashboard-react/` → `launchctl kickstart -k
gui/$(id -u)/com.ghgemissions.{uvicorn,mcpserver,agent,vitepreview}` (all four when Python code
changed). **Editing a plist's environment needs `launchctl bootout` + `bootstrap`, not `kickstart`** —
kickstart re-runs the already-loaded job definition and silently keeps the old env. A Vite content-hash filename
(`assets/index-<hash>.js`) is the reliable way to confirm a fresh build — not a stale
bundle — is actually what's live.

**The retired origin.** The product was renamed Degrees of Carbon and moved to `degreesofcarbon.syena.io`
(preview: `degreesofcarbon-preview.syena.io`). The old hostnames (`climate-analytics.syena.io` and
`climate-analytics-preview.syena.io`) stay on the tunnel, pointing at the same front end, and are
kept indefinitely. A browser that visited them holds a service worker that answers from its cache and never
sees an edge redirect, so with `RETIRE_OLD_ORIGIN=1` (set on the `vitepreview` job's environment, off by
default) `vite preview` answers a retired host itself (`src/lib/retiredOrigin.ts`): `/sw.js` is a replacement
worker (200, `no-store`, never a redirect) that claims the tab, clears the caches, unregisters and moves the tab
to the same path on the new origin; every other path is redirected there (301; 308 for a non-GET). A Cloudflare
redirect rule for the same paths does the same at the edge, with `/sw.js` excluded. The switch is turned on
only once the new host serves the app. The theme preference (`localStorage`) is per origin and does not carry over.

## 7. MCP server (`services/mcp-server/`)

Wraps `api/` as hand-curated MCP tools — Stage 1 of a separate conversational-agent project
(not the notebooks, not the `api/`+`climate-dashboard-react/` dashboard stack in §§4–6). Full
design lives in `services/mcp-server/SPEC.md`; this section covers only where it sits relative
to the rest of the system.

**Data flow**: HTTP client of `api/`, same interface any consumer uses (no shared-library
import, no privileged access path) — `API_BASE_URL` env var, must include the `/api` prefix.
Independently versioned/deployable from `api/` (own `pyproject.toml`), though in practice both
still ship from the same repo and the same Mac Mini would host both if this were deployed.

**Deployed and publicly live**, gated at the edge. The `mcpserver` `launchd` agent (§6) is
running on the Mac Mini; `degreesofcarbon.syena.io/mcp` is a published Cloudflare
Access application with a Service Auth policy (not login-based) and named, individually
revocable Service Tokens per client — `SPEC.md` §8, settled and shipped 2026-08-13. Verified
from outside the Mac Mini: the public endpoint returns `403` with no credentials or a wrong
Service Token, confirming Access enforces before a request ever reaches this machine. Client
consumers reaching in from **outside** the Mac Mini (Claude Desktop's remote-MCP config, any
future external tester) need `CF-Access-Client-Id`/`CF-Access-Client-Secret` headers wired in on
their side — `services/mcp-server/SPEC.md` §8.4 tracks that. The Stage 2 LangGraph agent
(§9) turned out **not** to be one of these clients — see §9 for why. A Dockerfile and CI job
remain deliberately deferred (`SPEC.md` §2.1), unrelated to the auth resolution.

## 8. Admin capabilities

A single app-wide admin surface, gated by one Cloudflare Access application
(`ghg-emissions-admin`, a **login** policy — Google as the identity provider, restricted to the
owner's own account — distinct from §7's Service Auth policy for machine clients). Two path
rules exist today under that one application: the SPA hub page
(`degreesofcarbon.syena.io/admin`, `climate-dashboard-react/src/pages/AdminPage.tsx`,
deliberately absent from §5's `NAV_ITEMS`/nav — reachable by URL only, the same unlisted-route
precedent `/ask` already sets) and `services/agent`'s admin API
(`degreesofcarbon.syena.io/agent/admin`). Both paths must be gated, not just the API:
a login policy answers an unauthenticated request with a redirect to Google, which only a real
top-level page navigation can usefully follow — see `services/agent/SPEC.md` for the full
rationale.

**Ownership stays federated, not centralized.** Each admin capability lives on the service that
already owns the underlying setting — no shared admin service, no shared database, consistent
with this repo's existing "independently deployable services, HTTP not shared code" pattern (§7).
Adding a future admin capability elsewhere (`api/`, `services/mcp-server`) means adding one more
path rule to the same Cloudflare Access application, not standing up new auth infrastructure.

**Current capability**: LLM provider/model selection for `services/agent`, replacing the
plist-edit-and-restart workflow `services/agent/OLLAMA_EVALUATION.md` previously described — see
`services/agent/SPEC.md` for the settings-store/allow-list/graph-swap design.

## 9. Conversational agent (`services/agent/`)

LangGraph agent, Stage 2 of the same conversational-agent project §7 began — surfaced as a new
nav item in `climate-dashboard-react/` (§5), calling `services/mcp-server`'s tools (§7) as an
MCP client and rendering results as real `@syena/ds` components. Full design lives in
`services/agent/SPEC.md`/`ARCHITECTURE.md`; this section covers only where it sits relative to
the rest of the system.

**Data flow**: MCP client of `services/mcp-server` (`langchain-mcp-adapters`'
`MultiServerMCPClient`), not a raw HTTP client of `api/` — inherits `services/mcp-server`'s
country-resolution guard and response trimming for free by staying at the MCP layer.

**Trust boundary — co-located B3, not B4.** Deployed on the same Mac Mini as
`services/mcp-server`, so it reaches it over `127.0.0.1:8765` unauthenticated — the same B3
boundary `services/mcp-server`→`api/` already uses, not the Cloudflare-Access-gated B4 path §7
describes for *external* clients. A co-located agent never leaves the machine. Its own public
endpoint (browser → `services/agent`) is B1/B2-tier, same as `api/` — protected by an existing
Cloudflare edge rate-limit rule (set in the Cloudflare dashboard, outside this repository; it matches the agent, API, admin and MCP paths,
so the new host needs no hostname match) rather than
app-layer code, since every request there also costs a real Anthropic API call.

**Status**: Steps 1–5 of 5 (backend scaffold + MCP client, LangGraph graph core, SSE streaming,
`climate-dashboard-react/`'s `/ask` nav item, security review) shipped, and deployed/running on
the Mac Mini (`com.ghgemissions.agent`, port 8766) — verified live end-to-end (real MCP tool
call, real LLM response) 2026-08-14. The public route is live at
`degreesofcarbon.syena.io/agent` (verified end-to-end through it 2026-09-29, then on the old host name) — see
`services/agent/SPEC.md` for its design.

## 10. See also

- **`SPEC.md`** — curriculum requirements (§§1–2), the addendum with full
  narrative rationale for every architectural decision (§5), curriculum corrections (§6),
  and a versioned decision log (§4, "Version History").
- **`CLAUDE.md`** — agent-facing operating instructions, plus the ML methodology
  decisions (model choices, train/test split, scope boundaries) this document doesn't
  cover.
- **`syena-design-system/FOUNDATIONS.md`** — the design system itself, independent of any one consumer.
- **`services/mcp-server/SPEC.md`**, **`services/mcp-server/CLAUDE.md`** — the MCP server sub-project's own design
  and agent-facing instructions, kept separate from the above rather than
  folded in (§7).
- **`services/agent/SPEC.md`**, **`services/agent/CLAUDE.md`**,
  **`services/agent/ARCHITECTURE.md`** — the
  conversational agent sub-project's own design, agent-facing instructions and cross-cutting
  architecture, kept separate from the above rather than folded in (§9).

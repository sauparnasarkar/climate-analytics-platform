import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { apiRuntimeCachePattern, backendProxyKey, navigateFallbackDenylist, stripTrailingSlash } from './src/lib/basePath.js'
import { SECURITY_HEADERS } from './src/lib/securityHeaders.js'
import { WORKER_CACHE_CONTROL, isWorkerScript } from './src/lib/workerCache.js'
import { savedCopyPlugin } from './src/lib/savedCopy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The design system's source: a sibling checkout (../../syena-design-system by default). `SYN_DS_PATH` points at a different checkout.
const synDs = path.resolve(__dirname, process.env.SYN_DS_PATH ?? '../../syena-design-system')

// The production deploy (climate-analytics.syena.io, SPEC.md §5.25) is served from the
// host root, so DEPLOY_BASE_PATH=/ (or unset) is now the real production value. It can still be set
// to a prefix (labs.syena.io/app-prefix/, say) when the app has to
// live under a path. Defaults to root so local `npm run dev` / `npm run build` behavior is unchanged. Normalized so a
// value given without leading/trailing slashes (or with only one, or nothing but
// slashes) can't produce a malformed base/proxy key downstream.
function normalizeBase(raw: string | undefined): string {
  const stripped = (raw ?? '').replace(/^\/+|\/+$/g, '')
  return stripped ? `/${stripped}/` : '/'
}
const base = normalizeBase(process.env.DEPLOY_BASE_PATH)
const bareBase = stripTrailingSlash(base)
const isPrefixed = base !== '/'

// vite preview 404s on the bare base path with no trailing slash (e.g. /app-prefix
// instead of /app-prefix/) rather than redirecting — a URL people will naturally
// type/share. Redirect it ourselves, before vite's own handling kicks in. Applied to both
// `vite dev` and `vite preview` so the two modes behave identically if DEPLOY_BASE_PATH is
// ever set for local dev too.
function redirectBareBasePlugin(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!isPrefixed || !req.url) return next()
    // Compare against the pathname only — req.url includes the query string,
    // and a URL like /app-prefix?utm_source=x is exactly the kind
    // of link people share, so it needs to redirect too (preserving the query).
    const queryIndex = req.url.indexOf('?')
    const pathname = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex)
    if (pathname === bareBase) {
      const query = queryIndex === -1 ? '' : req.url.slice(queryIndex)
      res.statusCode = 301
      res.setHeader('Location', base + query)
      res.end()
      return
    }
    next()
  }
  return {
    name: 'redirect-bare-base-to-trailing-slash',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// Proxied under the same prefix as the app itself, matching how Cloudflare Tunnel
// forwards the full request path with no automatic prefix-stripping — the backend's
// own routes are mounted at plain /api/..., so strip `base` back off before forwarding.
const apiProxy = {
  target: 'http://localhost:8081',
  changeOrigin: true,
  // Anchored to the leading prefix specifically — a plain p.replace(base, '/') would
  // rewrite the *first* occurrence of `base` anywhere in the path, not necessarily
  // the leading one.
  rewrite: (p: string) => (p.startsWith(base) ? p.slice(base.length - 1) : p),
}

const apiProxyEntry = { [backendProxyKey(base, 'api')]: apiProxy }

// services/agent's own FastAPI app (port 8766, see services/agent/README.md), proxied under
// `${base}agent` the same way `api/` is proxied under `${base}api` -- a separate process, so a
// separate proxy entry rather than folding it into apiProxy. Unlike `api/`, whose routes are
// mounted under a permanent `/api` prefix of their own (so stripping just `base` leaves the
// right path), `services/agent`'s routes are bare (`/query`, `/health`, no `/agent` segment) --
// the whole `${base}agent` proxy key must be stripped, not just `base`, or every request would
// 404 against the agent process locally (it has no DEPLOY_BASE_PATH set in dev, so `/agent/query`
// isn't a route it knows). The SSE `/query` endpoint needs no other special-casing: Vite's
// http-proxy streams the response body through as it arrives either way, and Workbox's
// runtimeCaching below only intercepts GET requests by default (no `method` override set), so
// this POST endpoint is never touched by the service worker's NetworkFirst handler -- no
// SSE-aware exclusion needed.
const agentProxyPrefix = `${base}agent`
const agentProxy = {
  target: 'http://localhost:8766',
  changeOrigin: true,
  rewrite: (p: string) => (p.startsWith(agentProxyPrefix) ? p.slice(agentProxyPrefix.length) || '/' : p),
}

const agentProxyEntry = { [backendProxyKey(base, 'agent')]: agentProxy }

// PWA manifest colors match the app shell's own background tokens
// (the night theme's --syn-color-surface-base) — not redeclared here since the
// theme CSS isn't parsed at build time, so keep these two in sync by hand if
// that token ever changes.
const APP_BACKGROUND = '#121e35'

// A non-production preview sets PREVIEW_NOINDEX=1 when it starts; every response it serves (pages, assets and proxied calls) then says not to index it.
// Without the variable (the production server) nothing is added.
function previewNoindexPlugin(): Plugin {
  return {
    name: 'preview-noindex',
    configurePreviewServer(server) {
      if (process.env.PREVIEW_NOINDEX !== '1') return
      server.middlewares.use((_req, res, next) => {
        res.setHeader('X-Robots-Tag', 'noindex')
        next()
      })
    },
  }
}

// The service worker script is sent with `no-store` (src/lib/workerCache.ts). Set as the headers are written: the static file server sets its own caching header after any middleware.
function workerNoStorePlugin(): Plugin {
  return {
    name: 'worker-no-store',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (isWorkerScript(req.url ?? '', base)) {
          const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => typeof res
          res.writeHead = ((...args: unknown[]) => {
            res.setHeader('Cache-Control', WORKER_CACHE_CONTROL)
            // Headers handed to writeHead itself win over the ones set above (the file server passes its own), so they are corrected too.
            for (const arg of args) {
              if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
                for (const key of Object.keys(arg)) if (key.toLowerCase() === 'cache-control') (arg as Record<string, unknown>)[key] = WORKER_CACHE_CONTROL
              }
            }
            return writeHead(...args)
          }) as typeof res.writeHead
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    redirectBareBasePlugin(),
    previewNoindexPlugin(),
    workerNoStorePlugin(),
    VitePWA({
      // A new worker waits until the page offers a reload (src/pwa, the UpdatePrompt) and is activated on request: 'autoUpdate' swapped the
      // worker under a tab that kept running its old scripts, and never looked for a new one while a tab stayed open. The page registers
      // the worker itself (src/pwa/register.ts), so the plain registration script is not injected.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Degrees of Carbon',
        short_name: 'Degrees',
        description: 'How every tonne becomes a degree. Country CO₂ emissions, forecasts and scenarios, set in the context of atmospheric CO₂ and global warming.',
        theme_color: APP_BACKGROUND,
        background_color: APP_BACKGROUND,
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Same source image reused for the maskable slot — it already has generous
          // padding around the mark, so it clears Android's 80% safe-zone circle
          // without needing a separately-authored asset. Without at least one
          // maskable icon, Android's adaptive-icon shell adds its own default
          // background, clashing with the dark #121e35 shell.
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The main JS bundle is ~6MB unminified (pre-existing — this app isn't
        // code-split yet, a separate concern from PWA setup) and exceeds
        // Workbox's 2MB default precache ceiling. Raised with headroom rather
        // than blocking PWA support on an unrelated bundle-splitting project.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Without this, Workbox's default NavigationRoute intercepts *every* top-level
        // navigation (mode: 'navigate') -- including a target="_blank" click on a plain
        // <a href> to a static asset such as a PDF in public/ -- and serves the SPA
        // shell (index.html) instead of the actual file, since the route has no allowlist/
        // denylist by default and doesn't distinguish an app route from a real static file.
        // Confirmed live: clicking a plain link to a static file opened a new
        // tab that redirected to the Overview page instead of opening the file. Denylist
        // any path ending in a file extension so only pathless app routes (this app's own
        // routes are all extensionless: /, /historical, /about, etc.) fall back to the SPA
        // shell; real static files bypass the fallback and serve normally.
        // Workbox tests this denylist against `pathname + search` (confirmed empirically: a
        // plain `\.ext$` pattern stopped matching, and the SPA fallback fired again, the moment
        // a query string like `?cachebust=1` was appended to the same file URL) -- the trailing
        // `(\?.*)?` tolerates an optional query string so a cache-busting or tracking param
        // doesn't silently resurrect the redirect bug.
        //
        // /admin is also denylisted, for an unrelated reason: it's the only route gated by
        // Cloudflare Access (root ARCHITECTURE.md §8). Reproduced live 2026-08-24: with /admin
        // left out of this list, Workbox's default NavigationRoute served the precached
        // index.html shell for every reload instead of hitting the network -- so an expired
        // Access session went undetected (the page appeared to load normally) until a same-page
        // fetch() to the admin API tried to follow Access's redirect-to-Google-login and failed
        // with an opaque CORS error, since fetch (unlike a real navigation) can't complete a
        // cross-origin redirect chain with no CORS headers. Denylisting /admin forces every load
        // of it to be a genuine network navigation, so an expired session redirects to Google
        // login the normal way instead of silently serving stale cached UI.
        //
        // The backend prefixes (api/mcp/agent) are denylisted for a related reason: at the root base
        // of climate-analytics.syena.io (SPEC.md §5.25) this worker's scope is the whole
        // origin, so a top-level navigation to one of them must reach the tunnel's backend route,
        // not be answered with the SPA shell. The list is built (and unit-tested) in lib/basePath.ts.
        navigateFallbackDenylist: navigateFallbackDenylist(base),
        // Data freshness matters more than offline access for a live emissions
        // dashboard — go to the network first for API calls (short timeout
        // before falling back to any cached copy), and let Workbox's default
        // precache-then-serve behavior handle the built JS/CSS/icons as-is.
        runtimeCaching: [
          {
            // A regex literal, not a function closing over `base` — vite-plugin-pwa
            // serializes this urlPattern into the standalone sw.js file as a string;
            // a function referencing an outer build-time variable ships with that
            // identifier intact but nothing to resolve it against in the service
            // worker's own JS context, throwing "ReferenceError: base is not defined"
            // on every single fetch event once the worker actually controls a page.
            // Confirmed via a real browser's Service Worker console (not caught by
            // any of this session's automated testing — a worker only controls a
            // page from its *second* load onward, which fresh single-load test
            // contexts never reach). A regex's value is `base` baked in as a plain
            // string at build time, with nothing left to resolve at runtime.
            // Built in lib/basePath.ts (and unit-tested there against full URLs): Workbox matches a
            // RegExp route against the whole href, so the pattern is anchored after the origin.
            urlPattern: apiRuntimeCachePattern(base),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              // Only real 200s: `0` would also store opaque cross-origin responses, and the pattern's host part
              // is a wildcard (the origin is not known at build time).
              cacheableResponse: { statuses: [200] },
              // Each saved copy is stamped with the time it was saved (src/lib/savedCopy.ts); the page says so when it shows one.
              plugins: [savedCopyPlugin],
              // Bounded now that the route actually matches: every distinct query string (country
              // sets, years, scenarios) is its own entry. A week is long enough for the offline/slow-network
              // fallback and short next to the monthly data refresh.
              expiration: { maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  base,
  resolve: {
    // One copy of each library the design system and this app share, so hooks and the grid's module registry are not doubled.
    dedupe: ['react', 'react-dom', 'ag-grid-community', 'ag-grid-react'],
    alias: {
      // The design system has no main/exports/dist: alias straight to its source so Vite treats it as part of this app's own module graph (as its
      // Storybook does). It is a separate sibling project, shared with other apps. Its entry and its stylesheet.
      '@syena/ds/styles.css': path.join(synDs, 'src/styles.css'),
      '@syena/ds': path.join(synDs, 'src/index.ts'),
      // The design system's components run inside this app's bundle (not a separate installed package), so react/react-dom must resolve to a single
      // copy or hooks break.
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  server: {
    port: 5173,
    proxy: { ...apiProxyEntry, ...agentProxyEntry },
    // The design system is aliased in from outside this project's root (see resolve.alias above), and Vite's dev server refuses to serve files outside
    // `fs.allow` -- fine for plain source imports, but the globe imports a bundled TopoJSON asset via `?url`, which is denied unless its directory is allowed.
    fs: { allow: [path.resolve(__dirname, '..'), synDs] },
  },
  preview: {
    port: 4173,
    // The production server (src/lib/securityHeaders.ts). Not on `server` (dev): the local phone-testing iframe needs to frame the dev server.
    headers: SECURITY_HEADERS,
    proxy: { ...apiProxyEntry, ...agentProxyEntry },
    // Vite blocks unrecognized Host headers by default (DNS-rebinding protection) —
    // the Cloudflare Tunnel forwards requests with Host: climate-analytics.syena.io (or climate-analytics-preview.syena.io for the preview), which needs
    // an explicit allow (localhost and IP hosts are always allowed by Vite itself). Not gated on the
    // base being prefixed: the root-base deploy (SPEC.md §5.25) is the real production
    // case, and leaving `allowedHosts` undefined there would 403 the tunnel's Host header outright.
    allowedHosts: ['climate-analytics.syena.io', 'climate-analytics-preview.syena.io'],
  },
})

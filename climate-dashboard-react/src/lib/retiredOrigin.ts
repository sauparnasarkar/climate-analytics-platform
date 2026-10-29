// The product moved from climate-analytics.syena.io to degreesofcarbon.syena.io. A browser that visited the old origin has a service worker that
// answers from its cache, so an edge redirect alone is never seen by it: it has to receive a worker that sends it on. This serves that worker,
// and redirects every other path, on the retired hosts only. Switched on by RETIRE_OLD_ORIGIN=1, so it cannot go live before the new host does.

/** Each retired host and the origin it moved to. RETIRED_HOST_MAP ("old.host=https://new.host,...") replaces it, for tests. */
export const DEFAULT_RETIRED_HOSTS: Record<string, string> = {
  'climate-analytics.syena.io': 'https://degreesofcarbon.syena.io',
  'climate-analytics-preview.syena.io': 'https://degreesofcarbon-preview.syena.io',
}

export function parseRetiredHosts(raw: string | undefined): Record<string, string> {
  if (!raw) return DEFAULT_RETIRED_HOSTS
  const map: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const at = pair.indexOf('=')
    if (at > 0) map[pair.slice(0, at).trim().toLowerCase()] = pair.slice(at + 1).trim().replace(/\/+$/, '')
  }
  return map
}

/**
 * The replacement worker. No fetch handler and no imports, so nothing can fail on the way: install takes over at once; activate claims the
 * open tabs, empties every cache, unregisters, and sends each tab on to the same path on the new origin. A worker may only navigate a tab
 * within its own origin, so if the cross-origin call is refused the tab reloads where it is, and the redirect on this origin carries it over.
 */
export function killSwitchWorker(newOrigin: string): string {
  return `// Retired origin: this worker only removes itself and moves the tab to ${newOrigin}.
const NEW_ORIGIN = ${JSON.stringify(newOrigin)};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    for (const key of await caches.keys()) await caches.delete(key);
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await self.registration.unregister();
    for (const tab of tabs) {
      const here = new URL(tab.url);
      try {
        await tab.navigate(NEW_ORIGIN + here.pathname + here.search + here.hash);
      } catch {
        try { await tab.navigate(tab.url); } catch { /* the tab is gone */ }
      }
    }
  })());
});
`
}

export interface RetiredOriginReply {
  status: number
  headers: Record<string, string>
  body: string
}

/** The answer for a request to a retired host, or null when the host is not retired (or the switch is off) and the app should answer. */
export function retiredOriginReply(
  req: { method?: string; url?: string; host?: string },
  hosts: Record<string, string>,
): RetiredOriginReply | null {
  const hostname = (req.host ?? '').split(':')[0].toLowerCase()
  const newOrigin = hosts[hostname]
  if (!newOrigin) return null
  const url = req.url ?? '/'
  const path = url.split('?')[0]
  if (path === '/sw.js') {
    return { status: 200, headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }, body: killSwitchWorker(newOrigin) }
  }
  // 308 keeps the method and body of a POST (an MCP or agent client following it); 301 is what a browser's page request gets.
  const status = req.method === 'GET' || req.method === 'HEAD' ? 301 : 308
  return { status, headers: { Location: newOrigin + url, 'Cache-Control': 'no-store' }, body: '' }
}

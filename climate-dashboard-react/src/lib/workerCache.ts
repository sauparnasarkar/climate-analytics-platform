// The service worker script is how a new deploy reaches a tab, so it is never served from a cache. `no-cache` is not enough in front of an edge that
// caches static scripts by file extension: it keeps the file and answers "max-age=14400" to browsers (seen on the preview, 2026-10-20), so a browser
// registers a worker from its own stale copy and then finds the current one waiting. `no-store` keeps the file out of the edge and the browser alike.
export const WORKER_CACHE_CONTROL = 'no-store'

/** Whether a request path (with any query string) is the service worker script under the given base. */
export function isWorkerScript(url: string, base: string): boolean {
  const path = url.split('?')[0]
  return path === `${base.endsWith('/') ? base : `${base}/`}sw.js`
}

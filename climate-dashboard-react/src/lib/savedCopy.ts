/** The header the service worker puts on a copy when it saves it: the moment it was saved, as an ISO time. Live responses never carry it. */
export const SAVED_AT_HEADER = 'x-saved-at'

/**
 * A Workbox plugin for the API cache: stamps each response with the time it is saved (and dates an older, unstamped copy as it is served). A copy served later, offline, still says when it was saved, not when it
 * was served. The page gets the live response itself, unstamped. Self-contained on purpose: the worker script is generated from this function's source.
 */
export const savedCopyPlugin = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    const headers = new Headers(response.headers)
    headers.set('x-saved-at', new Date().toISOString())
    return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers })
  },
  // A copy saved before the stamp existed is dated by the server's own Date header when it is served. The cache drops copies older than a
  // week, so that is always a recent time; a copy with neither stamp nor Date is served as it is, and no date is made up for it.
  cachedResponseWillBeUsed: async ({ cachedResponse }: { cachedResponse?: Response }) => {
    if (!cachedResponse || cachedResponse.headers.has('x-saved-at')) return cachedResponse
    const date = Date.parse(cachedResponse.headers.get('date') ?? '')
    if (Number.isNaN(date)) return cachedResponse
    const headers = new Headers(cachedResponse.headers)
    headers.set('x-saved-at', new Date(date).toISOString())
    return new Response(await cachedResponse.blob(), { status: cachedResponse.status, statusText: cachedResponse.statusText, headers })
  },
}

// What each URL's latest response was: the time its saved copy was made, or null for a live response.
const latest = new Map<string, string | null>()
const listeners = new Set<() => void>()
let snapshot: string | null = null

function publish() {
  const times = [...latest.values()].filter((time): time is string => time !== null).sort()
  const next = times[0] ?? null // the oldest copy on show
  if (next === snapshot) return
  snapshot = next
  listeners.forEach((listener) => listener())
}

/** Notes where a request's latest response came from: `savedAt` is its header value, null when the response was live. */
export function recordResponse(url: string, savedAt: string | null) {
  latest.set(url, savedAt)
  publish()
}

/** Forgets every URL, as when the reader moves to another page. */
export function resetSavedData() {
  latest.clear()
  publish()
}

export function subscribeSavedData(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** When the oldest saved copy now on show was saved (ISO), or null when every latest response was live. */
export function savedDataSince(): string | null {
  return snapshot
}

/** "14 October", with the year added when it is not the current one. */
export function describeSavedAt(savedAt: string, now: Date = new Date()): string {
  const date = new Date(savedAt)
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })
}

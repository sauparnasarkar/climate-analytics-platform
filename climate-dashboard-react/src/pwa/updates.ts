/**
 * Keeps asking the browser for a newer service worker. A browser looks on its own only when the page is navigated to,
 * and this app moves between pages without navigating, so a tab left open (a phone's most of all) would never hear of a deploy.
 * It looks on a timer and whenever the tab comes back to the front, not at once: the browser has only just fetched the worker, and a second fetch
 * straight after registering could meet a different copy of it and raise a prompt on a first visit. Returns a function that stops it.
 */
export function watchForUpdates(registration: ServiceWorkerRegistration, { intervalMs = 60 * 60 * 1000 }: { intervalMs?: number } = {}): () => void {
  // Offline, or the server is restarting: the next look will find out.
  const look = () => { void registration.update().catch(() => undefined); };
  const onVisible = () => { if (document.visibilityState === 'visible') look(); };
  const timer = window.setInterval(look, intervalMs);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/**
 * Says when a newer version is really waiting for this page: a worker is waiting and a worker controls the page. A page nothing controls is
 * running what the network gave it, and a browser activates a new worker at once when no page is using the old one, so nothing waits; in both
 * cases a prompt would offer a reload that has nothing to activate. It clears when nothing waits any more or the controller changes.
 * Returns a function that stops it.
 */
export function trackUpdate(
  registration: ServiceWorkerRegistration,
  container: ServiceWorkerContainer,
  { onWaiting, onClear }: { onWaiting: () => void; onClear: () => void },
): () => void {
  let announced: ServiceWorker | null = null;
  const sync = () => {
    const waiting = registration.waiting;
    if (waiting && container.controller) {
      // Once for each waiting worker: looking again finds the same one, a later deploy replaces it with another.
      if (waiting !== announced) { announced = waiting; onWaiting(); }
    } else if (announced) {
      announced = null;
      onClear();
    }
  };
  const watched = new WeakSet<ServiceWorker>();
  const watch = (worker: ServiceWorker | null) => {
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    worker.addEventListener('statechange', sync);
  };
  const onFound = () => { watch(registration.installing); sync(); };
  registration.addEventListener('updatefound', onFound);
  container.addEventListener('controllerchange', sync);
  watch(registration.installing);
  watch(registration.waiting);
  sync();
  return () => {
    registration.removeEventListener('updatefound', onFound);
    container.removeEventListener('controllerchange', sync);
  };
}

/**
 * Reloads into the waiting version: tells the waiting worker to take over and reloads once it controls the page. If the controller never
 * changes it reloads after a short wait anyway, and with nothing waiting it reloads at once, so the button never does nothing.
 */
export function reloadWhenActivated(
  registration: ServiceWorkerRegistration,
  container: ServiceWorkerContainer,
  reload: () => void = () => window.location.reload(),
  fallbackMs = 3000,
): void {
  const waiting = registration.waiting;
  if (!waiting) { reload(); return; }
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    container.removeEventListener('controllerchange', go);
    reload();
  };
  container.addEventListener('controllerchange', go);
  const timer = window.setTimeout(go, fallbackMs);
  waiting.postMessage({ type: 'SKIP_WAITING' });
}


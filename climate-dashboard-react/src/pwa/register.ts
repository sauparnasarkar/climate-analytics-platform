import { registerSW } from 'virtual:pwa-register';
import { announceNewVersion, forgetNewVersion, onReloadForUpdate } from './updateState';
import { applyUpdateIfIdle, reloadWhenActivated, trackUpdate, watchForUpdates } from './updates';

/** Registers the service worker, keeps looking for a newer one, and tells the page when one is really waiting for it. */
export function registerServiceWorker() {
  let current: ServiceWorkerRegistration | undefined;
  // Whether anyone has pressed, tapped or typed yet: until then an update waiting at load is applied without a prompt.
  let interacted = false;
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel']) window.addEventListener(type, () => { interacted = true; }, { once: true, passive: true, capture: true });
  const storage = (() => { try { return window.sessionStorage; } catch { return undefined; } })();
  // The helper's own report of a new worker is not used: it also fires for a worker that is not waiting (see trackUpdate).
  registerSW({
    immediate: true,
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      current = registration;
      watchForUpdates(registration);
      trackUpdate(registration, navigator.serviceWorker, {
        // A returning visitor's page is still the old worker's: at load, before any interaction, move to the new version at once; otherwise ask.
        onWaiting: () => { if (!applyUpdateIfIdle({ registration, container: navigator.serviceWorker, interacted: () => interacted, ageMs: () => performance.now(), storage, onDeferred: announceNewVersion })) announceNewVersion(); },
        onClear: forgetNewVersion,
      });
    },
  });
  // Reload hands over to the waiting worker, then reloads into it.
  onReloadForUpdate(() => {
    if (current) reloadWhenActivated(current, navigator.serviceWorker);
    else window.location.reload();
  });
}

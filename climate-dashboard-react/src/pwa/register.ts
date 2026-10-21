import { registerSW } from 'virtual:pwa-register';
import { announceNewVersion, forgetNewVersion, onReloadForUpdate } from './updateState';
import { reloadWhenActivated, trackUpdate, watchForUpdates } from './updates';

/** Registers the service worker, keeps looking for a newer one, and tells the page when one is really waiting for it. */
export function registerServiceWorker() {
  let current: ServiceWorkerRegistration | undefined;
  // The helper's own report of a new worker is not used: it also fires for a worker that is not waiting (see trackUpdate).
  registerSW({
    immediate: true,
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      current = registration;
      watchForUpdates(registration);
      trackUpdate(registration, navigator.serviceWorker, { onWaiting: announceNewVersion, onClear: forgetNewVersion });
    },
  });
  // Reload hands over to the waiting worker, then reloads into it.
  onReloadForUpdate(() => {
    if (current) reloadWhenActivated(current, navigator.serviceWorker);
    else window.location.reload();
  });
}

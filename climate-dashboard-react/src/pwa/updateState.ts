import { useSyncExternalStore } from 'react';

// How many times a newer version of the app has been announced, whether one is waiting now, and what reloads into it. Kept outside React because the worker reports it from outside.
// The count only grows, so putting a version off never hides a later one that arrives after the first went away.
let announcements = 0;
let waiting = false;
// Set when the page was left on the old scripts after a worker took over (someone was typing, so it did not reload): no worker is waiting any more, but the page is still old, so the offer stays until the page reloads.
let stale = false;
let reload: () => void = () => window.location.reload();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const announceNewVersion = () => { announcements += 1; waiting = true; emit(); };
export const announceStalePage = () => { announcements += 1; waiting = true; stale = true; emit(); };
export const forgetNewVersion = () => { if (stale) return; waiting = false; emit(); };
/** For tests: back to a page that has heard of nothing. */
export const resetUpdateState = () => { announcements = 0; waiting = false; stale = false; emit(); };
export const onReloadForUpdate = (fn: () => void) => { reload = fn; };
export const reloadForUpdate = () => reload();

export function useNewVersion(): number {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => (waiting ? announcements : 0), () => 0);
}

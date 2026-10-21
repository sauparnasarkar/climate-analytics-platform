import { useSyncExternalStore } from 'react';

// How many times a newer version of the app has been announced, whether one is waiting now, and what reloads into it. Kept outside React because the worker reports it from outside.
// The count only grows, so putting a version off never hides a later one that arrives after the first went away.
let announcements = 0;
let waiting = false;
let reload: () => void = () => window.location.reload();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const announceNewVersion = () => { announcements += 1; waiting = true; emit(); };
export const forgetNewVersion = () => { waiting = false; emit(); };
export const onReloadForUpdate = (fn: () => void) => { reload = fn; };
export const reloadForUpdate = () => reload();

export function useNewVersion(): number {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => (waiting ? announcements : 0), () => 0);
}

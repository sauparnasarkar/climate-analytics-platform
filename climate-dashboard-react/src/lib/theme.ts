import type { ThemeName } from '@syena/ds';

// The app's own choice, kept in this origin's localStorage. The key names the app, so another app
// served from the same origin never reads or overwrites it.
export const THEME_STORAGE_KEY = 'climate-analytics-theme';

// Dark (night) or Light (tidewater): the design system's own theme names.
export type AppTheme = Extract<ThemeName, 'night' | 'tidewater'>;

const isAppTheme = (value: unknown): value is AppTheme => value === 'night' || value === 'tidewater';

// Read in the state initializer, not an effect, so a returning Light user never sees a flash of Dark on first paint.
// Dark is what a first-time visitor lands on; there is no prefers-color-scheme detection, because an explicit toggle
// exists and a media-query default would only contradict it. Storage can throw (private browsing, a blocking
// extension or policy), which would otherwise crash the app before it renders.
export function readStoredTheme(): AppTheme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isAppTheme(stored) ? stored : 'night';
  } catch {
    return 'night';
  }
}

// With storage blocked the toggle still works for the session; it just does not persist across reloads.
export function storeTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not persisted.
  }
}

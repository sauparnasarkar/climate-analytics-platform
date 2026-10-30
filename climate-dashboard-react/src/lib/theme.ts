import type { ThemeChoice } from '@syena/ds';

// The visitor's own choice, kept in this origin's localStorage by SynThemeProvider. The key names the app, so another app
// served from the same origin never reads or overwrites it.
export const THEME_STORAGE_KEY = 'degrees-of-carbon-theme';
// What the key was called before the rename. Read once by `migrateLegacyTheme`, then deleted.
export const LEGACY_THEME_STORAGE_KEY = 'climate-analytics-theme';

// System (follow the device), Light (tidewater) or Dark (night): the design system's own choice names.
export type AppTheme = ThemeChoice;

/** The three choices in the order the toggle shows them. */
export const THEME_CHOICES: { value: AppTheme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'tidewater', label: 'Light' },
  { value: 'night', label: 'Dark' },
];

/**
 * Carries a choice made under the old key over to the new one, once, before the first render (the provider reads storage in its
 * state initializer, so a returning Light visitor never sees a flash of the default). The old key is deleted either way. Storage can
 * throw (private browsing, a blocking extension or policy), which would otherwise crash the app before it renders.
 */
export function migrateLegacyTheme(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy === null) return;
    if ((legacy === 'night' || legacy === 'tidewater') && localStorage.getItem(THEME_STORAGE_KEY) === null) {
      localStorage.setItem(THEME_STORAGE_KEY, legacy);
    }
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    // Not migrated: the visitor starts on System.
  }
}

/** System is the absence of a stored choice, so the device decides from the next visit on too. */
export function clearStoredTheme(): void {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

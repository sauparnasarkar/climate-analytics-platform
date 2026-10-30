import { MAX_SELECTED_COUNTRIES } from '../constants';
import { canonicalCountries } from '../hooks/useCountrySelection';

// The visitor's own default countries, kept in this origin's localStorage as a JSON list of names; absent means the platform's Featured ten.
export const DEFAULT_COUNTRIES_STORAGE_KEY = 'degrees-of-carbon-default-countries';

/** The stored list as written (names not yet checked against the current Expanded list), or null when there is none or it cannot be read. Storage can throw (private browsing, a blocking extension or policy). */
export function readStoredDefaultCountries(): string[] | null {
  try {
    const raw = localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((name) => typeof name === 'string') ? parsed : null;
  } catch {
    return null;
  }
}

/** An empty or absent list is stored as nothing, so Reset and "no countries chosen" are the same state. With storage blocked the list lasts for the session. */
export function storeDefaultCountries(list: string[] | null): void {
  try {
    if (list && list.length > 0) localStorage.setItem(DEFAULT_COUNTRIES_STORAGE_KEY, JSON.stringify(list));
    else localStorage.removeItem(DEFAULT_COUNTRIES_STORAGE_KEY);
  } catch {
    // Not persisted.
  }
}

/**
 * What a page uses when it opens without a selection: the stored list checked against the current Expanded list (names that are no
 * longer there are dropped, duplicates removed, at most ten kept), or the platform's Featured ten when nothing is left of it.
 */
export function effectiveDefaultCountries(stored: string[] | null, featured: string[], expanded: string[]): string[] {
  if (!stored) return featured;
  const valid = canonicalCountries(stored, expanded, MAX_SELECTED_COUNTRIES);
  return valid.length > 0 ? valid : featured;
}

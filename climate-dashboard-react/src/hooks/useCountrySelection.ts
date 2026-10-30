import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MAX_SELECTED_COUNTRIES } from '../constants';

// Deep-linkable country selection (SPEC.md §5.25): the URL is the source of truth for
// which countries a picker shows, so a link like `/historical?countries=India&countries=China` (from
// the landing page's story cards) opens with that selection, and a reload keeps whatever the user
// last picked. Values are validated against the expanded list, so a hand-edited or stale URL can
// never inject an unknown name into the API call.

const MULTI_PARAM = 'countries';
const SINGLE_PARAM = 'country';

/** Canonicalises each value against `expanded` (case-insensitive), dropping unknowns and
 * duplicates, keeping first-seen order, capped at `max`. */
export function canonicalCountries(values: string[], expanded: string[], max = MAX_SELECTED_COUNTRIES): string[] {
  const byLower = new Map(expanded.map((c) => [c.toLowerCase(), c]));
  const out: string[] = [];
  for (const raw of values) {
    const match = byLower.get(raw.trim().toLowerCase());
    if (match && !out.includes(match)) out.push(match);
    if (out.length >= max) break;
  }
  return out;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => c === b[i]);

/**
 * Selection for a multi-country picker, backed by repeated `?countries=` params (the same shape the
 * API takes).
 * - no param at all, or only unrecognised names -> `defaults`
 * - a bare `?countries=` -> an explicitly empty selection (so clearing the picker survives a reload
 *   instead of silently flipping back to the defaults)
 * - otherwise the recognised names, deduplicated and capped at MAX_SELECTED_COUNTRIES
 * The setter rewrites only this param (replace, not push -- picker tweaks shouldn't fill the back
 * stack), keeps the hash, and drops the param only when the selection is the platform's `featured` list AND `defaults` is that list
 * too. `defaults` may be the visitor's own (Settings → Default countries): then a URL without the param means *their* defaults, so a
 * link must say its countries outright, or the person who opens it would see theirs. For the same reason a page that opens without
 * the param, for a visitor with their own defaults, gets the param written into its address (a replace, once), so the address is shareable.
 */
export function useSelectedCountries(defaults: string[], expanded: string[], featured: string[] = defaults): [string[], (next: string[]) => void] {
  const { search, hash, pathname } = useLocation();
  const navigate = useNavigate();
  const ownDefaults = !sameList(defaults, featured);

  const selected = useMemo(() => {
    const raw = new URLSearchParams(search).getAll(MULTI_PARAM);
    if (raw.length === 0) return defaults;
    if (raw.every((v) => v === '')) return [];
    const valid = canonicalCountries(raw, expanded);
    return valid.length > 0 ? valid : defaults;
  }, [search, defaults, expanded]);

  const setSelected = useCallback(
    (next: string[]) => {
      const params = new URLSearchParams(search);
      params.delete(MULTI_PARAM);
      if (next.length === 0) params.append(MULTI_PARAM, '');
      else if (ownDefaults || !sameList(next, featured)) next.forEach((c) => params.append(MULTI_PARAM, c));
      const qs = params.toString();
      navigate({ pathname, search: qs ? `?${qs}` : '', hash }, { replace: true });
    },
    [search, hash, pathname, featured, ownDefaults, navigate],
  );

  // The visitor's own defaults are in use but the address does not say so: write them in, once.
  const bare = new URLSearchParams(search).getAll(MULTI_PARAM).length === 0;
  useEffect(() => {
    if (!ownDefaults || !bare) return;
    const params = new URLSearchParams(search);
    defaults.forEach((c) => params.append(MULTI_PARAM, c));
    navigate({ pathname, search: `?${params.toString()}`, hash }, { replace: true });
  }, [ownDefaults, bare, defaults, search, pathname, hash, navigate]);

  return [selected, setSelected];
}

/** Single-country selection backed by `?country=`; unknown/absent -> `fallback`. */
export function useSelectedCountry(fallback: string, expanded: string[], featuredFirst: string = fallback): [string, (next: string) => void] {
  const { search, hash, pathname } = useLocation();
  const navigate = useNavigate();
  const ownFallback = fallback !== featuredFirst;

  const country = useMemo(() => {
    const raw = new URLSearchParams(search).get(SINGLE_PARAM);
    return (raw && canonicalCountries([raw], expanded, 1)[0]) || fallback;
  }, [search, fallback, expanded]);

  const setCountry = useCallback(
    (next: string) => {
      const params = new URLSearchParams(search);
      params.delete(SINGLE_PARAM);
      // Dropped only for the platform's own default, and only where that is the page's default too (see useSelectedCountries).
      if (ownFallback || next !== featuredFirst) params.set(SINGLE_PARAM, next);
      const qs = params.toString();
      navigate({ pathname, search: qs ? `?${qs}` : '', hash }, { replace: true });
    },
    [search, hash, pathname, featuredFirst, ownFallback, navigate],
  );

  const bare = !new URLSearchParams(search).has(SINGLE_PARAM);
  useEffect(() => {
    if (!ownFallback || !bare) return;
    const params = new URLSearchParams(search);
    params.set(SINGLE_PARAM, fallback);
    navigate({ pathname, search: `?${params.toString()}`, hash }, { replace: true });
  }, [ownFallback, bare, fallback, search, pathname, hash, navigate]);

  return [country, setCountry];
}

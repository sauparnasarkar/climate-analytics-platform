import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { effectiveDefaultCountries, readStoredDefaultCountries, storeDefaultCountries } from './defaultCountries';

interface DefaultCountriesValue {
  /** The stored list as written, or null. */
  stored: string[] | null;
  setStored: (list: string[] | null) => void;
}

const DefaultCountriesContext = createContext<DefaultCountriesValue>({ stored: null, setStored: () => {} });

/** The visitor's own default countries (Settings → Default countries), for every page with a country selection. Read in a state initializer, so the first render already uses them. */
export function DefaultCountriesProvider({ children }: { children: ReactNode }) {
  const [stored, setStoredState] = useState<string[] | null>(readStoredDefaultCountries);
  const setStored = useCallback((list: string[] | null) => {
    const next = list && list.length > 0 ? list : null;
    setStoredState(next);
    storeDefaultCountries(next);
  }, []);
  const value = useMemo(() => ({ stored, setStored }), [stored, setStored]);
  return <DefaultCountriesContext.Provider value={value}>{children}</DefaultCountriesContext.Provider>;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => c === b[i]);

/**
 * The defaults a page opens with: the visitor's own list where they have set one, else the platform's Featured ten.
 * `custom` is true only when they differ, which is when a link must carry the countries and the reset button says "my defaults".
 * The list keeps its identity while its names are the same, so it can sit in effect dependencies without refetching.
 */
export function useEffectiveDefaults(featured: string[], expanded: string[]): { defaults: string[]; custom: boolean; setStored: (list: string[] | null) => void } {
  const { stored, setStored } = useContext(DefaultCountriesContext);
  const last = useRef<string[] | null>(null);
  const computed = useMemo(() => effectiveDefaultCountries(stored, featured, expanded), [stored, featured, expanded]);
  const defaults = last.current && sameList(last.current, computed) ? last.current : computed;
  last.current = defaults;
  return { defaults, custom: !sameList(defaults, featured), setStored };
}

import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DefaultCountriesProvider, useEffectiveDefaults } from '../lib/DefaultCountriesProvider';
import { DEFAULT_COUNTRIES_STORAGE_KEY, effectiveDefaultCountries, readStoredDefaultCountries, storeDefaultCountries } from '../lib/defaultCountries';
import { useSelectedCountries, useSelectedCountry } from './useCountrySelection';

const FEATURED = ['China', 'United States', 'India', 'Russia', 'Japan', 'Germany', 'Brazil', 'United Kingdom', 'South Africa', 'Australia'];
const EXPANDED = [...FEATURED, 'Indonesia', 'Vietnam'];
const CUSTOM = ['India', 'Brazil', 'Indonesia'];

let setMany: (next: string[]) => void;
let setOne: (next: string) => void;
let reset: () => void;

function Probe() {
  const { defaults, custom } = useEffectiveDefaults(FEATURED, EXPANDED);
  const [many, setManyState] = useSelectedCountries(defaults, EXPANDED, FEATURED);
  const [one, setOneState] = useSelectedCountry(defaults[0], EXPANDED, FEATURED[0]);
  const { search, hash } = useLocation();
  setMany = setManyState;
  setOne = setOneState;
  reset = () => setManyState(defaults);
  return (
    <>
      <output aria-label="many">{many.join('|')}</output>
      <output aria-label="one">{one}</output>
      <output aria-label="custom">{String(custom)}</output>
      <output aria-label="url">{search}{hash}</output>
    </>
  );
}

const mount = (entry = '/p') => render(<DefaultCountriesProvider><MemoryRouter initialEntries={[entry]}><Probe /></MemoryRouter></DefaultCountriesProvider>);
const text = (name: string) => screen.getByLabelText(name).textContent;
const query = (search: string) => new URLSearchParams(search);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('default countries: storage', () => {
  it('stores a list as JSON, reads it back, and treats an empty list as nothing', () => {
    storeDefaultCountries(CUSTOM);
    expect(localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY)).toBe(JSON.stringify(CUSTOM));
    expect(readStoredDefaultCountries()).toEqual(CUSTOM);
    storeDefaultCountries([]);
    expect(localStorage.getItem(DEFAULT_COUNTRIES_STORAGE_KEY)).toBeNull();
    expect(readStoredDefaultCountries()).toBeNull();
  });

  it('ignores anything stored that is not a list of names', () => {
    for (const bad of ['', 'not json', '{"a":1}', '[1,2]', 'null']) {
      localStorage.setItem(DEFAULT_COUNTRIES_STORAGE_KEY, bad);
      expect(readStoredDefaultCountries()).toBeNull();
    }
  });

  it('checks the stored list against the current Expanded list: unknown names and duplicates dropped, at most ten, Featured when nothing is left', () => {
    expect(effectiveDefaultCountries(['india', 'Atlantis', 'India', 'Brazil'], FEATURED, EXPANDED)).toEqual(['India', 'Brazil']);
    expect(effectiveDefaultCountries(['Atlantis'], FEATURED, EXPANDED)).toBe(FEATURED);
    expect(effectiveDefaultCountries(null, FEATURED, EXPANDED)).toBe(FEATURED);
    expect(effectiveDefaultCountries(EXPANDED, FEATURED, EXPANDED)).toHaveLength(10);
  });
});

describe('default countries: the pages\' selection', () => {
  it('without defaults of their own it is the Featured ten, and the address stays bare', () => {
    mount();
    expect(text('many')).toBe(FEATURED.join('|'));
    expect(text('one')).toBe('China');
    expect(text('custom')).toBe('false');
    expect(text('url')).toBe('');
  });

  it('with the stored list it is that list, and the address says so, so it can be shared', () => {
    storeDefaultCountries(CUSTOM);
    mount();
    expect(text('many')).toBe(CUSTOM.join('|'));
    expect(text('one')).toBe('India');
    expect(text('custom')).toBe('true');
    const params = query(text('url')!);
    expect(params.getAll('countries')).toEqual(CUSTOM);
    expect(params.get('country')).toBe('India');
  });

  it('keeps the hash and other parameters when it writes the countries in', () => {
    storeDefaultCountries(CUSTOM);
    mount('/p?year=2010#methodology');
    const url = text('url')!;
    expect(url.endsWith('#methodology')).toBe(true);
    const params = query(url.split('#')[0]);
    expect(params.get('year')).toBe('2010');
    expect(params.getAll('countries')).toEqual(CUSTOM);
  });

  it('a link from someone with their own defaults shows their countries to a visitor with none (the shared-link round trip)', () => {
    storeDefaultCountries(CUSTOM);
    const sender = mount();
    const copied = text('url')!;
    sender.unmount();
    localStorage.clear(); // the recipient: a fresh profile
    mount(`/p${copied}`);
    expect(text('many')).toBe(CUSTOM.join('|'));
    expect(text('one')).toBe('India');
    expect(text('custom')).toBe('false');
  });

  it('a ?countries= in the address always overrides the stored list, and so does ?country=', () => {
    storeDefaultCountries(CUSTOM);
    mount('/p?countries=China&countries=Japan&country=Vietnam');
    expect(text('many')).toBe('China|Japan');
    expect(text('one')).toBe('Vietnam');
    expect(query(text('url')!).getAll('countries')).toEqual(['China', 'Japan']);
  });

  it('for a visitor with defaults of their own, choosing exactly the Featured ten still writes them in (a bare address would mean their defaults on reload)', () => {
    storeDefaultCountries(CUSTOM);
    mount();
    act(() => setMany(FEATURED));
    expect(query(text('url')!).getAll('countries')).toEqual(FEATURED);
    act(() => setOne('China'));
    expect(query(text('url')!).get('country')).toBe('China');
  });

  it('for a visitor without, choosing exactly the Featured ten (or its first) leaves the address bare, as before', () => {
    mount('/p?countries=China&country=India');
    act(() => setMany(FEATURED));
    act(() => setOne('China'));
    expect(text('url')).toBe('');
  });

  it('resetting goes back to their defaults', () => {
    storeDefaultCountries(CUSTOM);
    mount('/p?countries=China');
    expect(text('many')).toBe('China');
    act(() => reset());
    expect(text('many')).toBe(CUSTOM.join('|'));
  });

  it('a stored list of names that are all gone falls back to the Featured ten, with a bare address', () => {
    storeDefaultCountries(['Atlantis']);
    mount();
    expect(text('many')).toBe(FEATURED.join('|'));
    expect(text('custom')).toBe('false');
    expect(text('url')).toBe('');
  });
});

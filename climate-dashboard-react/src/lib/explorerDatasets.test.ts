import { describe, expect, it } from 'vitest';
import type { ExplorerDataset } from '../api/types';
import { coverageText, LICENCE_TAG_COLOR, licenceName } from './explorerDatasets';

const d = (over: Partial<ExplorerDataset>) => ({ grain: 'global_year', coverage: { first: '1850', last: '2025', countries: null }, default_year_range: [1850, 2025], ...over }) as ExplorerDataset;

describe('LICENCE_TAG_COLOR', () => {
  it('is positive for an open licence and caution for both non-commercial classes', () => {
    expect(LICENCE_TAG_COLOR).toEqual({ open: 'positive', non_commercial: 'caution', non_commercial_share_alike: 'caution' });
  });
});

describe('coverageText', () => {
  it('writes a year range, with the number of countries for a country data set', () => {
    expect(coverageText(d({}))).toBe('1850–2025');
    expect(coverageText(d({ grain: 'country_year', coverage: { first: '1990', last: '2024', countries: 218 }, default_year_range: [1990, 2024] }))).toBe('1990–2024 · 218 countries');
  });
  it('says where the table is shown from only when the range it is showing starts later than the data, and follows that range', () => {
    const primap = d({ coverage: { first: '1750', last: '2024', countries: null }, default_year_range: [1970, 2024] });
    expect(coverageText(primap, 1970)).toBe('1750–2024 · shown from 1970');
    expect(coverageText(primap, 2000)).toBe('1750–2024 · shown from 2000'); // the slider moved: the note moved with it
    expect(coverageText(primap, 1750)).toBe('1750–2024'); // back at the first year: nothing to say
    expect(coverageText(primap)).toBe('1750–2024'); // no range given: never the default's
    expect(coverageText(d({ grain: 'global_month', coverage: { first: '1958-03', last: '2026-09', countries: null } }), 2000)).toBe('March 1958 – September 2026 · shown from 2000');
  });
  it('names the months of a monthly data set', () => {
    expect(coverageText(d({ grain: 'global_month', coverage: { first: '1958-03', last: '2026-09', countries: null }, default_year_range: [1958, 2026] }))).toBe('March 1958 – September 2026');
  });
  it('is empty without coverage', () => {
    expect(coverageText(d({ coverage: null }))).toBe('');
  });
});

describe('licenceName', () => {
  it('is the text before the first " · ", for the real provenance strings', () => {
    expect(licenceName('CC BY-NC-SA 4.0 · non-commercial')).toBe('CC BY-NC-SA 4.0');
    expect(licenceName('CC BY-NC 4.0 · non-commercial')).toBe('CC BY-NC 4.0');
    expect(licenceName('CC BY 4.0 (OWID compilation)')).toBe('CC BY 4.0 (OWID compilation)');
    expect(licenceName('Public domain (NOAA); cite Law Dome')).toBe('Public domain (NOAA); cite Law Dome');
  });
  it('is null when there is no licence text', () => {
    expect(licenceName(null)).toBeNull();
    expect(licenceName(undefined)).toBeNull();
    expect(licenceName('')).toBeNull();
    expect(licenceName(' · non-commercial')).toBeNull();
  });
});

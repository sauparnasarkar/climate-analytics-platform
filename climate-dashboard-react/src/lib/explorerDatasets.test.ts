import { describe, expect, it } from 'vitest';
import type { ExplorerDataset } from '../api/types';
import { coverageText, LICENCE_TAG_COLOR } from './explorerDatasets';

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
  it('says where a data set opens when that is later than its first year', () => {
    expect(coverageText(d({ coverage: { first: '1750', last: '2024', countries: null }, default_year_range: [1970, 2024] }))).toBe('1750–2024 · opens at 1970');
  });
  it('names the months of a monthly data set', () => {
    expect(coverageText(d({ grain: 'global_month', coverage: { first: '1958-03', last: '2026-09', countries: null }, default_year_range: [1958, 2026] }))).toBe('March 1958 – September 2026');
  });
  it('is empty without coverage', () => {
    expect(coverageText(d({ coverage: null }))).toBe('');
  });
});

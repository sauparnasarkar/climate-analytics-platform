import type { WorldMapTimeSeries } from '../api/types';

// By Country for any page year, computed from the columnar series the map already holds (every country's annual CO₂ from 1970) instead of one API request
// per year: each selected country's CO₂ in the year, largest first. (Top Movers and % Change moved to Historical Trends, `lib/movers.ts`.)

export interface CountryValue {
  country: string;
  value: number;
}

export interface Mover {
  country: string;
  co2Base: number;
  co2Year: number;
  absoluteChange: number;
  pctChange: number;
}

function column(series: WorldMapTimeSeries, names: string[], year: number): Array<{ country: string; value: number | null }> | null {
  const row = series.years.indexOf(year);
  if (row < 0) return null;
  const wanted = new Set(names);
  return series.countries.flatMap((country, i) => (wanted.has(country) ? [{ country, value: series.values[row][i] ?? null }] : []));
}

/** The selected countries' CO₂ (Mt) in `year`, largest first; countries with no value that year are left out. Empty if the year is outside the series. */
export function countryValuesForYear(series: WorldMapTimeSeries, names: string[], year: number): CountryValue[] {
  return (column(series, names, year) ?? [])
    .filter((c): c is CountryValue => c.value !== null)
    .sort((a, b) => b.value - a.value);
}

import type { TimeseriesSeries } from '../api/types';
import { BASELINE_YEAR } from '../constants';
import type { Mover } from './yearViews';

/** Each selected country's change from the baseline year to `year` (the latest year any of them has data for unless the reader chose another that the data has), biggest
 * growth first: the Top Movers and % Change views on Historical Trends, read from the same annual CO₂ series as its chart. The definitions are the API's /overview ones
 * (absolute Mt and %, from the 1990 baseline). `years` lists every year after the baseline that the data covers, for the year control. Null when there is nothing to
 * measure: no series, the baseline year is not in the data, or no year after it. A country lacking a value (or a non-zero baseline) in either year is left out, as the API drops them. */
export function moversFromSeries(series: TimeseriesSeries[], chosen: number | null = null, baseYear: number = BASELINE_YEAR): { year: number; years: number[]; movers: Mover[] } | null {
  const years = [...new Set(series.flatMap((s) => s.years))].filter((y) => y > baseYear).sort((a, b) => a - b);
  if (years.length === 0) return null;
  const year = chosen !== null && years.includes(chosen) ? chosen : years[years.length - 1];
  const at = (s: TimeseriesSeries, y: number) => {
    const i = s.years.indexOf(y);
    return i < 0 ? null : s.values[i] ?? null;
  };
  if (!series.some((s) => at(s, baseYear) !== null)) return null;
  const movers = series
    .flatMap((s) => {
      const base = at(s, baseYear);
      const now = at(s, year);
      if (base === null || now === null || base === 0) return [];
      const absoluteChange = now - base;
      return [{ country: s.name, co2Base: base, co2Year: now, absoluteChange, pctChange: (absoluteChange / base) * 100 }];
    })
    .sort((a, b) => b.pctChange - a.pctChange);
  return { year, years, movers };
}

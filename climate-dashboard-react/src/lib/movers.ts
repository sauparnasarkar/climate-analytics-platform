import type { TimeseriesSeries } from '../api/types';
import { BASELINE_YEAR } from '../constants';
import type { Mover } from './yearViews';

/** Each selected country's change from the baseline year to the latest year any of them has data for, biggest growth first: the Top Movers and % Change views on
 * Historical Trends, read from the same annual CO₂ series as its chart. The definitions are the API's /overview ones (absolute Mt and %, from the 1990 baseline).
 * Null when there is nothing to measure: no series, the baseline year is not in the data, or the latest year is not after it. A country lacking a value (or a non-zero
 * baseline) in either year is left out, as the API drops them. */
export function moversFromSeries(series: TimeseriesSeries[], baseYear: number = BASELINE_YEAR): { year: number; movers: Mover[] } | null {
  const year = Math.max(...series.flatMap((s) => s.years), Number.NEGATIVE_INFINITY);
  if (!Number.isFinite(year) || year <= baseYear) return null;
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
  return { year, movers };
}

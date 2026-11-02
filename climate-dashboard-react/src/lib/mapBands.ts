import { bandIndex } from '@syena/ds';

// The Overview map's colour bands (All Countries, Absolute and Cumulative). A FIXED scale, not derived from the data shown: a country that changes colour
// between two years has crossed a band, so a change of colour is a real change. Seven breaks make eight bands; a value equal to a break is in the upper band.

export type BandMode = 'absolute' | 'cumulative';

export interface MapBandScale {
  /** Seven ascending breaks, MtCO₂ */
  breaks: number[];
  /** The range of each of the eight bands, lightest first */
  labels: string[];
}

export const MAP_BANDS: Record<BandMode, MapBandScale> = {
  // Yearly emissions, MtCO₂
  absolute: { breaks: [1, 10, 100, 250, 500, 1000, 2500], labels: ['<1', '1–10', '10–100', '100–250', '250–500', '500–1k', '1k–2.5k', '2.5k+'] },
  // The running total emitted: breaks in MtCO₂, labels in GtCO₂ (the same breaks ÷ 1000)
  cumulative: { breaks: [100, 1000, 5000, 20000, 50000, 100000, 250000], labels: ['<0.1', '0.1–1', '1–5', '5–20', '20–50', '50–100', '100–250', '250+'] }, // the breaks are in MtCO₂ (the unit of the values); the cumulative labels are in GtCO₂, the unit the card shows
};

export interface BandMove {
  iso: string;
  name: string;
  from: number;
  to: number;
  /** Bands crossed: positive is up (more CO₂) */
  steps: number;
  /** The change in MtCO₂ (now − before): what the list is ranked on */
  change: number;
  /** The value now, the tie-break (larger first) */
  value: number;
}

export const OUTSIDE_MOVERS = 3;

/** The band a country was in before and is in now, and how many it crossed; null when it has no value in either year (nothing to compare). A real zero is a value, in the lowest band. */
export function bandChange(before: number | null | undefined, now: number | null | undefined, breaks: ReadonlyArray<number>): { from: number; to: number; steps: number } | null {
  if (now == null || !(now >= 0) || before == null || !(before >= 0)) return null;
  const from = bandIndex(before, breaks);
  const to = bandIndex(now, breaks);
  return { from, to, steps: to - from };
}

/**
 * The countries OUTSIDE the chosen ones that changed band since the comparison year, the biggest changes in tonnes first (ups and downs together, by the size of the
 * change in MtCO₂, ties by the larger value now): the top `limit`. Cumulative totals cannot fall, so that mode asks for ups only. `exclude` holds the indices of the
 * chosen countries. `before` and `now` are values by country, parallel to `isos` and `names`.
 */
export function outsideMovers(
  before: ReadonlyArray<number | null | undefined>,
  now: ReadonlyArray<number | null | undefined>,
  isos: ReadonlyArray<string>,
  names: ReadonlyArray<string>,
  breaks: ReadonlyArray<number>,
  exclude: ReadonlySet<number>,
  { upOnly = false, limit = OUTSIDE_MOVERS }: { upOnly?: boolean; limit?: number } = {},
): BandMove[] {
  const moves: BandMove[] = [];
  now.forEach((value, i) => {
    if (exclude.has(i)) return;
    const c = bandChange(before[i], value, breaks);
    if (!c || c.steps === 0 || (upOnly && c.steps < 0)) return;
    moves.push({ iso: isos[i], name: names[i], from: c.from, to: c.to, steps: c.steps, change: (value as number) - (before[i] as number), value: value as number });
  });
  return moves.sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.value - a.value).slice(0, limit);
}

/** The scale for the map in the unit the card shows: Absolute stays in MtCO₂; Cumulative is in GtCO₂ (the breaks ÷ 1000, the values ÷ 1000 by the caller). */
export const MAP_UNIT_DIVISOR: Record<BandMode, number> = { absolute: 1, cumulative: 1000 };

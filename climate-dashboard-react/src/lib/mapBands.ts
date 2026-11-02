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
  // The running total emitted, MtCO₂
  cumulative: { breaks: [100, 1000, 5000, 20000, 50000, 100000, 250000], labels: ['<100', '100–1k', '1k–5k', '5k–20k', '20k–50k', '50k–100k', '100k–250k', '250k+'] },
};

export interface BandMove {
  iso: string;
  name: string;
  from: number;
  to: number;
  /** Bands crossed: positive is up (more CO₂) */
  steps: number;
  /** The value now, the tie-break (larger first) */
  value: number;
}

export const MOVES_UP = 4;
export const MOVES_DOWN = 3;

/**
 * The countries that changed band between two years of the same mode: the largest moves up (`MOVES_UP`), then the largest down (`MOVES_DOWN`); the size of a move
 * is the number of bands crossed, ties broken by the larger value now. A country with no value in either year is left out (there is nothing to compare).
 * `before` and `now` are values by country, parallel to `isos` and `names`.
 */
export function bandMoves(
  before: ReadonlyArray<number | null | undefined>,
  now: ReadonlyArray<number | null | undefined>,
  isos: ReadonlyArray<string>,
  names: ReadonlyArray<string>,
  breaks: ReadonlyArray<number>,
): BandMove[] {
  const moves: BandMove[] = [];
  now.forEach((value, i) => {
    const v0 = before[i];
    if (value == null || !(value > 0) || v0 == null || !(v0 > 0)) return;
    const from = bandIndex(v0, breaks);
    const to = bandIndex(value, breaks);
    if (from !== to) moves.push({ iso: isos[i], name: names[i], from, to, steps: to - from, value });
  });
  const ups = moves.filter((m) => m.steps > 0).sort((a, b) => b.steps - a.steps || b.value - a.value).slice(0, MOVES_UP);
  const downs = moves.filter((m) => m.steps < 0).sort((a, b) => a.steps - b.steps || b.value - a.value).slice(0, MOVES_DOWN);
  return [...ups, ...downs];
}

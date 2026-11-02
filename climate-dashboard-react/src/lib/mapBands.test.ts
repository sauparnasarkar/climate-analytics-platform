import { describe, expect, it } from 'vitest';
import { MAP_BANDS, MOVES_DOWN, MOVES_UP, bandMoves } from './mapBands';

const ABS = MAP_BANDS.absolute.breaks;
const isos = (n: number) => Array.from({ length: n }, (_, i) => `C${i}`);
const names = (n: number) => Array.from({ length: n }, (_, i) => `Country ${i}`);

describe('the fixed scales', () => {
  it('have seven ascending breaks and eight labels each', () => {
    for (const scale of Object.values(MAP_BANDS)) {
      expect(scale.breaks).toHaveLength(7);
      expect(scale.labels).toHaveLength(8);
      expect(scale.breaks.every((b, i) => i === 0 || b > scale.breaks[i - 1])).toBe(true);
    }
  });
});

describe('bandMoves', () => {
  it('reports a country whose value crossed a break; a value equal to a break is in the upper band', () => {
    // 9.99 → band 1 (1–10); exactly 10 → band 2 (10–100)
    const moves = bandMoves([9.99], [10], ['AAA'], ['Alpha'], ABS);
    expect(moves).toEqual([{ iso: 'AAA', name: 'Alpha', from: 1, to: 2, steps: 1, change: 10 - 9.99, value: 10 }]);
  });

  it('leaves out a country that stayed in its band, or has no value in either year', () => {
    const moves = bandMoves([20, null, 5, null], [90, 600, null, 700], isos(4), names(4), ABS);
    expect(moves).toEqual([]);
  });

  it('counts a real zero as a value in the lowest band (Antarctica reports 0.0), both before and now', () => {
    expect(bandMoves([0], [30], ['ATA'], ['Antarctica'], ABS)).toEqual([{ iso: 'ATA', name: 'Antarctica', from: 0, to: 2, steps: 2, change: 30, value: 30 }]);
    expect(bandMoves([30], [0], ['ATA'], ['Antarctica'], ABS)[0]).toMatchObject({ from: 2, to: 0, steps: -2 });
    expect(bandMoves([0], [0.5], ['ATA'], ['Antarctica'], ABS)).toEqual([]); // still in the lowest band
  });

  // 1990 → 2024, MtCO₂ (rounded): the yearly bands, ranked by the change in tonnes.
  const NAMES = ['China', 'India', 'Iran', 'Saudi Arabia', 'Indonesia', 'Russia', 'Ukraine', 'Japan', 'Germany'];
  const CODES = ['CHN', 'IND', 'IRN', 'SAU', 'IDN', 'RUS', 'UKR', 'JPN', 'DEU'];
  const BEFORE = [2480, 600, 220, 160, 200, 2600, 600, 1100, 1000];
  const NOW = [12289, 3193, 802, 670, 700, 1781, 140, 962, 600];

  it('ranks the moves up by the increase in tonnes, not the bands crossed: China (one band, +9,809 Mt) is on the list', () => {
    const ups = bandMoves(BEFORE, NOW, CODES, NAMES, ABS).filter((m) => m.steps > 0);
    expect(ups.map((m) => m.name)).toEqual(['China', 'India', 'Iran', 'Saudi Arabia']); // Indonesia (+500 Mt, also two bands) is fifth, out of the top 4
    expect(ups[0]).toMatchObject({ steps: 1 });
  });

  it('puts Saudi Arabia (two bands, +510 Mt) below Iran (two bands, +582 Mt)', () => {
    const ups = bandMoves(BEFORE, NOW, CODES, NAMES, ABS).filter((m) => m.steps > 0).map((m) => m.name);
    expect(ups.indexOf('Iran')).toBeLessThan(ups.indexOf('Saudi Arabia'));
    const saudi = bandMoves(BEFORE, NOW, CODES, NAMES, ABS).find((m) => m.name === 'Saudi Arabia')!;
    expect(saudi).toMatchObject({ steps: 2, change: 510 });
  });

  it('ranks the moves down by the decrease in tonnes, after the ups: at most 4 up then 3 down', () => {
    const moves = bandMoves(BEFORE, NOW, CODES, NAMES, ABS);
    expect(moves.filter((m) => m.steps < 0).map((m) => m.name)).toEqual(['Russia', 'Ukraine', 'Germany']); // −819, −460, −400 Mt; Japan (−138 Mt) is the fourth, out of the top 3
    expect(moves.map((m) => m.steps > 0)).toEqual([true, true, true, true, false, false, false]);
    expect(moves).toHaveLength(MOVES_UP + MOVES_DOWN);
  });

  it('breaks a tie in tonnes by the larger value now', () => {
    const tie = bandMoves([5, 50], [105, 150], ['AAA', 'BBB'], ['Small', 'Big'], ABS); // +100 Mt each
    expect(tie.map((m) => m.name)).toEqual(['Big', 'Small']);
  });

  it('on the cumulative breaks, with ups only, has no down group at all', () => {
    const cum = MAP_BANDS.cumulative.breaks;
    const moves = bandMoves([90, 6000, 25000], [130, 7000, 60000], ['AAA', 'BBB', 'CCC'], ['A', 'B', 'C'], cum, { upOnly: true });
    expect(moves.every((m) => m.steps > 0)).toBe(true);
    // a fall (impossible for a running total, but the helper must still not list it)
    expect(bandMoves([6000], [90], ['AAA'], ['A'], cum, { upOnly: true })).toEqual([]);
  });

  it('works on the cumulative breaks', () => {
    const moves = bandMoves([90], [100], ['AAA'], ['Alpha'], MAP_BANDS.cumulative.breaks);
    expect(moves[0]).toMatchObject({ from: 0, to: 1, steps: 1 });
  });
});

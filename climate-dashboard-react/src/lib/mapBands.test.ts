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
    expect(moves).toEqual([{ iso: 'AAA', name: 'Alpha', from: 1, to: 2, steps: 1, value: 10 }]);
  });

  it('leaves out a country that stayed in its band, or has no value in either year', () => {
    const moves = bandMoves([20, null, 5, 0], [90, 600, null, 700], isos(4), names(4), ABS);
    expect(moves).toEqual([]);
  });

  it('orders the largest moves up first (4), then down (3), by bands crossed, ties by the larger value now', () => {
    const before = [0.5, 5, 50, 5, 5, 5, 5000, 3000, 800, 800, 800];
    const now = [3000, 600, 300, 600, 300, 12, 40, 60, 5, 6, 2000];
    // bands crossed: C0 +7; C1 +4; C2 +2; C3 +4; C4 +3; C5 +1; C6 −5; C7 −5; C8 −4; C9 −4; C10 +1
    const moves = bandMoves(before, now, isos(11), names(11), ABS);
    expect(moves.slice(0, MOVES_UP).map((m) => m.iso)).toEqual(['C0', 'C1', 'C3', 'C4']); // +7, then the two +4 (equal values keep their order), then +3
    expect(moves.slice(MOVES_UP).map((m) => m.iso)).toEqual(['C7', 'C6', 'C9']); // −5 (the larger value now, 60, first), then the best −4 (6 before 5)
    expect(moves).toHaveLength(MOVES_UP + MOVES_DOWN);
  });

  it('works on the cumulative breaks', () => {
    const moves = bandMoves([90], [100], ['AAA'], ['Alpha'], MAP_BANDS.cumulative.breaks);
    expect(moves[0]).toMatchObject({ from: 0, to: 1, steps: 1 });
  });
});

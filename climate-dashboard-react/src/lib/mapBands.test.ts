import { describe, expect, it } from 'vitest';
import { MAP_BANDS, OUTSIDE_MOVERS, bandChange, outsideMovers } from './mapBands';

const ABS = MAP_BANDS.absolute.breaks;

describe('the fixed scales', () => {
  it('have seven ascending breaks and eight labels each', () => {
    for (const scale of Object.values(MAP_BANDS)) {
      expect(scale.breaks).toHaveLength(7);
      expect(scale.labels).toHaveLength(8);
      expect(scale.breaks.every((b, i) => i === 0 || b > scale.breaks[i - 1])).toBe(true);
    }
  });
});

describe('bandChange', () => {
  it('names the band before and now and how many were crossed: up, down, unchanged', () => {
    expect(bandChange(150, 700, ABS)).toEqual({ from: 3, to: 5, steps: 2 }); // 100–250 → 500–1k
    expect(bandChange(2600, 1700, ABS)).toEqual({ from: 7, to: 6, steps: -1 });
    expect(bandChange(20, 90, ABS)).toEqual({ from: 2, to: 2, steps: 0 });
  });

  it('puts a value equal to a break in the upper band', () => {
    expect(bandChange(9.99, 10, ABS)).toEqual({ from: 1, to: 2, steps: 1 });
  });

  it('is null when either year has no value, and counts a real zero as a value in the lowest band', () => {
    expect(bandChange(null, 50, ABS)).toBeNull();
    expect(bandChange(50, undefined, ABS)).toBeNull();
    expect(bandChange(0, 30, ABS)).toEqual({ from: 0, to: 2, steps: 2 });
  });
});

describe('outsideMovers', () => {
  const CODES = ['CHN', 'IND', 'IRN', 'SAU', 'IDN', 'RUS', 'UKR', 'DEU'];
  const NAMES = ['China', 'India', 'Iran', 'Saudi Arabia', 'Indonesia', 'Russia', 'Ukraine', 'Germany'];
  const BEFORE = [2480, 600, 220, 160, 200, 2600, 600, 1000];
  const NOW = [12289, 3193, 802, 670, 700, 1781, 140, 600];

  it('ranks ups and downs together by the size of the change in tonnes, and keeps the top 3', () => {
    // changes: China +9,809; India +2,593; Russia −819; Iran +582; Saudi +510; Indonesia +500; Ukraine −460; Germany −400
    const moves = outsideMovers(BEFORE, NOW, CODES, NAMES, ABS, new Set());
    expect(OUTSIDE_MOVERS).toBe(3);
    expect(moves.map((m) => m.name)).toEqual(['China', 'India', 'Russia']);
    expect(moves.map((m) => m.steps)).toEqual([1, 2, -1]);
  });

  it('never lists a chosen country: they have their own rows', () => {
    const moves = outsideMovers(BEFORE, NOW, CODES, NAMES, ABS, new Set([0, 1])); // China and India chosen
    expect(moves.map((m) => m.name)).toEqual(['Russia', 'Iran', 'Saudi Arabia']);
  });

  it('in Cumulative (ups only) has no down group', () => {
    const moves = outsideMovers(BEFORE, NOW, CODES, NAMES, MAP_BANDS.cumulative.breaks, new Set(), { upOnly: true });
    expect(moves.every((m) => m.steps > 0)).toBe(true);
    const falling = outsideMovers([6000], [90], ['AAA'], ['A'], MAP_BANDS.cumulative.breaks, new Set(), { upOnly: true });
    expect(falling).toEqual([]);
  });

  it('leaves out a country that stayed in its band or has no value in either year, and breaks a tie in tonnes by the larger value now', () => {
    expect(outsideMovers([20, null, 5, null], [90, 600, null, 700], CODES.slice(0, 4), NAMES.slice(0, 4), ABS, new Set())).toEqual([]);
    const tie = outsideMovers([5, 50], [105, 150], ['AAA', 'BBB'], ['Small', 'Big'], ABS, new Set()); // +100 Mt each
    expect(tie.map((m) => m.name)).toEqual(['Big', 'Small']);
  });
});

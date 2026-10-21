import { describe, expect, it } from 'vitest';
import type { HistoricalCumulativeResponse } from '../api/types';
import { REST_OF_WORLD, cumulativeAreaSeries, shareLineSeries } from './historicalCumulative';

const DATA: HistoricalCumulativeResponse = {
  years: [1970, 2000, 2024],
  series: [
    { name: 'Germany', cumulative_co2: [45000, 70000, 95000], share_of_world_cumulative: [10, 7, 5], share_of_world_annual: [5, 3, 1.5] },
    { name: 'China', cumulative_co2: [null, 100000, 285000], share_of_world_cumulative: [null, 12, 15.4], share_of_world_annual: [null, 14, 31.8] },
    { name: 'United States', cumulative_co2: [150000, 300000, 435000], share_of_world_cumulative: [33, 30, 23.5], share_of_world_annual: [25, 22, 12.7] },
  ],
  world_cumulative_co2: [450000, 800000, 1849000],
};

describe('cumulativeAreaSeries', () => {
  const series = cumulativeAreaSeries(DATA);

  it('stacks the largest accumulated total at the bottom and Rest of world last', () => {
    expect(series.map((s) => s.name)).toEqual(['United States', 'China', 'Germany', REST_OF_WORLD]);
    expect(series.every((s) => s.kind === 'area')).toBe(true);
    // Rest of world takes the Chart's own "other" colour, which is the slot after the eighth.
    expect(series[series.length - 1].slot).toBe(9);
  });

  it('keeps each country\'s picker-order slot (and so its colour) even though the stack is re-ordered by size', () => {
    // Picker order is Germany, China, United States; the stack order is United States, China, Germany.
    expect(Object.fromEntries(series.slice(0, 3).map((s) => [s.name, s.slot]))).toEqual({
      Germany: 1, China: 2, 'United States': 3,
    });
  });

  it('numbers the slots by picker position without a limit: the Chart gives every slot past the eighth its "other" colour', () => {
    const names = Array.from({ length: 10 }, (_, i) => `Country ${i + 1}`);
    const many = { ...DATA, series: names.map((name) => ({ ...DATA.series[0], name })) };
    const slots = cumulativeAreaSeries(many).filter((s) => s.name !== REST_OF_WORLD).map((s) => s.slot);
    expect(slots.sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('converts Mt to Gt', () => {
    expect(series[0].y).toEqual([150, 300, 435]);
  });

  it('counts a country with no value yet as zero in the stack', () => {
    expect(series.find((s) => s.name === 'China')!.y[0]).toBe(0);
  });

  it('makes the full stack height equal the world total', () => {
    for (let i = 0; i < DATA.years.length; i++) {
      const total = series.reduce((sum, s) => sum + (s.y[i] ?? 0), 0);
      expect(total).toBeCloseTo(DATA.world_cumulative_co2[i]! / 1000, 6);
    }
  });

  it('floors Rest of world at zero and leaves it null where World has no value', () => {
    const over = cumulativeAreaSeries({ ...DATA, world_cumulative_co2: [100000, null, 1000] });
    const rest = over[over.length - 1];
    expect(rest.y).toEqual([0, null, 0]);
  });
});

describe('shareLineSeries', () => {
  it('returns one line per country in picker order, with the share and no Rest of world', () => {
    const lines = shareLineSeries(DATA);
    expect(lines.map((s) => s.name)).toEqual(['Germany', 'China', 'United States']);
    expect(lines.every((s) => s.kind === 'line')).toBe(true);
    expect(lines[1].y).toEqual([null, 12, 15.4]);
  });
});

import { describe, expect, it } from 'vitest';
import type { TimeseriesSeries } from '../api/types';
import { moversFromSeries } from './movers';

const s = (name: string, years: number[], values: Array<number | null>): TimeseriesSeries => ({ name, years, values });

describe('moversFromSeries', () => {
  it('measures each country from 1990 to the latest year, biggest growth first, in Mt and %', () => {
    const r = moversFromSeries([s('UK', [1990, 2024], [600, 300]), s('India', [1990, 2024], [500, 2500]), s('China', [1990, 2024], [2000, 10000])])!;
    expect(r.year).toBe(2024);
    expect(r.movers.map((m) => m.country)).toEqual(['India', 'China', 'UK']);
    expect(r.movers[0]).toMatchObject({ co2Base: 500, co2Year: 2500, absoluteChange: 2000, pctChange: 400 });
    expect(r.movers[2]).toMatchObject({ absoluteChange: -300, pctChange: -50 });
  });

  it('leaves out a country with no value in either year or a zero baseline, as the API does', () => {
    const r = moversFromSeries([s('A', [1990, 2024], [null, 10]), s('B', [1990, 2024], [10, null]), s('C', [1990, 2024], [0, 10]), s('D', [1990, 2024], [10, 20])])!;
    expect(r.movers.map((m) => m.country)).toEqual(['D']);
  });

  it('takes the latest year any country has, and drops one whose series ends earlier', () => {
    const r = moversFromSeries([s('A', [1990, 2023], [10, 12]), s('B', [1990, 2024], [10, 20])])!;
    expect(r.year).toBe(2024);
    expect(r.movers.map((m) => m.country)).toEqual(['B']);
  });

  it('is null when there is nothing to compare: no series, no 1990 value, or the latest year is not after the baseline', () => {
    expect(moversFromSeries([])).toBeNull();
    expect(moversFromSeries([s('A', [2000, 2024], [1, 2])])).toBeNull();
    expect(moversFromSeries([s('A', [1980, 1990], [1, 2])])).toBeNull();
  });
});

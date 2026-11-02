import { describe, expect, it } from 'vitest';
import { alignedYear, buildAlignedChain, emissionsYearValues, valueAt } from './alignedYear';
import type { ClimateSignal } from './climateSignal';

const signal = (conc: Array<[number, number]>, temp: Array<[number, number]>): ClimateSignal => ({
  points: [], fit: { slope: 0.5, ciLow: 0.4, ciHigh: 0.6, rSquared: null, unit: 'u', start: 1850, end: 2024, nYears: 175 }, line: { x0: 0, y0: 0, x1: 1, y1: 1 },
  temperature: { year: temp[temp.length - 1][0], value: temp[temp.length - 1][1] }, concentration: { year: conc[conc.length - 1][0], value: conc[conc.length - 1][1] },
  series: { concentration: conc.map(([year, value]) => ({ year, value })), temperature: temp.map(([year, value]) => ({ year, value })) },
  spliceYear: null, ppm1850: null, omittedYears: [], vintageCaveat: null,
});

describe('alignedYear', () => {
  it('is the earliest of the latest years, ignoring missing ones', () => {
    expect(alignedYear([2024, 2025, 2025])).toBe(2024);
    expect(alignedYear([null, 2025, 2024])).toBe(2024);
    expect(alignedYear([])).toBeNull();
  });

  it('skips world-map rows that are all null (missing, not zero)', () => {
    const rows = emissionsYearValues({ years: [2023, 2024, 2025], iso_codes: ['A', 'B'], values: [[1, 2], [3, null], [null, null]] } as never);
    expect(rows).toEqual([{ year: 2023, value: 3 }, { year: 2024, value: 3 }]);
  });
});

describe('buildAlignedChain', () => {
  const emissions = [{ year: 2023, value: 100 }, { year: 2024, value: 110 }];
  it('takes each value at the aligned year, from the series (never hard-coded)', () => {
    const c = buildAlignedChain(signal([[2024, 424], [2025, 427]], [[2024, 1.6], [2025, 1.4]]), emissions)!;
    expect(c.year).toBe(2024);
    expect(c.emissions).toMatchObject({ value: 110, year: 2024, note: null });
    expect(c.concentration).toMatchObject({ value: 424, year: 2024 });
    expect(c.temperature).toMatchObject({ value: 1.6, year: 2024 });
    expect(c.concentration.note).toBe('2025 is available: 427.0 ppm (NOAA GML). Shown for 2024 so all four steps refer to the same year.');
  });

  it('moves when emissions gain a year, and the notes disappear', () => {
    const c = buildAlignedChain(signal([[2024, 424], [2025, 427]], [[2024, 1.6], [2025, 1.4]]), [...emissions, { year: 2025, value: 120 }])!;
    expect(c.year).toBe(2025);
    expect(c.concentration.note).toBeNull();
    expect(c.temperature.note).toBeNull();
  });

  it('adds the record-year context only for a marked difference, with the 5-year mean when known', () => {
    const marked = buildAlignedChain(signal([[2024, 424]], [[2023, 1.5], [2024, 1.6], [2025, 1.45]]), emissions, [{ year: 2025, value: 1.35 }])!;
    expect(marked.temperature.note).toContain('2024 was a record year; the 5-year mean to 2025 is 1.35 °C.');
    const small = buildAlignedChain(signal([[2024, 424]], [[2023, 1.5], [2024, 1.6], [2025, 1.55]]), emissions)!;
    expect(small.temperature.note).not.toContain('record');
    const notRecord = buildAlignedChain(signal([[2024, 424]], [[2023, 1.9], [2024, 1.6], [2025, 1.4]]), emissions)!;
    expect(notRecord.temperature.note).not.toContain('record');
  });

  it('falls back to a series\' own latest value when it has a gap at the aligned year, and is null without a signal', () => {
    const c = buildAlignedChain(signal([[2022, 420], [2023, 422]], [[2024, 1.6]]), emissions)!;
    expect(c.concentration).toMatchObject({ value: 422, year: 2023, note: null });
    expect(buildAlignedChain(null, emissions)).toBeNull();
    expect(valueAt(emissions, 2024)).toBe(110);
  });
});

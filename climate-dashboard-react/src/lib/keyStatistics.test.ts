import { describe, expect, it } from 'vitest';
import type { CountryProfileTableRow } from '../api/types';
import { KEY_STATISTICS_COLUMNS, plainYear } from './keyStatistics';

describe('plainYear', () => {
  it('writes a year as its digits, with no thousands separator', () => {
    expect(plainYear(2024)).toBe('2024');
    expect(plainYear(1990)).toBe('1990');
    expect(plainYear(null)).toBe('');
  });
});

describe('the Key Statistics columns', () => {
  const row = { year: 2024 } as CountryProfileTableRow;
  it('write the year plainly, while the figures keep their separators', () => {
    const year = KEY_STATISTICS_COLUMNS.find((c) => c.key === 'year')!;
    expect(year.format?.(row.year, row)).toBe('2024');
    expect(year.numeric).toBe(false); // left-aligned and set in the text face: a year is a label, not a quantity
    expect(KEY_STATISTICS_COLUMNS.find((c) => c.key === 'co2')!.format).toBeUndefined();
  });
});

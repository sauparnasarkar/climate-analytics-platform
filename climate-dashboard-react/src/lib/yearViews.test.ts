import { describe, expect, it } from 'vitest';
import type { WorldMapTimeSeries } from '../api/types';
import { countryValuesForYear } from './yearViews';

// 1989..2000 so the 1990 baseline is inside the series
const years = Array.from({ length: 12 }, (_, i) => 1989 + i);
const SERIES: WorldMapTimeSeries = {
  iso_codes: ['CHN', 'USA', 'DEU', 'SSD'],
  countries: ['China', 'United States', 'Germany', 'South Sudan'],
  years,
  // China doubles 1990 -> 2000, USA +10 %, Germany -20 %, South Sudan has no value before 1995
  values: years.map((y) => [y === 1990 ? 2000 : 2000 + (y - 1990) * 200, 5000 * (y === 1990 ? 1 : 1 + (y - 1990) * 0.01), y === 1990 ? 1000 : 1000 - (y - 1990) * 20, y >= 1995 ? 4 : null]),
  value_range: [0, 5500],
};

describe('countryValuesForYear', () => {
  it('lists the selected countries\' CO₂ for the year, largest first, leaving out those with no value', () => {
    expect(countryValuesForYear(SERIES, ['Germany', 'China', 'South Sudan'], 1992)).toEqual([
      { country: 'China', value: 2400 },
      { country: 'Germany', value: 960 },
    ]);
    expect(countryValuesForYear(SERIES, ['South Sudan'], 1996)).toEqual([{ country: 'South Sudan', value: 4 }]);
  });
  it('ignores countries that are not selected or not in the series, and a year outside it', () => {
    expect(countryValuesForYear(SERIES, ['Atlantis'], 1992)).toEqual([]);
    expect(countryValuesForYear(SERIES, ['China'], 1850)).toEqual([]);
  });
});

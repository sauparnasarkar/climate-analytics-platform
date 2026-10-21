import type { DataTableColumn } from '@syena/ds';
import type { CountryProfileTableRow } from '../api/types';

/** A year is a label, not a quantity: its digits, with no thousands separator. */
export const plainYear = (value: unknown): string => String(value ?? '');

export const KEY_STATISTICS_COLUMNS: DataTableColumn<CountryProfileTableRow>[] = [
  { key: 'year', header: 'Year', numeric: false, format: plainYear },
  { key: 'co2', header: 'CO₂ (MtCO₂)' },
  { key: 'co2_per_capita', header: 'CO₂ per Capita (t/person)' },
  { key: 'co2_yoy_pct_change', header: 'YoY % Change' },
  { key: 'ghg_intensity', header: 'GHG Intensity (kg CO₂e/$ GDP)' },
];

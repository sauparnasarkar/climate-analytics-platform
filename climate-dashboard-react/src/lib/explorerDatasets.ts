import type { ExplorerDataset, LicenceClass } from '../api/types';
import { monthName } from './explorerFigures';

/** The Tag colour for each licence class: positive for open (CC BY, public domain), caution for non-commercial and non-commercial share-alike (the caution tag carries its own icon). */
export const LICENCE_TAG_COLOR: Record<LicenceClass, 'positive' | 'caution'> = {
  open: 'positive',
  non_commercial: 'caution',
  non_commercial_share_alike: 'caution',
};

/** "YYYY" as it is; "YYYY-MM" as "March 1958". */
const writeCoverageEnd = (value: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  return m ? `${monthName(Number(m[2]))} ${m[1]}` : value;
};

/** "1990–2024 · 218 countries", "1750–2024 · opens at 1970", "March 1958 – September 2026": every figure from the API. */
export function coverageText(d: ExplorerDataset): string {
  if (!d.coverage) return '';
  const monthly = d.grain === 'global_month';
  const range = `${writeCoverageEnd(d.coverage.first)}${monthly ? ' – ' : '–'}${writeCoverageEnd(d.coverage.last)}`;
  const parts = [range];
  if (d.coverage.countries !== null) parts.push(`${d.coverage.countries.toLocaleString('en-GB')} countries`);
  if (d.default_year_range && Number(d.coverage.first.slice(0, 4)) < d.default_year_range[0]) parts.push(`opens at ${d.default_year_range[0]}`);
  return parts.join(' · ');
}

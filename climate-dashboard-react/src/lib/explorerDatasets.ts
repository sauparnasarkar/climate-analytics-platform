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

/** "1990–2024 · 218 countries", "1750–2024 · shown from 1970", "March 1958 – September 2026": every figure from the API. `shownFrom` is the first year of the range the table is
 * showing NOW (the slider's, not the data set's default): the note appears only while that is later than the data's first year, and follows the slider when it moves. */
export function coverageText(d: ExplorerDataset, shownFrom?: number): string {
  if (!d.coverage) return '';
  const monthly = d.grain === 'global_month';
  const range = `${writeCoverageEnd(d.coverage.first)}${monthly ? ' – ' : '–'}${writeCoverageEnd(d.coverage.last)}`;
  const parts = [range];
  if (d.coverage.countries !== null) parts.push(`${d.coverage.countries.toLocaleString('en-GB')} countries`);
  if (shownFrom !== undefined && Number(d.coverage.first.slice(0, 4)) < shownFrom) parts.push(`shown from ${shownFrom}`);
  return parts.join(' · ');
}

/** The licence's name for a sentence: the text before the first " · ". The API's `short_license` carries a suffix ("CC BY-NC-SA 4.0 · non-commercial"), which would read
 * twice in "must carry CC BY-NC-SA 4.0 · non-commercial". A rule over the real strings, pinned by a test; a `licence_name` field on the API is the cleaner follow-up if it proves brittle. */
export function licenceName(shortLicense: string | null | undefined): string | null {
  const name = shortLicense?.split(' · ')[0].trim();
  return name ? name : null;
}

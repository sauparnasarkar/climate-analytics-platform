const MINUS = '−';
const MAX_DECIMALS = 6;
const SUMMARY_DIGITS = 4;
const MAX_SUMMARY_DECIMALS = 3;

const write = (value: number, decimals: number) => {
  const body = new Intl.NumberFormat('en-GB', { maximumFractionDigits: decimals }).format(Math.abs(value));
  return value < 0 && Number(body.replace(/,/g, '')) !== 0 ? `${MINUS}${body}` : body;
};

/** A number as it is, with thousands separators and a true minus: the decimals it has, up to a few, and never padded. */
export const formatNatural = (value: unknown): string => (typeof value === 'number' ? write(value, MAX_DECIMALS) : String(value ?? ''));

/** A number to the decimals its column is published at (the indicator catalog's `decimals`): 22,646.308827 at 0 decimals is 22,646. Never padded, so 0.5 at 2 decimals is 0.5.
 * The download keeps every digit. Text is left as it is and a missing value empty. */
export const formatAt = (value: unknown, decimals: number): string => (typeof value === 'number' ? write(value, decimals) : String(value ?? ''));

/** A summary statistic written like the preview's: a whole number as it is, a fraction to four significant figures at most three decimals, without trailing zeros.
 * Missing is left empty (a column with no values has no minimum). */
export function formatStat(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  if (Number.isInteger(value)) return write(value, 0);
  const decimals = Math.min(MAX_SUMMARY_DECIMALS, Math.max(0, SUMMARY_DIGITS - 1 - Math.floor(Math.log10(Math.abs(value)))));
  return write(value, decimals);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A month number (1-12) as its name; anything else as it is, so an odd value is shown rather than hidden. */
export const monthName = (value: unknown): string => (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12 ? MONTHS[value - 1] : String(value ?? ''));

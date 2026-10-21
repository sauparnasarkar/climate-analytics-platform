const MINUS = '−';
const MAX_DECIMALS = 6;
const SUMMARY_DIGITS = 4;
const MAX_SUMMARY_DECIMALS = 3;
// The summary rows whose value is a position in the data, so for the year column a year.
const POSITION_STATISTICS = new Set(['mean', 'min', '25%', '50%', '75%', 'max']);

const write = (value: number, decimals: number) => {
  const body = new Intl.NumberFormat('en-GB', { maximumFractionDigits: decimals }).format(Math.abs(value));
  return value < 0 && Number(body.replace(/,/g, '')) !== 0 ? `${MINUS}${body}` : body;
};

/** A number as it is, with thousands separators and a true minus: the decimals it has, up to a few, and never padded. */
export const formatNatural = (value: unknown): string => (typeof value === 'number' ? write(value, MAX_DECIMALS) : String(value ?? ''));

const NUMBER_TEXT = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const asNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  return typeof value === 'string' && NUMBER_TEXT.test(value.trim()) ? Number(value) : NaN;
};

/** Whether every value that is there in a column of the summary is a number (as a number or as text). */
export const isNumberColumn = (values: unknown[]): boolean => {
  const present = values.filter((v) => v !== null && v !== undefined && v !== '');
  return present.length > 0 && present.every((v) => !Number.isNaN(asNumber(v)));
};

/** A summary value written like the preview's: a whole number as it is, a fraction to four significant figures at most three decimals, without trailing zeros. */
export function formatSummaryValue(column: string, value: unknown, statistic: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const n = asNumber(value);
  if (Number.isNaN(n)) return String(value);
  if (column === 'year' && POSITION_STATISTICS.has(String(statistic))) return String(Math.round(n * 10) / 10);
  if (Number.isInteger(n)) return write(n, 0);
  const decimals = Math.min(MAX_SUMMARY_DECIMALS, Math.max(0, SUMMARY_DIGITS - 1 - Math.floor(Math.log10(Math.abs(n)))));
  return write(n, decimals);
}

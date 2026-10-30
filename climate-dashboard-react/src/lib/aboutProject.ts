import type { CorrelationEmissionsTemperatureResponse } from '../api/correlationTypes';
import { AR6_TCRE } from './climateCopy';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

/** How the fit's 95% HAC range sits against the AR6 very-likely range: overlapping is "in line with"; entirely outside is "above" or "below". */
export function compareToAr6(range: readonly [number, number] | null): 'in line with' | 'above' | 'below' | null {
  if (!range || !Number.isFinite(range[0]) || !Number.isFinite(range[1])) return null;
  const [low, high] = range[0] <= range[1] ? range : [range[1], range[0]];
  if (low > AR6_TCRE.high) return 'above';
  if (high < AR6_TCRE.low) return 'below';
  return 'in line with';
}

export interface HeadlineFacts {
  years: number | null;
  /** Rounded to two decimals, as written */
  slope: string | null;
  comparison: 'in line with' | 'above' | 'below' | null;
}

/** The figures the project paragraph quotes from the headline fit. A figure that is absent (or whose unit is not the one the sentence says) is null, never a placeholder. */
export function headlineFacts(resp: CorrelationEmissionsTemperatureResponse | null | undefined): HeadlineFacts {
  const fit = resp?.fit as Record<string, unknown> | null | undefined;
  const slope = num(fit?.slope);
  // The sentence says "per 1,000 billion tonnes"; quote the slope only if the API's unit is that one.
  const unit = typeof fit?.unit === 'string' ? fit.unit : '';
  const slopeOk = slope !== null && slope > 0 && /1,000\s*GtCO/.test(unit);
  const years = count(fit?.n_years) ?? (num(fit?.start) !== null && num(fit?.end) !== null ? count(num(fit?.end)! - num(fit?.start)! + 1) : null);
  const ci = Array.isArray(fit?.ci95_hac) ? (fit!.ci95_hac as unknown[]).map(num) : [];
  const range = ci.length === 2 && ci[0] !== null && ci[1] !== null ? ([ci[0], ci[1]] as const) : null;
  return { years, slope: slopeOk ? slope!.toFixed(2) : null, comparison: slopeOk ? compareToAr6(range) : null };
}

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** 1–10 in words, otherwise the numeral; null for anything that is not a positive whole number. */
export function countWord(n: number | null | undefined): string | null {
  const c = count(n);
  return c === null ? null : c < WORDS.length ? WORDS[c] : String(c);
}

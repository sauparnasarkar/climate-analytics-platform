import type { CorrelationEmissionsTemperatureResponse } from '../api/correlationTypes';

/** The IPCC AR6 TCRE range as the API serves it (`fit_context.ar6_reference`), from the pipeline's reference registry (root SPEC.md §5.35 F): one copy of
 * the figures, with the edition it comes from. Never a constant here. */
export interface Ar6Reference {
  /** °C per 1,000 GtCO₂ */
  best: number;
  low: number;
  high: number;
  /** For example "IPCC AR6 WGI, 2021"; null from an older pipeline output */
  edition: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The range from a headline `/emissions-temperature` response, or null when the API sent none (or a malformed one): then nothing is compared with AR6. */
export function ar6FromResponse(resp: CorrelationEmissionsTemperatureResponse | null | undefined): Ar6Reference | null {
  const ref = (resp?.fit_context as Record<string, unknown> | undefined)?.ar6_reference as Record<string, unknown> | undefined;
  if (!ref || typeof ref !== 'object') return null;
  const best = num(ref.best_estimate);
  const range = Array.isArray(ref.likely_range) ? ref.likely_range.map(num) : [];
  const [low, high] = range.length === 2 ? range : [null, null];
  if (best === null || low === null || high === null || !(low <= best && best <= high)) return null;
  return { best, low, high, edition: typeof ref.edition === 'string' && ref.edition ? ref.edition : null };
}

/** "IPCC AR6 WGI, 2021" -> "IPCC AR6 (2021)" for a compact label; the plain "IPCC AR6" when the edition is unknown. */
export function ar6Label(ref: Ar6Reference): string {
  const year = ref.edition?.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? `IPCC AR6 (${year})` : 'IPCC AR6';
}

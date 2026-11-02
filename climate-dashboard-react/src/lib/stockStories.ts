import type { CorrelationCountryShareResponse, ShareRow } from '../api/correlationTypes';

// "The stock keeps growing" (Home, SPEC §5.25): four countries chosen BY RULE from the top ten by cumulative CO₂, each told as stock share against
// today's annual share. Everything is computed from /correlation/country-share rankings (cumulative_mt, share_pct, annual_mt, annual_share_pct) for the
// baseline and the latest year; a figure that cannot be computed is left off its card, never replaced by a zero.

export const STOCK_TOP_N = 10;
export const STOCK_CURVE_FROM = 1950;
/** The year halfway between the baseline and the latest year: derived, never typed. "Falling, but still adding" must be below its yearly emissions there too, so a collapse that has since rebounded does not count. */
export const midYear = (baselineYear: number, latestYear: number) => Math.round((baselineYear + latestYear) / 2);

export type Archetype = 'built' | 'catching' | 'large-today' | 'falling';

export const ARCHETYPE_TAG: Record<Archetype, string> = {
  built: 'Largest share so far',
  catching: 'Catching up fast',
  'large-today': 'Large today, small stock',
  falling: 'Falling, but still adding',
};

/** One candidate's numbers; any of the derived ones is null when its inputs are missing. */
export interface StockCandidate {
  country: string;
  name: string;
  /** Cumulative CO₂ at the latest and baseline years, Mt */
  cumulativeMt: number;
  baselineCumulativeMt: number | null;
  /** Share of the world's cumulative CO₂ and of the latest year's emissions, % */
  stockShare: number;
  annualShare: number | null;
  /** Stock growth since the baseline, % */
  stockGrowthPct: number | null;
  /** Change in yearly emissions since the baseline, % */
  annualChangePct: number | null;
  /** Share of the stock emitted after the baseline, % */
  emittedAfterPct: number | null;
  /** Yearly emissions now are positive (still adding) and below both the baseline year's and the middle year's; null when either is unknown */
  fellAndStayedDown: boolean | null;
}

export interface StockPick { archetype: Archetype; candidate: StockCandidate }

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The top ten by cumulative CO₂ in the latest year, each with its baseline figures looked up in the baseline year's ranking. */
export function stockCandidates(latest: CorrelationCountryShareResponse | null | undefined, baseline: CorrelationCountryShareResponse | null | undefined, mid?: CorrelationCountryShareResponse | null): StockCandidate[] {
  const rows = (latest?.rows ?? []).filter((r) => finite(r.cumulative_mt) && finite(r.share_pct)).sort((a, b) => b.cumulative_mt - a.cumulative_mt).slice(0, STOCK_TOP_N);
  const before = new Map<string, ShareRow>((baseline?.rows ?? []).map((r) => [r.country, r]));
  const middle = new Map<string, ShareRow>((mid?.rows ?? []).map((r) => [r.country, r]));
  return rows.map((r) => {
    const b = before.get(r.country);
    const bStock = b && finite(b.cumulative_mt) && b.cumulative_mt > 0 ? b.cumulative_mt : null;
    const bAnnual = b && finite(b.annual_mt) && b.annual_mt > 0 ? b.annual_mt : null;
    const m = middle.get(r.country);
    const mAnnual = m && finite(m.annual_mt) && m.annual_mt > 0 ? m.annual_mt : null;
    return {
      country: r.country, name: r.name, cumulativeMt: r.cumulative_mt, baselineCumulativeMt: bStock,
      stockShare: r.share_pct, annualShare: finite(r.annual_share_pct) ? r.annual_share_pct : null,
      stockGrowthPct: bStock !== null && r.cumulative_mt > 0 ? (r.cumulative_mt / bStock - 1) * 100 : null,
      annualChangePct: bAnnual !== null && finite(r.annual_mt) ? (r.annual_mt / bAnnual - 1) * 100 : null,
      emittedAfterPct: bStock !== null && r.cumulative_mt > 0 ? (1 - bStock / r.cumulative_mt) * 100 : null,
      fellAndStayedDown: bAnnual !== null && mAnnual !== null && finite(r.annual_mt) ? r.annual_mt > 0 && r.annual_mt < bAnnual && r.annual_mt < mAnnual : null,
    };
  });
}

/**
 * The four picks, in this order, each skipping a country already picked (so the next best takes its place):
 *   1. built the stock: the largest cumulative share;
 *   2. catching up fast: the largest stock growth since the baseline;
 *   3. large today, small stock: the largest annual share minus stock share;
 *   4. falling, but still adding: of those whose yearly emissions are below both the baseline year's and the middle year's, the largest stock share.
 * A rule nobody satisfies gives no card (so rule 4 may leave three).
 */
export function pickStockStories(candidates: StockCandidate[]): StockPick[] {
  const picked = new Set<string>();
  const out: StockPick[] = [];
  const take = (archetype: Archetype, score: (c: StockCandidate) => number | null, eligible: (c: StockCandidate) => boolean = () => true) => {
    let best: { c: StockCandidate; s: number } | null = null;
    for (const c of candidates) {
      if (picked.has(c.country) || !eligible(c)) continue;
      const s = score(c);
      if (s !== null && (best === null || s > best.s)) best = { c, s };
    }
    if (best) { picked.add(best.c.country); out.push({ archetype, candidate: best.c }); }
  };
  take('built', (c) => c.stockShare);
  take('catching', (c) => c.stockGrowthPct);
  take('large-today', (c) => (c.annualShare === null ? null : c.annualShare - c.stockShare));
  take('falling', (c) => c.stockShare, (c) => c.fellAndStayedDown === true);
  return out;
}

const pct0 = (v: number) => `${Math.round(v)}%`;
const signedPct0 = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}%`;
const pct1 = (v: number) => `${v.toFixed(1)}`;

export interface StockCardText {
  /** One line under the name */
  line: string | null;
  /** The key figure, what it is, and (stock-growth cards) how yearly emissions moved; null when the figure cannot be computed */
  key: { value: string; label: string; yearly: string | null } | null;
}

export function stockCardText({ archetype, candidate: c }: StockPick, ctx: { baselineYear: number; latestYear: number; cumulativeFrom: number | null }): StockCardText {
  const { baselineYear: b, latestYear: l } = ctx;
  const growth = c.stockGrowthPct === null ? null : { value: signedPct0(c.stockGrowthPct), label: `growth of its stock since ${b}`, yearly: c.annualChangePct === null ? null : `yearly emissions ${signedPct0(c.annualChangePct)}` };
  const after = c.emittedAfterPct === null ? null : { value: pct0(c.emittedAfterPct), label: `of its stock was emitted after ${b}`, yearly: null };
  switch (archetype) {
    case 'built':
      return { line: ctx.cumulativeFrom != null ? `Largest share of everything emitted since ${ctx.cumulativeFrom}` : 'Largest share of everything emitted', key: growth };
    case 'falling':
      return { line: c.annualChangePct === null ? null : `Yearly emissions down ${pct0(Math.abs(c.annualChangePct))} since ${b}`, key: growth };
    case 'catching':
      return { line: c.stockGrowthPct === null ? null : `Its stock is ${(1 + c.stockGrowthPct / 100).toFixed(1)}× what it was in ${b}`, key: after };
    case 'large-today':
      return { line: c.annualShare === null ? null : `${pct1(c.annualShare)}% of ${l}’s emissions, ${pct1(c.stockShare)}% of the stock`, key: after };
  }
}

export interface CurvePoint { year: number; gt: number }

/** One country's cumulative CO₂ curve (Gt) from STOCK_CURVE_FROM, from its series in the share response; empty when the response has none. */
export function cumulativeCurve(resp: CorrelationCountryShareResponse | null | undefined, country: string): CurvePoint[] {
  const s = resp?.series?.find((x) => x.country === country);
  return (s?.points ?? []).filter((p) => p.year >= STOCK_CURVE_FROM && finite(p.cumulative_mt)).map((p) => ({ year: p.year, gt: p.cumulative_mt / 1000 }));
}

import { describe, expect, it } from 'vitest';
import type { CorrelationCountryShareResponse } from '../api/correlationTypes';
import { FALLING_MIN_DROP_PCT, cumulativeCurve, pickStockStories, stockCandidates, stockCardText } from './stockStories';

type R = [country: string, cum: number, share: number, annual: number | null, annualShare: number | null];
const ranking = (rows: R[]) => ({ cumulative_from: 1750, rows: rows.map(([country, cumulative_mt, share_pct, annual_mt, annual_share_pct], i) => ({ rank: i + 1, country, name: country, cumulative_mt, share_pct, annual_mt, annual_share_pct })), series: [] }) as unknown as CorrelationCountryShareResponse;

// latest (2024): [country, cumulative Mt, stock share %, annual Mt, annual share %]
const LATEST = ranking([
  ['USA', 435000, 23.5, 4900, 12.7], ['CHN', 285000, 15.4, 12300, 31.8], ['RUS', 120000, 6.4, 1700, 4.4], ['IND', 66000, 3.6, 3200, 8.3], ['GBR', 80000, 4.3, 300, 0.8],
  ['DEU', 95000, 5.1, 600, 1.6], ['JPN', 70000, 3.8, 1000, 2.6],
]);
const BASELINE = ranking([
  ['USA', 248000, 28, 5100, 22], ['CHN', 43000, 6, 2400, 10], ['RUS', 100000, 12, 2300, 10], ['IND', 11000, 1, 600, 3], ['GBR', 63000, 7, 580, 2],
  ['DEU', 80000, 9, 1000, 4], ['JPN', 40000, 5, 1100, 5],
]);

describe('pickStockStories', () => {
  it('chooses by the four rules, in order, from the top ten', () => {
    const picks = pickStockStories(stockCandidates(LATEST, BASELINE));
    expect(picks.map((p) => [p.archetype, p.candidate.country])).toEqual([['built', 'USA'], ['catching', 'CHN'], ['large-today', 'IND'], ['falling', 'DEU']]);
  });

  it('takes the largest stock among those that fell by at least the threshold, not the biggest collapse', () => {
    // GBR fell 48% and DEU 40% (4900 -> ... ); a Ukraine-like -80% on a small stock must not win, and the larger stock (DEU) does.
    const latest = ranking([['USA', 435000, 23.5, 4900, 12.7], ['CHN', 285000, 15.4, 12300, 31.8], ['IND', 66000, 3.6, 3200, 8.3], ['DEU', 95000, 5.1, 600, 1.6], ['GBR', 80000, 4.3, 300, 0.8], ['UKR', 31000, 1.7, 140, 0.4]]);
    const base = ranking([['USA', 248000, 28, 5100, 22], ['CHN', 43000, 6, 2400, 10], ['IND', 11000, 1, 600, 3], ['DEU', 80000, 9, 1000, 4], ['GBR', 63000, 7, 580, 2], ['UKR', 20000, 3, 700, 3]]);
    const falling = pickStockStories(stockCandidates(latest, base)).find((p) => p.archetype === 'falling')!;
    expect(falling.candidate.country).toBe('DEU');
    expect(FALLING_MIN_DROP_PCT).toBe(40);
  });

  it('leaves out the fourth card when nobody fell by the threshold (a 39% fall does not qualify)', () => {
    const latest = ranking([['USA', 435000, 23.5, 4900, 12.7], ['CHN', 285000, 15.4, 12300, 31.8], ['IND', 66000, 3.6, 3200, 8.3], ['DEU', 95000, 5.1, 610, 1.6]]);
    const base = ranking([['USA', 248000, 28, 5100, 22], ['CHN', 43000, 6, 2400, 10], ['IND', 11000, 1, 600, 3], ['DEU', 80000, 9, 1000, 4]]);
    expect(pickStockStories(stockCandidates(latest, base)).map((p) => p.archetype)).toEqual(['built', 'catching', 'large-today']);
  });

  it('skips a country already picked, so the next best takes the place', () => {
    // USA is the largest stock, the biggest grower and has the biggest annual-minus-stock gap: each later rule skips it and takes the next best.
    const latest = ranking([['USA', 900000, 40, 9000, 50], ['CHN', 285000, 15.4, 12300, 20], ['IND', 66000, 3.6, 3200, 8.3]]);
    const base = ranking([['USA', 100000, 10, 3000, 10], ['CHN', 43000, 6, 2400, 10], ['IND', 11000, 1, 600, 3]]);
    const picks = pickStockStories(stockCandidates(latest, base));
    expect(picks.map((p) => [p.archetype, p.candidate.country])).toEqual([['built', 'USA'], ['catching', 'CHN'], ['large-today', 'IND']]);
  });

  it('considers only the ten largest stocks', () => {
    const many = ranking(Array.from({ length: 12 }, (_, i): R => [`C${i}`, 1000 - i, 5, 10, 5]));
    expect(stockCandidates(many, null)).toHaveLength(10);
  });

  it('copes with no baseline ranking: the share rules still pick, the growth rules pick nobody', () => {
    const picks = pickStockStories(stockCandidates(LATEST, null));
    expect(picks.map((p) => [p.archetype, p.candidate.country])).toEqual([['built', 'USA'], ['large-today', 'CHN']]);
  });
});

describe('stockCardText', () => {
  const ctx = { baselineYear: 1990, latestYear: 2024, cumulativeFrom: 1750 };
  const picks = pickStockStories(stockCandidates(LATEST, BASELINE));
  const text = (a: string) => stockCardText(picks.find((p) => p.archetype === a)!, ctx);

  it('computes the key figures from the two rankings', () => {
    expect(text('built').key).toEqual({ value: '+75%', label: 'growth of its stock since 1990', yearly: 'yearly emissions −4%' }); // 435000/248000 = 1.754; 4900/5100
    expect(text('falling').key).toEqual({ value: '+19%', label: 'growth of its stock since 1990', yearly: 'yearly emissions −40%' }); // DEU: 95000/80000; 600/1000
    expect(text('catching').key).toEqual({ value: '85%', label: 'of its stock was emitted after 1990', yearly: null }); // 1 − 43000/285000
    expect(text('large-today').key?.value).toBe('83%'); // 1 − 11000/66000
  });

  it('writes the one-line descriptions from the same numbers', () => {
    expect(text('built').line).toBe('Largest share of everything emitted since 1750');
    expect(text('catching').line).toBe('Its stock is 6.6× what it was in 1990');
    expect(text('large-today').line).toBe('8.3% of 2024’s emissions, 3.6% of the stock');
    expect(text('falling').line).toBe('Yearly emissions down 40% since 1990');
  });

  it('leaves off a figure that cannot be computed, keeping the card', () => {
    const noBase = pickStockStories(stockCandidates(LATEST, null))[0];
    expect(stockCardText(noBase, ctx).key).toBeNull();
    expect(stockCardText(noBase, ctx).line).toBe('Largest share of everything emitted since 1750');
    expect(stockCardText(noBase, { ...ctx, cumulativeFrom: null }).line).toBe('Largest share of everything emitted');
  });
});

describe('cumulativeCurve', () => {
  it('reads one country\'s series from 1950, in Gt', () => {
    const resp = { series: [{ country: 'USA', points: [{ year: 1940, cumulative_mt: 1000 }, { year: 1950, cumulative_mt: 2000 }, { year: 2024, cumulative_mt: 435000 }] }] } as unknown as CorrelationCountryShareResponse;
    expect(cumulativeCurve(resp, 'USA')).toEqual([{ year: 1950, gt: 2 }, { year: 2024, gt: 435 }]);
    expect(cumulativeCurve(resp, 'CHN')).toEqual([]);
    expect(cumulativeCurve(null, 'USA')).toEqual([]);
  });
});

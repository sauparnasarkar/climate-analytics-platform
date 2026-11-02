import { useMemo } from 'react';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { fmtGt } from '../../lib/cumulative';
import { ARCHETYPE_TAG, STOCK_CURVE_FROM, cumulativeCurve, pickStockStories, stockCandidates, stockCardText, type CurvePoint, type StockPick } from '../../lib/stockStories';

// "The stock keeps growing" (Home, SPEC §5.25): stock share against today's annual share for four countries chosen by rule. Every number, year, country
// and rank comes from /correlation/country-share; a figure that is missing is left off its card, and a card whose country cannot be chosen is not drawn.

export const STOCK_STORIES_STYLES = `
.stock-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; list-style: none; margin: 0; padding: 0; }
.stock-card { background: var(--syn-color-surface-base); border: 1px solid var(--syn-color-border-subtle); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.stock-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; }
.stock-key { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.stock-key--stock, .stock-bar--stock { background: #0A6E8C; } .stock-key--annual, .stock-bar--annual { background: #B07A10; }
[data-syn-theme="night"] .stock-key--stock, [data-syn-theme="night"] .stock-bar--stock { background: #5ecbf5; } [data-syn-theme="night"] .stock-key--annual, [data-syn-theme="night"] .stock-bar--annual { background: #e5b955; }
.stock-curve { stroke: #0A6E8C; fill: none; } .stock-curve-area { fill: #0A6E8C; opacity: .14; }
[data-syn-theme="night"] .stock-curve { stroke: #5ecbf5; } [data-syn-theme="night"] .stock-curve-area { fill: #5ecbf5; }
.stock-bar-row { display: grid; grid-template-columns: minmax(0, 1fr) 52px; gap: 8px; align-items: center; }
.stock-bar-track { height: 14px; border-radius: 3px; background: var(--syn-color-border-subtle); overflow: hidden; }
.stock-bar { display: block; height: 14px; }
.stock-curve-fig { margin: 0; display: flex; flex-direction: column; gap: 4px; }
@media (max-width: 1100px) { .stock-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .stock-cards { grid-template-columns: 1fr; gap: 12px; } .stock-card { padding: 14px 16px; gap: 10px; } .stock-curve-fig { display: none; } }
`;

const WIDTH = 260;
const HEIGHT = 84;

function Curve({ points, latestYear, baselineYear, label }: { points: CurvePoint[]; latestYear: number; baselineYear: number; label: string }) {
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.gt));
  const span = latestYear - STOCK_CURVE_FROM || 1;
  const xy = points.map((p) => `${(((p.year - STOCK_CURVE_FROM) / span) * WIDTH).toFixed(1)} ${(80 - (p.gt / max) * 72).toFixed(1)}`);
  const path = `M${xy.join(' L')}`;
  const end = points[points.length - 1];
  const xBase = ((baselineYear - STOCK_CURVE_FROM) / span) * WIDTH;
  return (
    <figure className="stock-curve-fig">
      <svg role="img" aria-label={label} width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        <path d={`M0 80H${WIDTH}`} stroke="var(--syn-color-border-subtle)" vectorEffect="non-scaling-stroke" />
        <path className="stock-curve-area" d={`${path} L${WIDTH} 80 L0 80 Z`} />
        <path className="stock-curve" d={path} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {baselineYear > STOCK_CURVE_FROM && baselineYear < latestYear && <line x1={xBase} y1="6" x2={xBase} y2="80" stroke="var(--syn-color-text-muted)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      <figcaption className="syn-caption" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--syn-color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        <span>{STOCK_CURVE_FROM}</span><span>{baselineYear}</span><span>{end.year} · {fmtGt(end.gt)} Gt</span>
      </figcaption>
    </figure>
  );
}

function Card({ pick, scaleMax, curve, baselineYear, latestYear, cumulativeFrom }: { pick: StockPick; scaleMax: number; curve: CurvePoint[]; baselineYear: number; latestYear: number; cumulativeFrom: number | null }) {
  const c = pick.candidate;
  const text = stockCardText(pick, { baselineYear, latestYear, cumulativeFrom });
  const bars: Array<{ kind: 'stock' | 'annual'; value: number | null }> = [{ kind: 'stock', value: c.stockShare }, { kind: 'annual', value: c.annualShare }];
  const summary = `${c.name}: ${c.stockShare.toFixed(1)}% of all CO₂ since ${cumulativeFrom ?? 'the start of the record'}${c.annualShare !== null ? `; ${c.annualShare.toFixed(1)}% of ${latestYear} emissions` : ''}`;
  return (
    <li>
      <article className="stock-card" aria-label={c.name} style={{ height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="syn-caption" style={{ fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--syn-color-accent-text, inherit)' }}>{ARCHETYPE_TAG[pick.archetype]}</span>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{c.name}</h3>
          {text.line && <span className="syn-text-md" style={{ color: 'var(--syn-color-text-secondary)' }}>{text.line}</span>}
        </div>
        <div role="img" aria-label={summary} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bars.map(({ kind, value }) => value === null ? null : (
            <div key={kind} className="stock-bar-row" aria-hidden="true">
              <span className="stock-bar-track"><span className={`stock-bar stock-bar--${kind}`} style={{ width: `${Math.max(0, Math.min(100, (value / scaleMax) * 100))}%` }} /></span>
              <span className="syn-text-md" style={{ fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
        <Curve points={curve} latestYear={latestYear} baselineYear={baselineYear} label={`${c.name} cumulative CO₂, ${STOCK_CURVE_FROM} to ${curve[curve.length - 1]?.year ?? latestYear}: ${fmtGt(curve[curve.length - 1]?.gt ?? c.cumulativeMt / 1000)} Gt at the end`} />
        {text.key && (
          <div style={{ borderTop: '1px solid var(--syn-color-border-subtle)', paddingTop: 12, display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 30, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{text.key.value}</span>
            <span className="syn-caption" style={{ color: 'var(--syn-color-text-secondary)' }}>{text.key.label}{text.key.yearly ? <><br />{text.key.yearly}</> : null}</span>
          </div>
        )}
      </article>
    </li>
  );
}

export function StockStories({ latestYear, baselineYear }: { latestYear: number; baselineYear: number }) {
  const latest = useAsync(() => api.correlationCountryShare({ year: latestYear, allCountries: true }), [latestYear]);
  const baseline = useAsync(() => api.correlationCountryShare({ year: baselineYear, allCountries: true }), [baselineYear]);
  const picks = useMemo(() => (latest.data && !baseline.loading ? pickStockStories(stockCandidates(latest.data, baseline.data)) : []), [latest.data, baseline.data, baseline.loading]);
  const ids = picks.map((p) => p.candidate.country);
  const curves = useAsync(async () => (ids.length > 0 ? api.correlationCountryShare({ countries: ids, startYear: STOCK_CURVE_FROM }) : null), [ids.join(',')]);
  if (picks.length === 0) return null;
  const cumulativeFrom = latest.data?.cumulative_from ?? null;
  const scaleMax = Math.max(...picks.flatMap((p) => [p.candidate.stockShare, p.candidate.annualShare ?? 0]), 1e-9);
  return (
    <section aria-labelledby="stock-heading" style={{ padding: 'var(--landing-pad-y) var(--landing-pad-x)', background: 'var(--syn-color-surface-raised)', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <style>{STOCK_STORIES_STYLES}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px 32px' }}>
        <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 id="stock-heading" className="landing-h2" style={{ margin: 0 }}>The stock keeps growing</h2>
          <p className="syn-text-lg" style={{ margin: 0, color: 'var(--syn-color-text-muted)' }}>
            Warming follows all the CO₂ emitted so far. Cutting emissions slows how fast that total grows; only net zero stops it growing. {picks.length === 4 ? 'Four' : String(picks.length)} {picks.length === 1 ? 'country' : 'countries'}, {picks.length === 1 ? 'one path' : `${picks.length === 4 ? 'four' : picks.length} paths`} since {baselineYear}.
          </p>
        </div>
        <div className="stock-legend syn-caption">
          <span><span className="stock-key stock-key--stock" />{cumulativeFrom != null ? `Share of all CO₂ since ${cumulativeFrom}` : 'Share of all CO₂ emitted'}</span>
          <span><span className="stock-key stock-key--annual" />Share of {latestYear} emissions</span>
        </div>
      </div>
      <ul className="stock-cards">
        {picks.map((p) => (
          <Card key={p.candidate.country} pick={p} scaleMax={scaleMax} curve={cumulativeCurve(curves.data, p.candidate.country)} baselineYear={baselineYear} latestYear={latestYear} cumulativeFrom={cumulativeFrom} />
        ))}
      </ul>
      <div className="syn-caption" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '8px 24px', color: 'var(--syn-color-text-muted)' }}>
        <span>Fossil-fuel and industry CO₂{cumulativeFrom != null ? `, cumulative since ${cumulativeFrom}` : ', cumulative'} (OWID / Global Carbon Project). Shares of the world total, {latestYear}.</span>
        <a href="#race-heading" style={{ fontWeight: 600, color: 'var(--syn-color-accent-text, inherit)', textDecoration: 'none' }}>How the ranking changed since {baselineYear} ↓</a>
      </div>
    </section>
  );
}

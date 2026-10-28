import { Link } from 'react-router-dom';
import { FORECAST_END_YEAR, SECTION_GAP } from '../../constants';
import { SCENARIO_LABEL } from '../../lib/climateCopy';
import { fmtInt } from '../../lib/landingData';
import { PATHWAYS_ANCHOR, type Pathways } from '../../lib/pathways';

const panel = { background: 'var(--syn-color-surface-raised)', border: '1px solid var(--syn-color-border-subtle)', borderRadius: 8 } as const;

/**
 * "Where today's patterns lead": the Overview's closing block (requirements §2.2 block 5). The three scenario
 * pathways' emissions and *implied* temperature in the horizon year, labelled illustrative throughout, with links on to the full views. It does not
 * follow the page year -- the pathways run 2025 onward.
 */
export function PathwaysSection({ pathways }: { pathways: Pathways }) {
  const { year, cards, summary, startYear, lastObservedYear, restOfWorldYear, startOffsetPct } = pathways;
  // The pathways are fitted to history and begin one step on from it, so their first year is near -- not equal to -- the last observed total.
  const start =
    startOffsetPct === null
      ? `Pathways start in ${startYear}`
      : `Pathways start in ${startYear}, ${Math.abs(startOffsetPct).toFixed(1)}% ${startOffsetPct >= 0 ? 'above' : 'below'} the ${lastObservedYear} observed total of the covered countries`;
  return (
    <section id={PATHWAYS_ANCHOR} aria-labelledby="pathways-heading" style={{ marginTop: SECTION_GAP, marginBottom: SECTION_GAP }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px', marginBottom: 8 }}>
        <h2 id="pathways-heading" className="syn-title-sm" style={{ margin: 0 }}>Where today&apos;s patterns lead</h2>
        <span className="syn-text-lg" style={{ padding: '2px 8px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '.04em', background: 'var(--syn-color-signal-caution-tint, rgba(176,122,16,0.16))', color: 'var(--area2-warning, #6E4800)' }}>
          {SCENARIO_LABEL}
        </span>
      </div>
      {summary && <p className="syn-text-lg" style={{ margin: '0 0 12px' }}>{summary}</p>}
      <div className="pathways-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {cards.map((c) => (
          <div key={c.name} style={{ ...panel, borderTop: `3px solid ${c.color}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="syn-caption">{c.label}</div>
            <div className="syn-caption" style={{ color: 'var(--syn-color-text-muted)' }}>{c.method}</div>
            <div className="syn-title-md" style={{ fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{c.levelC.toFixed(2)} °C</div>
            <div className="syn-caption" style={{ color: 'var(--syn-color-text-muted)' }}>implied, {year}</div>
            <div className="syn-text-lg" style={{ fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{fmtInt(c.emissionsMt)} Mt a year</div>
          </div>
        ))}
      </div>
      <p className="syn-caption" style={{ margin: '10px 0 0', color: 'var(--syn-color-text-muted)' }}>
        Implied temperature = the observed 5-year-mean anchor plus the long-run slope × the emissions still to come; it is a translation of the pathways, not a climate model or a projection. {start}, and hold the rest of the world at its {restOfWorldYear} share.
      </p>
      <p className="syn-text-lg" style={{ margin: '8px 0 0', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        <Link className="area2-link" to="/forecasts">Forecasts to {FORECAST_END_YEAR} →</Link>
        <Link className="area2-link" to="/scenarios">Scenario Comparison →</Link>
        <Link className="area2-link" to="/climate-correlation">Implied temperature in Climate Correlation →</Link>
      </p>
    </section>
  );
}

import { Link } from 'react-router-dom';
import { FORECAST_END_YEAR, SECTION_GAP } from '../../constants';
import { PATHWAYS_ANCHOR, type Pathways } from '../../lib/pathways';

/**
 * "Where today's patterns lead": the Overview's closing line (requirements §2.2 block 5). The three scenario pathways own their emissions and *implied*
 * temperature on Scenario Comparison; here it is one illustrative range for the horizon year and the links on to the full views. It does not follow
 * the page year -- the pathways run 2025 onward.
 */
export function PathwaysSection({ pathways }: { pathways: Pathways }) {
  const { year, cards } = pathways;
  const levels = cards.map((c) => c.levelC);
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  return (
    <section id={PATHWAYS_ANCHOR} aria-labelledby="pathways-heading" style={{ marginTop: SECTION_GAP, marginBottom: SECTION_GAP }}>
      <h2 id="pathways-heading" className="syn-title-sm" style={{ margin: '0 0 8px' }}>Where today&apos;s patterns lead</h2>
      <p className="syn-text-lg" style={{ margin: 0 }}>
        By {year} the three pathways imply <strong>{low.toFixed(2)}–{high.toFixed(2)} °C</strong>{' '}
        <span className="syn-caption" style={{ padding: '2px 8px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '.04em', background: 'var(--syn-color-signal-caution-tint, rgba(176,122,16,0.16))', color: 'var(--area2-warning, #6E4800)' }}>
          Illustrative
        </span>{' '}
        — <Link className="area2-link" to="/scenarios" style={{ fontWeight: 600 }}>compare them on Scenario Comparison →</Link>
        {' · '}
        <Link className="area2-link" to="/forecasts" style={{ fontWeight: 600 }}>Forecasts to {FORECAST_END_YEAR} →</Link>
      </p>
    </section>
  );
}

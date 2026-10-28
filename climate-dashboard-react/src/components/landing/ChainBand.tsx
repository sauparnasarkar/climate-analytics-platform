import { Link } from 'react-router-dom';
import { fmtAnomaly, type ClimateSignal } from '../../lib/climateSignal';
import { fmtInt } from '../../lib/landingData';

// The four-step row (Area 2, requirements §2.1): emissions → concentration → radiative forcing → temperature anomaly, between the
// hero and the rest of the page. One compact row of the four values with a link to Climate Correlation, which owns the full chain
// (sparklines, captions, splice and vintage notes). It shows GLOBAL, ACCUMULATED totals and says so: it never implies that one country's
// emissions in one year set that year's temperature. Forcing is described, not measured: no number, no chart (the platform holds no
// forcing dataset). Every figure comes from the API.

export const CHAIN_BAND_STYLES = `
.chain-band__steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); list-style: none; margin: 0; padding: 0; border: 1px solid var(--syn-color-border-subtle); border-radius: 8px; overflow: hidden; background: var(--syn-color-surface-base); }
.chain-band__step { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; min-width: 0; }
.chain-band__step + .chain-band__step { border-left: 1px solid var(--syn-color-border-subtle); }
.chain-band__label { font-family: var(--syn-family-ui); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.chain-band__label--emissions { color: #8A5A00; } .chain-band__label--concentration { color: #0A6E8C; } .chain-band__label--forcing { color: var(--syn-color-text-muted); } .chain-band__label--temperature { color: #B3261E; }
[data-syn-theme="night"] .chain-band__label--emissions { color: #e5b955; } [data-syn-theme="night"] .chain-band__label--concentration { color: #5ecbf5; } [data-syn-theme="night"] .chain-band__label--temperature { color: #f2637e; }
@media (max-width: 1100px) {
  .chain-band__steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .chain-band__step:nth-child(odd) { border-left: 0; }
  .chain-band__step:nth-child(n + 3) { border-top: 1px solid var(--syn-color-border-subtle); }
}
@media (max-width: 560px) {
  .chain-band__steps { grid-template-columns: 1fr; }
  .chain-band__step + .chain-band__step { border-left: 0; border-top: 1px solid var(--syn-color-border-subtle); }
}
`;

export interface ChainBandEmissions {
  /** Latest year and the world total for it, MtCO₂ */
  year: number;
  total: number;
}

function StepValue({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 'clamp(1.4rem, 2.2vw, 1.75rem)', fontWeight: 600, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{children}</div>;
}

const caption = { margin: 0, color: 'var(--syn-color-text-muted)' } as const;

export function ChainBand({ signal, emissions }: { signal: ClimateSignal; emissions: ChainBandEmissions }) {
  const { concentration, temperature, ppm1850 } = signal;
  const upPct = ppm1850 ? Math.round((concentration.value / ppm1850 - 1) * 100) : null;
  // No bottom padding: the next section brings its own, so the two never stack into a double gap.
  return (
    <section aria-labelledby="chain-heading" style={{ padding: 'var(--landing-pad-y) var(--landing-pad-x) 0', background: 'var(--syn-color-surface-raised)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{CHAIN_BAND_STYLES}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px 24px' }}>
        <h2 id="chain-heading" className="landing-h2" style={{ margin: 0 }}>The chain reaction</h2>
        <Link to="/climate-correlation" style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>How this works → Climate Correlation</Link>
      </div>
      <ol className="chain-band__steps">
        <li className="chain-band__step">
          <div className="chain-band__label chain-band__label--emissions">01 · Emissions</div>
          <StepValue>{fmtInt(emissions.total)} <span className="syn-text-lg">MtCO₂</span></StepValue>
          <p className="syn-caption" style={caption}>{emissions.year}, worldwide</p>
        </li>
        <li className="chain-band__step">
          <div className="chain-band__label chain-band__label--concentration">02 · Concentration</div>
          <StepValue>{concentration.value.toFixed(1)} <span className="syn-text-lg">ppm</span></StepValue>
          <p className="syn-caption" style={caption}>{concentration.year}{upPct != null ? `, up ${upPct}% on 1850` : ''}</p>
        </li>
        <li className="chain-band__step">
          <div className="chain-band__label chain-band__label--forcing">03 · Radiative forcing</div>
          <StepValue>Traps more heat</StepValue>
          <p className="syn-caption" style={caption}>Described, not calculated</p>
        </li>
        <li className="chain-band__step">
          <div className="chain-band__label chain-band__label--temperature">04 · Temperature anomaly</div>
          <StepValue>{fmtAnomaly(temperature.value)}</StepValue>
          <p className="syn-caption" style={caption}>{temperature.year}, above 1850–1900</p>
        </li>
      </ol>
      <p className="syn-caption" style={caption}>Global totals built up over time. One country’s emissions in one year do not set that year’s temperature.</p>
    </section>
  );
}

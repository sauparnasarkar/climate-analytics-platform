import { Link } from 'react-router-dom';
import { FORECAST_END_YEAR } from '../../constants';
import { fmtAnomaly, pairedConcentration, pairedTemperature, type ClimateSignal } from '../../lib/climateSignal';
import { CLIMATE_SIGNAL_ANCHOR, NOT_A_CLIMATE_MODEL } from '../../lib/climateCopy';
import { CHART_PANEL_STYLES } from '../climate/chartPanel';
import { BaselineChip } from '../climate/BaselineChip';
import { SourceNote } from '../climate/SourceNote';
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { ctaClass } from './cta';
import { ClimateScatter, ScatterLegend } from './ClimateScatter';
import { KpiStrip } from './KpiStrip';

// Banner 1 of the landing carousel (Area 2, requirements §2.1): the climate signal, read from the correlation
// API. It states a long-run, global, cumulative relationship -- never that one country's or one year's
// emissions set that year's temperature.

export const CLIMATE_BANNER_STYLES = CHART_PANEL_STYLES + `
/* The theme's divider tokens are tuned for white cards: on the tinted landing background (Tidewater #dce8ed) even divider-strong is 1.24:1, so the KPI row's
   rules and the phone cards' borders vanished in the light theme. Derive the line from the themed text colour instead, so it holds contrast in both themes. */
/* The sources disclosure: a line in the panel; its text opens over the chart's foot instead of making the panel taller. */
.climate-banner__sources { position: relative; }
.climate-banner__sources > summary { cursor: pointer; color: var(--syn-data-text); text-decoration: underline; width: fit-content; }
.climate-banner__sources-body { position: absolute; inset-inline: 0; bottom: 100%; z-index: 2; margin-bottom: 4px; padding: 4px 12px 8px; border: 1px solid rgba(148, 180, 192, 0.35); border-radius: 8px; background: var(--climate-panel-bg); }
/* Text on the page background (not on the dark chart panel): the design's per-theme series colours. */
.climate-metric--temperature { color: #f2637e; }
.climate-metric--concentration { color: #5ecbf5; }
[data-syn-theme="tidewater"] .climate-metric--temperature { color: #B3261E; }
[data-syn-theme="tidewater"] .climate-metric--concentration { color: #0A6E8C; }
/* Phones: temperature and CO₂ as two side-by-side cards (the slope, the third, is dropped here), full-width stacked buttons, tighter spacing. */
@media (max-width: 640px) {
  .climate-banner { gap: 14px; padding-top: 12px; padding-bottom: 8px; }
  /* As in the design frame: copy, the two figures, the chart, then the buttons (the buttons are placed after the chart in the markup on a phone, so reading and focus order match). */
  .climate-banner__text > p { font-size: 0.9375rem !important; line-height: 1.45; }
  .climate-banner__chart { padding: 12px 14px; gap: 8px; }
  .climate-banner__chart figcaption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .climate-banner__metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; border: 0; }
  .climate-banner__metrics > div, .climate-banner__metrics > div + div { padding: 10px 12px; border: 1px solid var(--climate-banner-line); border-radius: 8px; } /* no fill: the figures keep the contrast they were audited against on the page background */
  .climate-banner__metrics > div:nth-child(3) { display: none; }
  .climate-banner__more { display: none; }
  .climate-banner__ctas > :nth-child(n+2) { display: none; } /* as in the design frame: one button; the other two links are in the menu */
  .climate-banner__ctas { flex-direction: column; align-items: stretch !important; gap: 8px !important; }
  .climate-banner__ctas > a:not([class*="button"]) { text-align: center; padding: 6px 0; }
  .climate-banner__ctas > a[class*="button"] { justify-content: center; }
}
`;

export function ClimateSignalBanner({ signal, headingId }: { signal: ClimateSignal; headingId: string }) {
  const { fit } = signal;
  const ppm = pairedConcentration(signal);
  const paired = pairedTemperature(signal); // the chart's last point, so these KPIs and the chart label agree
  // On a phone the figures and then the buttons come after the chart in the markup too (not just visually), so reading and focus order match what is seen.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const ctas = (
    <div className="climate-banner__ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <Link to={`/overview#${CLIMATE_SIGNAL_ANCHOR}`} className={ctaClass('primary')} style={{ textDecoration: 'none' }}>See the climate signal</Link>
      <Link to="/climate-correlation" className={ctaClass('secondary')} style={{ textDecoration: 'none' }}>Explore climate correlation</Link>
      <Link to="/forecasts" className="climate-banner__forecasts" style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>Forecasts to {FORECAST_END_YEAR} →</Link>
    </div>
  );
  const metrics = (
    <KpiStrip
      className="climate-banner__metrics"
      items={[
        { value: fmtAnomaly(paired.value), label: `${paired.year}, vs 1850–1900`, valueClassName: 'climate-metric--temperature' },
        { value: `${ppm.value.toFixed(1)} ppm`, label: `Atmospheric CO₂, ${ppm.year}`, valueClassName: 'climate-metric--concentration' },
        { value: `${fit.slope.toFixed(2)} °C`, label: 'per 1,000 GtCO₂ emitted' },
      ]}
    />
  );
  return (
    <div className="landing-slide climate-banner">
      <div className="climate-banner__text" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 2.2vh, 24px)', minWidth: 0 }}>
        <div className="syn-caption" style={{ letterSpacing: '0.08em', lineHeight: 1.5, textTransform: 'uppercase', color: 'var(--syn-color-accent-text, inherit)' }}>
          Climate signal · Global · {fit.start}–{fit.end}
        </div>
        <h1 id={headingId} style={{ margin: 0, fontSize: 'clamp(1.75rem, min(4.6vw, 5.8vh), 3.75rem)', lineHeight: 1.05, fontWeight: 700 }}>
          Warming tracks the CO₂ we’ve accumulated
        </h1>
        <p className="syn-text-lg" style={{ margin: 0, fontSize: 'clamp(1rem, 1.4vw, 1.125rem)', color: 'var(--syn-color-text-muted)' }}>
          Emissions set off a chain reaction: CO₂ builds up in the atmosphere, traps more heat, and the planet warms.<span className="climate-banner__more"> Over {fit.nYears} years, warming has followed the cumulative total, not any single year’s emissions.</span>
        </p>
        {!isPhone && metrics}
        {!isPhone && ctas}
      </div>
      <figure className="climate-chart-panel climate-banner__chart" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <figcaption style={{ fontWeight: 600 }}>Temperature anomaly vs cumulative CO₂</figcaption>
          <ScatterLegend />
        </div>
        <ClimateScatter signal={signal} fit />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <BaselineChip inChartPanel baseline="1850–1900" source="Berkeley Earth" />
          <span className="syn-caption">Global series. Long-term co-movement. {NOT_A_CLIMATE_MODEL}</span>
        </div>
        {/* The long source note and the file-vintage caveat sit behind a disclosure that opens over the chart, so the panel keeps its height. */}
        <details className="climate-banner__sources">
          <summary className="syn-caption">Sources and caveat</summary>
          <div className="climate-banner__sources-body">
            <SourceNote inChartPanel sources={['Berkeley Earth', 'OWID + Global Carbon Project', 'NOAA GML + Law Dome']}>{signal.vintageCaveat ?? undefined}</SourceNote>
          </div>
        </details>
      </figure>
      {isPhone && metrics}
      {isPhone && ctas}
    </div>
  );
}

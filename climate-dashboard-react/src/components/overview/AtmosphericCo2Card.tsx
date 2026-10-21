import { fmtPct } from '../../lib/landingData';
import type { YearValue } from '../../lib/climateSignal';
import { SERIES_STYLES } from '../climate/seriesStyles';
import { Sparkline } from '../landing/Sparkline';

export interface ConcentrationContext {
  /** Annual mean CO₂, ppm */
  series: YearValue[];
  /** First year of NOAA's direct measurements (the ice core before it) */
  spliceYear: number | null;
  /** Pre-industrial reference, ppm */
  ppm1850: number | null;
}

/** The map's side card (Area 2, requirements §2.2/§2.6): atmospheric CO₂ for the SAME year the map shows. A stock, not a flow, so it is one
 * global figure that does not change with the Absolute/Cumulative mode and is never split by country (says so). Everything from the API. */
export function AtmosphericCo2Card({ year, concentration }: { year: number; concentration: ConcentrationContext }) {
  const { series, spliceYear, ppm1850 } = concentration;
  const now = series.find((p) => p.year === year);
  const since = series.filter((p) => p.year >= 1850);
  const delta = now && ppm1850 ? now.value - ppm1850 : null;
  return (
    <div className="series--concentration" style={{ background: 'var(--syn-color-surface-base)', border: '1px solid var(--syn-color-border-subtle)', borderRadius: 8, padding: '10px 12px' }}>
      <style>{SERIES_STYLES}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="syn-caption">{`Atmospheric CO₂ · ${year}`}</span>
        <span style={{ fontFamily: 'var(--syn-family-ui)', fontSize: 10, letterSpacing: '.08em', color: 'var(--syn-color-text-muted)' }}>GLOBAL</span>
      </div>
      <div className="syn-title-md" style={{ fontVariantNumeric: 'tabular-nums' }}>{now ? `${now.value.toFixed(1)} ppm` : '—'}</div>
      {delta != null && ppm1850 != null && (
        <div className="syn-caption" style={{ color: 'var(--syn-color-text-muted)' }}>
          {`${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)} ppm (${fmtPct((delta / ppm1850) * 100)}) since 1850`}
        </div>
      )}
      <div className="series-spark" style={{ margin: '6px 0 2px' }}><Sparkline values={since} markerYear={spliceYear} highlightYear={year} /></div>
      <div className="syn-caption" style={{ color: 'var(--syn-color-text-muted)' }}>
        {spliceYear != null ? `Law Dome ice core to ${spliceYear - 1} · NOAA Mauna Loa from ${spliceYear}. ` : ''}One global value: concentration is not split by country.
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChartCard, Chart } from '@syena/ds';
import type { ClimateSignal, YearValue } from '../../lib/climateSignal';
import { NOT_A_CLIMATE_MODEL, RELATIONSHIP_ANCHOR } from '../../lib/climateCopy';
import { BaselineChip } from '../climate/BaselineChip';
import { PurposeLine } from '../climate/PurposeLine';
import { SourceNote } from '../climate/SourceNote';
import { OWID, BERKELEY, NOAA, joinSources } from '../../lib/sources';
import { SECTION_GAP } from '../../constants';

// The Overview's "relationship" block (Area 2, requirements §2.2 block 2): the primary explanatory chart comparing emissions with
// the temperature anomaly over time (two axes). The scatter against cumulative CO₂ and the "Why emissions matter" explanation live on
// Climate Correlation, which owns that relationship; this block links there. It illustrates long-term co-movement as context; it never says
// one year's emissions set that year's temperature.

export function RelationshipSection({ signal, emissionsSeries }: { signal: ClimateSignal; emissionsSeries: YearValue[] }) {
  const first = emissionsSeries[0]?.year;
  const last = emissionsSeries[emissionsSeries.length - 1]?.year;

  const over = useMemo(() => {
    const temps = new Map(signal.series.temperature.map((p) => [p.year, p.value]));
    return {
      x: emissionsSeries.map((p) => String(p.year)),
      emissions: emissionsSeries.map((p) => p.value / 1000), // GtCO₂ a year
      temperature: emissionsSeries.map((p) => temps.get(p.year) ?? null),
    };
  }, [signal, emissionsSeries]);

  const title = `CO₂ emissions and temperature anomaly, ${first}–${last}`;

  return (
    <section id={RELATIONSHIP_ANCHOR} aria-labelledby="relationship-heading" style={{ marginBottom: SECTION_GAP }}>
      <h2 id="relationship-heading" className="syn-title-md" style={{ margin: '0 0 12px' }}>Why the trend matters</h2>
      <ChartCard source={joinSources(OWID, BERKELEY, NOAA)} title={title} headingLevel={3}>
        <PurposeLine>show how annual emissions and the temperature anomaly have moved over the same years.</PurposeLine>
        <Chart
          // The legend sits above the plot, so the plot is shorter by its height and legend and plot together are the 300 the card was drawn for.
          height={260}
          yTitle="GtCO₂ a year"
          y2Title="°C above 1850–1900"
          y2TickFormat=".1f"
          ariaLabel={`Bars: annual CO₂ emissions in GtCO₂, ${first} to ${last}, left axis. Line: temperature anomaly in °C above 1850–1900, right axis.`}
          series={[
            { name: 'CO₂ emissions (GtCO₂)', x: over.x, y: over.emissions, kind: 'bar' },
            { name: 'Temperature anomaly (°C)', x: over.x, y: over.temperature, kind: 'line', axis: 'y2' },
          ]}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          {/* The only baselined series is the temperature anomaly (1850–1900); emissions are plain levels. The window is in the title. */}
          <BaselineChip baseline="1850–1900" source="Berkeley Earth" />
          <span className="syn-caption" style={{ color: 'var(--syn-color-text-muted)' }}>
            Long-term co-movement, shown as context. No single factor or year explains warming.
          </span>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary className="syn-caption" style={{ cursor: 'pointer' }}>Sources &amp; method</summary>
          <SourceNote sources={['OWID + Global Carbon Project (emissions)', 'Berkeley Earth (temperature)', 'NOAA GML + Law Dome (CO₂ concentration)']}>
            {NOT_A_CLIMATE_MODEL} {signal.vintageCaveat ?? ''}{' '}
            <Link className="area2-link" to="/about#correlation" style={{ fontWeight: 600 }}>Full methodology →</Link>
          </SourceNote>
        </details>
      </ChartCard>
      <p className="syn-text-lg" style={{ margin: '12px 0 0' }}>
        Warming tracks the <strong>cumulative</strong> total rather than any one year:{' '}
        <Link className="area2-link" to="/climate-correlation" style={{ fontWeight: 600 }}>see the relationship on Climate Correlation →</Link>
      </p>
    </section>
  );
}

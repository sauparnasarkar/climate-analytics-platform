import { ChartCard, Chart } from '@syena/ds';
import { useSectionIds } from './useSectionIds';
import { SCENARIO_LABEL } from '../../lib/climateCopy';
import type { PathwayName } from '../../lib/pathways';
import { SCENARIOS_ANCHOR, type ScenarioView } from '../../lib/scenarioView';
import { BaselineChip } from '../climate/BaselineChip';
import { PurposeLine } from '../climate/PurposeLine';
import { SCENARIOS } from '../../lib/sources';

const PATHWAY_SLOT: Record<PathwayName, number> = { BAU: 1, Moderate: 2, Aggressive: 3 };
const ON_DARK: Record<PathwayName, string> = { BAU: '#FFB54D', Moderate: '#5FD8F7', Aggressive: '#8BD17C' };

const panel = { background: 'var(--syn-color-surface-raised)', border: '1px solid var(--syn-color-border-subtle)', borderRadius: 8 } as const;

/**
 * Implied temperature by scenario (requirements §1.3.5): the three emissions pathways beside the history they continue,
 * and the temperature they imply, with the API's own reading of the output. Illustrative throughout -- a translation of the pathways with the headline
 * slope, not a climate model and not a projection -- and labelled with the wording the requirements prescribe, which the API supplies. The observed
 * emissions are OWID's World fossil + cement total, the pathways' own basis.
 */
const EMBEDDED_STACK = '.module-embedded-grid[data-embedded] { grid-template-columns: minmax(0, 1fr) !important; }';

export function ScenarioSection({ view, embedded }: { view: ScenarioView; embedded?: boolean }) {
  const ids = useSectionIds(embedded, SCENARIOS_ANCHOR, 'scenarios-heading');
  const Heading = embedded ? 'h3' : 'h2'; // inside an answer the question is the h2
  const { startYear, horizon, pathways, observedEmissions, observedTemperature, observedMean5y, anchor, horizonGapC, readingNote, labels, assumptions } = view;
  const last = (xs: Array<{ year: number; value: number }>) => xs[xs.length - 1];
  // Described from what is actually drawn, so a missing or early-ending history is not announced as present.
  // An observed year with no value is a gap in the line, not a point to join across: the series is laid out on every year in its range, null where missing.
  const gapped = (xs: Array<{ year: number; value: number }>) => {
    const byYear = new Map(xs.map((p) => [p.year, p.value]));
    const x = Array.from({ length: xs[xs.length - 1].year - xs[0].year + 1 }, (_, i) => xs[0].year + i);
    return { x, y: x.map((yr) => byYear.get(yr) ?? null) };
  };
  const span = (xs: Array<{ year: number }>) => `${xs[0].year} to ${xs[xs.length - 1].year}`;
  const a = assumptions;
  const basis = [
    a.slope !== null ? `Slope ${a.slope.toFixed(3)}${a.slopeUnit ? ` ${a.slopeUnit}` : ''}${a.slopeLabel ? ` (${a.slopeLabel})` : ''}` : null,
    a.restOfWorldPct !== null ? `rest of world held at ${a.restOfWorldPct.toFixed(1)}% of the global total${a.restOfWorldYear !== null ? ` as of ${a.restOfWorldYear}` : ''}` : null,
    a.landUseGt !== null ? `land-use CO₂ held flat at ${a.landUseGt.toFixed(1)} Gt a year${a.landUseWindow ? ` (${a.landUseWindow[0]}–${a.landUseWindow[1]} mean)` : ''}` : null,
  ].filter((s): s is string => s !== null);

  return (
    <section id={ids.sectionId} aria-labelledby={ids.headingId} style={{ marginBottom: 24 }}>
      <style>{'@media (max-width: 1200px) { .module-scenario-grid { grid-template-columns: minmax(0, 1fr) !important; } }' + EMBEDDED_STACK}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px', margin: '0 0 12px' }}>
        <Heading id={ids.headingId} className="syn-title-md" style={{ margin: 0 }}>Implied temperature by scenario, {startYear}–{horizon}</Heading>
        <span className="syn-text-lg" style={{ padding: '2px 8px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '.04em', background: 'var(--syn-color-signal-caution-tint, rgba(176,122,16,0.16))', color: 'var(--area2-warning, #6E4800)' }}>
          {SCENARIO_LABEL}
        </span>
      </div>
      <div className="module-scenario-grid module-embedded-grid" data-embedded={embedded || undefined} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 290px', gap: 16, alignItems: 'start' }}>
        <ChartCard source={SCENARIOS} title="1 · Annual emissions" headingLevel={embedded ? 4 : 3}>
          <PurposeLine>show how far apart the pathways are in emissions, from where the record leaves off.</PurposeLine>
          <Chart
            height={300}
            yTitle="GtCO₂ a year"
            referenceX={{ x: startYear, label: `${startYear} start` }}
            ariaLabel={`Line chart of annual global CO₂ in GtCO₂, ${observedEmissions.length ? `observed ${span(observedEmissions)} and ` : ''}three pathways from ${startYear} to ${horizon}. In ${horizon}: ${pathways.map((p) => `${p.label} ${last(p.emissions).value.toFixed(1)}`).join(', ')}.`}
            series={[
              ...(observedEmissions.length ? [{ name: 'Observed', ...gapped(observedEmissions), kind: 'line' as const }] : []),
              ...pathways.map((p) => ({ name: p.label, x: p.emissions.map((r) => r.year), y: p.emissions.map((r) => r.value), kind: 'line' as const, dashed: true, slot: PATHWAY_SLOT[p.name] })),
            ]}
          />
          <div style={{ marginTop: 8 }}>
            <BaselineChip baseline="none · annual level" source="OWID World" />
          </div>
        </ChartCard>

        <ChartCard source={SCENARIOS} title="2 · Implied temperature" headingLevel={embedded ? 4 : 3}>
          <PurposeLine>show what those pathways would mean for the temperature anomaly: far apart in emissions, close in temperature.</PurposeLine>
          <Chart
            height={300}
            yTitle="°C above 1850–1900"
            referenceX={[{ x: startYear, label: `${startYear} start` }, ...(horizonGapC !== null ? [{ x: horizon, label: `${horizonGapC.toFixed(2)} °C apart` }] : [])]}
            ariaLabel={[
              'Line chart of the temperature anomaly in °C above the 1850 to 1900 mean.',
              observedTemperature.length ? `Observed annual ${span(observedTemperature)}.` : null,
              observedMean5y.length ? `Observed 5-year mean ${span(observedMean5y)}.` : null,
              anchor ? `Anchored at ${anchor.value.toFixed(2)} °C in ${anchor.year}.` : null,
              `Implied level of each pathway, ${startYear} to ${horizon}.`,
              `In ${horizon}: ${pathways.map((p) => `${p.label} ${last(p.temperature).value.toFixed(2)} °C`).join(', ')}${horizonGapC !== null ? `; the pathways are ${horizonGapC.toFixed(2)} °C apart` : ''}.`,
            ].filter((s): s is string => s !== null).join(' ')}
            series={[
              ...(observedTemperature.length ? [{ name: 'Observed (annual)', ...gapped(observedTemperature), kind: 'line' as const }] : []),
              ...(observedMean5y.length ? [{ name: '5-year mean', ...gapped(observedMean5y), kind: 'line' as const }] : []),
              ...pathways.map((p) => ({ name: p.label, x: p.temperature.map((r) => r.year), y: p.temperature.map((r) => r.value), kind: 'line' as const, dashed: true, slot: PATHWAY_SLOT[p.name] })),
              ...(anchor ? [{ name: `${anchor.value.toFixed(2)} °C anchor`, x: [anchor.year], y: [anchor.value], kind: 'marker' as const }] : []),
            ]}
          />
          <div style={{ marginTop: 8 }}>
            <BaselineChip baseline="1850–1900" source="Berkeley Earth" />
          </div>
        </ChartCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {readingNote && (
            <div style={{ ...panel, borderTop: `3px solid ${ON_DARK.BAU}`, padding: '12px 14px' }}>
              <div className="syn-caption" style={{ marginBottom: 6 }}>Reading note · generated from the output</div>
              <p className="syn-text-lg" style={{ margin: 0 }}>{readingNote}</p>
            </div>
          )}
          <table style={{ ...panel, width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', padding: 8 }}>
            <caption className="syn-caption" style={{ textAlign: 'left', color: 'var(--syn-color-text-muted)', padding: '0 0 4px' }}>{horizon} at a glance</caption>
            <thead>
              <tr className="syn-text-lg" style={{ textAlign: 'right', color: 'var(--syn-color-text-muted)' }}>
                <th scope="col" style={{ textAlign: 'left', fontWeight: 600, padding: '4px 8px' }}>Pathway</th>
                <th scope="col" style={{ fontWeight: 600, padding: '4px 8px' }}>GtCO₂ a year</th>
                <th scope="col" style={{ fontWeight: 600, padding: '4px 8px' }}>°C</th>
              </tr>
            </thead>
            <tbody>
              {pathways.map((p) => (
                <tr key={p.name} className="syn-text-lg" style={{ textAlign: 'right' }}>
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 400, padding: '4px 8px' }}>
                    <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: ON_DARK[p.name], marginRight: 8 }} />
                    {p.label}
                  </th>
                  <td style={{ padding: '4px 8px' }}>{p.emissions.length ? last(p.emissions).value.toFixed(1) : '—'}</td>
                  <td style={{ padding: '4px 8px' }}>{last(p.temperature).value.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="syn-caption" style={{ marginTop: 10, color: 'var(--syn-color-text-muted)' }}>
        {labels.length > 0 && <p style={{ margin: '0 0 4px' }}>{labels.join(' · ')}.</p>}
        {basis.length > 0 && <p style={{ margin: 0 }}>{basis.join('; ')}.</p>}
      </div>
    </section>
  );
}

import type { CorrelationMetaResponse } from '../../api/correlationTypes';
import { ALL_GAS_START_YEAR } from '../../lib/allGas';
import { buildTemperatureOffset } from '../../lib/methodology';
import { card, table, td, th, weak } from './tableStyles';

// Requirements §2.5: the baseline each view uses, and why. Fixed copy -- it describes the app's own rules, not data.
const BASELINES: Array<[view: string, baseline: string, why: string]> = [
  ['Overview, Historical Trends, Scenario Comparison', '1990 = 100', 'Matches the machine-learning training window used across the platform'],
  ['Country Profile trend', 'Full OWID history', '1990 is shown as a marker, not as the start'],
  ['All-gas relationship, gas composition', `${ALL_GAS_START_YEAR} onward`, 'Earlier PRIMAP-hist values are reconstructions'],
  ['Long-run CO₂ relationship', '1850–1900 reference', 'Pre-industrial context; keeps early accumulation visible'],
  ['Global, non-ML totals', 'Full available range', 'No model-consistency constraint applies'],
];

/** The baseline each view uses, and the computed 1850–1900 temperature reference (from the API). */
export function BaselinesSection({ meta }: { meta: CorrelationMetaResponse | null }) {
  const offset = buildTemperatureOffset(meta);
  return (
    <div role="region" aria-labelledby="baselines-caption" tabIndex={0} style={{ ...card, overflowX: 'auto' }}>
      <table style={{ ...table, minWidth: 640 }}>
        <caption id="baselines-caption" className="syn-caption" style={{ textAlign: 'left', paddingBottom: 6 }}>Baselines by view</caption>
        <thead>
          <tr className="syn-text-lg" style={weak}>
            {['View', 'Baseline', 'Why'].map((h) => <th key={h} scope="col" className="syn-text-lg" style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {BASELINES.map(([view, baseline, why]) => (
            <tr key={view} className="syn-caption">
              <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 400 }}>{view}</th>
              <td style={td}>{baseline}</td>
              <td style={td}>{why}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {offset && (
        <p className="syn-caption" style={{ margin: '8px 10px 0', ...weak }}>
          The {offset.from}–{offset.to} temperature reference is computed from the Berkeley Earth record itself ({offset.years} years), not taken from the literature: its mean on the dataset&apos;s own
          1951–1980 baseline is {offset.valueC.toFixed(3)} °C, subtracted from every anomaly.
        </p>
      )}
    </div>
  );
}

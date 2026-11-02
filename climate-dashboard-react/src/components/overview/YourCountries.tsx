import { NEGATIVE_COLOR, POSITIVE_COLOR } from '../../constants';
import { MAP_BANDS, type BandMode, type BandMove } from '../../lib/mapBands';

/** One chosen country: its value in the map's year, its share of the world total and the bands it crossed since the comparison year (null: no value to compare). */
export interface CountryRow {
  iso: string;
  name: string;
  /** MtCO₂ (a running total in Cumulative mode); null when the country has no value that year */
  value: number | null;
  sharePct: number | null;
  band: { from: number; to: number; steps: number } | null;
}

/** A footer row: a group's total, its share of the world total and its change since the comparison year (null: not shown, e.g. at the baseline). */
export interface TotalRow {
  label: string;
  value: number | null;
  sharePct: number | null;
  pctChange: number | null;
}

const num = (n: number) => Math.round(n).toLocaleString();
const gt = (mt: number) => `${(mt / 1000) < 10 ? (mt / 1000).toFixed(1) : Math.round(mt / 1000).toLocaleString()} Gt`;
const swatch = (band: number) => <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 2, flex: 'none', background: `var(--syn-data-band-${band + 1})`, outline: '1px solid color-mix(in srgb, var(--syn-color-text-primary) 25%, transparent)' }} />;
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
const dir = (steps: number) => (steps > 0 ? NEGATIVE_COLOR : POSITIVE_COLOR); // more CO₂ is the bad direction, as everywhere on the page
const arrow = (steps: number) => (steps > 0 ? `↑${steps}` : `↓${-steps}`);

/** The "Band since {baseline}" cell: the band the country was in, an arrow with the bands crossed, the band it is in; a dash when it did not change. The ranges are in the
 * tooltip and the accessible name, so the swatches carry no information a screen reader would miss. */
function BandCell({ band, labels }: { band: CountryRow['band']; labels: string[] }) {
  if (!band) return <span aria-label="No band to compare" title="No value to compare">—</span>;
  const { from, to, steps } = band;
  if (steps === 0) return <span aria-label={`Stayed in ${labels[to]}`} title={`Stayed in ${labels[to]}`}>–</span>;
  const what = `${steps > 0 ? 'Up' : 'Down'} ${Math.abs(steps)} ${Math.abs(steps) === 1 ? 'band' : 'bands'}: ${labels[from]} to ${labels[to]}`;
  return (
    <span role="img" aria-label={what} title={`${labels[from]} → ${labels[to]}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
      {swatch(from)}
      <span aria-hidden="true" style={{ minWidth: 24, textAlign: 'center', fontWeight: 700, color: dir(steps) }}>{arrow(steps)}</span>
      {swatch(to)}
    </span>
  );
}

/**
 * "Your countries · {year}": the chosen countries as one table, biggest first in the map's year, each with its share of the world total and the bands it crossed since the
 * comparison year, then two footer rows (the chosen group and all countries, with their change since the baseline) and a line for the biggest band changes among the rest.
 * Descriptive only: shares are of the World total, and nothing here attributes warming to a country.
 */
export function YourCountries({ year, baselineYear, mode, rows, footers, movers }: { year: number; baselineYear: number; mode: BandMode; rows: CountryRow[]; footers: TotalRow[]; movers: BandMove[] }) {
  const cumulative = mode === 'cumulative';
  const labels = MAP_BANDS[mode].labels;
  const atBaseline = year <= baselineYear;
  const fmt = (v: number | null) => (v == null ? '—' : cumulative ? gt(v) : num(v));
  const head = { padding: '4px 0', fontWeight: 500, textAlign: 'right', color: 'var(--syn-color-text-muted)', whiteSpace: 'nowrap' } as const;
  const cell = { padding: '5px 0', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } as const;
  const rule = '1px solid var(--syn-color-border-subtle)';
  return (
    <section aria-labelledby="your-countries-title" style={{ background: 'var(--syn-color-surface-raised)', border: '1px solid var(--syn-color-border-subtle)', borderTop: '3px solid var(--syn-data-cat-3, transparent)', borderRadius: 8, padding: '10px 14px 10px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <h3 id="your-countries-title" className="syn-caption" style={{ margin: 0 }}>{`Your countries · ${year}`}</h3>
      {/* A country's name stays on one line from a phone's width up (it wraps below, where the table is narrowest); the table scrolls sideways on its own as a last resort. */}
      <style>{'@media (min-width: 481px) { .your-countries-table tbody th[scope="row"] { white-space: nowrap !important; } }'}</style>
      <div style={{ overflowX: 'auto' }}>
        <table className="syn-text-md your-countries-table" style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{`The countries you chose, ${cumulative ? `total to ${year}` : `emissions in ${year}`}, share of the world total and band change since ${baselineYear}`}</caption>
          <thead>
            <tr className="syn-caption">
              <th scope="col" style={{ ...head, textAlign: 'left' }}>Country</th>
              <th scope="col" style={head}>{cumulative ? `Total to ${year}` : 'MtCO₂'}</th>
              <th scope="col" style={{ ...head, paddingLeft: 10 }}>Share of world</th>
              <th scope="col" style={{ ...head, paddingLeft: 10 }}>{`Band since ${baselineYear}`}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr style={{ borderTop: rule }}>
                <td colSpan={4} style={{ ...cell, textAlign: 'left', whiteSpace: 'normal', color: 'var(--syn-color-text-muted)' }}>Select countries to compare them here.</td>
              </tr>
            ) : rows.map((r) => (
              <tr key={r.iso} style={{ borderTop: rule }}>
                <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 400, whiteSpace: 'normal' }}>{r.name}</th>
                <td style={cell}>{fmt(r.value)}</td>
                <td style={{ ...cell, paddingLeft: 10, color: 'var(--syn-color-text-muted)' }}>{r.sharePct == null ? '—' : `${r.sharePct.toFixed(1)}%`}</td>
                <td style={{ ...cell, paddingLeft: 10 }}><BandCell band={r.band} labels={labels} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {footers.map((f, i) => (
              <tr key={f.label} style={{ borderTop: i === 0 ? '2px solid var(--syn-color-border-default)' : rule }}>
                <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 600, whiteSpace: 'normal' }}>{f.label}</th>
                <td style={{ ...cell, fontWeight: 600 }}>{fmt(f.value)}</td>
                <td style={{ ...cell, paddingLeft: 10, color: 'var(--syn-color-text-muted)' }}>{f.sharePct == null ? '—' : `${f.sharePct.toFixed(1)}%`}</td>
                <td style={{ ...cell, paddingLeft: 10, color: f.pctChange == null ? undefined : f.pctChange >= 0 ? NEGATIVE_COLOR : POSITIVE_COLOR }}>
                  {f.pctChange == null ? '—' : `${pct(f.pctChange)} since ${baselineYear}`}
                </td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      {!atBaseline && movers.length > 0 ? (
        <p className="syn-caption" style={{ margin: 0, color: 'var(--syn-color-text-muted)' }}>
          {'Also changed band: '}
          {movers.map((m, i) => (
            <span key={m.iso}>
              <span style={{ color: 'var(--syn-color-text-primary)' }}>{m.name}</span>{' '}
              <span style={{ fontWeight: 700, color: dir(m.steps) }} aria-label={`${m.steps > 0 ? 'up' : 'down'} ${Math.abs(m.steps)} ${Math.abs(m.steps) === 1 ? 'band' : 'bands'}`}>{arrow(m.steps)}</span>
              {i < movers.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      ) : null}
      <span className="syn-caption" style={{ color: 'var(--syn-color-text-muted)' }}>{`Sorted by ${cumulative ? `total to ${year}` : `emissions in ${year}`}. Band arrows count bands crossed; up means more CO₂.`}</span>
    </section>
  );
}

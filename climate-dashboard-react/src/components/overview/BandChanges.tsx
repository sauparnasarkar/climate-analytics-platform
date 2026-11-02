import { NEGATIVE_COLOR, POSITIVE_COLOR } from '../../constants';
import { MAP_BANDS, type BandMode, type BandMove } from '../../lib/mapBands';

const swatch = (band: number) => (
  <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 2, background: `var(--syn-data-band-${band + 1})`, outline: '1px solid color-mix(in srgb, var(--syn-color-text-primary) 25%, transparent)' }} />
);

/**
 * "Changed band since {baseline}": under the leading emitters, the countries that moved between the map's fixed colour bands since the comparison year, the
 * largest changes in tonnes first, up and then down (Cumulative has only ups: a running total cannot fall). Up means more CO₂ (the same direction colours as the rest of the page). With no later year picked there is nothing to
 * compare, and it says so.
 */
export function BandChanges({ mode, baselineYear, year, moves }: { mode: BandMode; baselineYear: number; year: number; moves: BandMove[] }) {
  const labels = MAP_BANDS[mode].labels;
  const atBaseline = year <= baselineYear;
  return (
    <section aria-labelledby="band-changes-title" style={{ background: 'var(--syn-color-surface-raised)', border: '1px solid var(--syn-color-border-subtle)', borderRadius: 8, padding: '10px 12px' }}>
      <h3 id="band-changes-title" className="syn-caption" style={{ margin: 0 }}>{`Changed band since ${baselineYear}`}</h3>
      {atBaseline ? (
        <p className="syn-caption" style={{ margin: '6px 0 0', color: 'var(--syn-color-text-muted)' }}>{`Pick a later year to see which countries changed band since ${baselineYear}.`}</p>
      ) : moves.length === 0 ? (
        <p className="syn-caption" style={{ margin: '6px 0 0', color: 'var(--syn-color-text-muted)' }}>{`No country has moved to a different band since ${baselineYear}.`}</p>
      ) : (
        <>
          <ul style={{ margin: '6px 0 4px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {moves.map((m) => (
              <li key={m.iso} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
                <span className="syn-text-lg">{m.name}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                  {swatch(m.from)}
                  <span style={{ fontWeight: 700, color: m.steps > 0 ? NEGATIVE_COLOR : POSITIVE_COLOR }}>
                    <span aria-hidden="true">{m.steps > 0 ? `↑${m.steps}` : `↓${-m.steps}`}</span>
                    <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{m.steps > 0 ? `up ${m.steps} ${m.steps === 1 ? 'band' : 'bands'}` : `down ${-m.steps} ${-m.steps === 1 ? 'band' : 'bands'}`}</span>
                  </span>
                  {swatch(m.to)}
                  <span className="syn-caption" style={{ color: 'var(--syn-color-text-muted)', minWidth: 72 }}>{`${labels[m.from]} → ${labels[m.to]}`}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="syn-caption" style={{ margin: 0, color: 'var(--syn-color-text-muted)' }}>Largest changes in tonnes first. Up means more CO₂.</p>
        </>
      )}
    </section>
  );
}

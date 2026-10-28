import { ChartCard, Chart, InlineAlert, Select, Spinner, formatFigure } from '@syena/ds';
import type { TimeseriesSeries } from '../../api/types';
import { NEGATIVE_COLOR, POSITIVE_COLOR } from '../../constants';
import { moversFromSeries } from '../../lib/movers';
import { OWID } from '../../lib/sources';
import type { Mover } from '../../lib/yearViews';

export const TOP_MOVERS_ANCHOR = 'top-movers';
export const PERCENT_CHANGE_ANCHOR = 'percent-change';

const SHOWN = 3;
const card = { background: 'var(--syn-color-surface-raised)', border: '1px solid var(--syn-color-border-subtle)', borderRadius: 8, padding: '12px 16px' } as const;

function MoverList({ title, rows, color, arrow }: { title: string; rows: Mover[]; color: string; arrow: string }) {
  return (
    <div style={card}>
      <h3 className="syn-title-sm" style={{ margin: '0 0 8px' }}>{title}</h3>
      {rows.length === 0 ? (
        <p className="syn-text-lg" style={{ margin: 0 }}>None among the selected countries.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((r) => (
            <li key={r.country} className="syn-text-lg" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderTop: '1px solid var(--syn-color-border-subtle)' }}>
              <span>{r.country}</span>
              <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>
                <span aria-hidden="true">{arrow} </span>{formatFigure(r.pctChange, { signed: true, decimals: 1 })}%
                <span className="syn-caption" style={{ marginLeft: 8, color: 'var(--syn-color-text-muted)' }}>{formatFigure(Math.round(r.absoluteChange), { signed: true, decimals: 0 })} MtCO₂</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Top Movers and % Change since 1990 for the selected countries (they moved here from the Overview, which no longer repeats them): the largest increases and
 * decreases in CO₂, and every selected country's change, from the 1990 baseline to the latest year. Read from the same annual series as the page's own chart,
 * so a number here agrees with a point there. Both sections are always in the DOM so their jump targets exist, whatever the selection or the data.
 */
export function MoversSection({ series, loading, error, countryCount, year, onYearChange }: {
  series: TimeseriesSeries[] | null; loading: boolean; error: string | null; countryCount: number;
  /** The year the reader chose (null: the latest the data has), and the setter; a year the data does not have reads as the latest. */
  year: number | null; onYearChange: (year: number) => void;
}) {
  const result = series ? moversFromSeries(series, year) : null;
  const status = countryCount === 0
    ? <InlineAlert variant="warning">Select at least one country.</InlineAlert>
    : error ? <InlineAlert variant="error">{error}</InlineAlert>
    : loading && !series ? <Spinner label="Loading…" />
    : !result ? <InlineAlert variant="warning">There is no 1990 baseline to compare with for the selected countries.</InlineAlert>
    : null;
  const movers = result?.movers ?? [];
  const increases = movers.filter((m) => m.pctChange > 0).slice(0, SHOWN);
  const decreases = movers.filter((m) => m.pctChange < 0).slice(-SHOWN).reverse();
  return (
    <>
      <div id={TOP_MOVERS_ANCHOR} style={{ marginTop: 24 }}>
        <h2 className="syn-title-sm" style={{ margin: '0 0 4px' }}>Top Movers{result ? `, 1990 → ${result.year}` : ' since 1990'}</h2>
        <p className="syn-caption" style={{ color: 'var(--syn-color-text-muted)', margin: '0 0 12px' }}>
          Fastest growth and largest reduction in CO₂ emissions among the {countryCount} selected countries, from 1990 to the year you choose.
        </p>
        {result && (
          // One year for both sections below: Top Movers and % Change are always measured from 1990 to the same year.
          <div role="group" aria-label="Year" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px' }}>
            <span className="syn-text-lg" style={{ color: 'var(--syn-color-text-muted)' }}>Year</span>
            <div style={{ minWidth: 96 }}>
              <Select size="small" suppressSearch ariaLabel="Year" value={String(result.year)} onChange={(v) => onYearChange(Number(v))} options={[...result.years].reverse().map((y) => ({ value: String(y), label: String(y) }))} />
            </div>
          </div>
        )}
        {status ?? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <MoverList title="Largest increases" rows={increases} color={NEGATIVE_COLOR} arrow="▲" />
            <MoverList title="Largest decreases" rows={decreases} color={POSITIVE_COLOR} arrow="▼" />
          </div>
        )}
      </div>

      <div id={PERCENT_CHANGE_ANCHOR} style={{ marginTop: 24 }}>
        <h2 className="syn-title-sm" style={{ margin: '0 0 12px' }}>% Change Since 1990</h2>
        {status ?? (
          <ChartCard source={OWID} title={`CO₂ % Change by Country, 1990–${result!.year}`} headingLevel={3}>
            <Chart
              height={320}
              xTitle="Country"
              yTitle={`% Change in CO₂ (1990→${result!.year})`}
              ariaLabel={`Bar chart of percent change in CO₂ emissions from 1990 to ${result!.year} for ${movers.length} countries, coloured by whether emissions fell (decrease) or rose (increase)`}
              series={[{ name: '% Change', x: movers.map((m) => m.country), y: movers.map((m) => m.pctChange), kind: 'bar', signed: 'change', signLabels: ['Decrease', 'Increase'] }]}
            />
          </ChartCard>
        )}
      </div>
    </>
  );
}

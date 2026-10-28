import { InlineAlert, Link } from '@syena/ds';
import type { CorrelationMetaResponse } from '../../api/correlationTypes';
import type { SpliceInfo } from '../../lib/climateSignal';
import { buildSources } from '../../lib/methodology';
import { card, table, td, th, weak } from './tableStyles';

/** The platform-wide sources table and the notes that explain why numbers that look alike differ. The table, the two-totals note and the splice figures are the
 * API's; the "used for" phrases, the landing pages and the explanation of why series differ are fixed copy. Each part appears only with its data. */
export function SourcesSection({ meta, metaFailed, splice, cumulativeFrom, anthropogenicFrom }: {
  meta: CorrelationMetaResponse | null;
  metaFailed: boolean;
  splice: SpliceInfo | null;
  /** The first year of the fossil-and-industry cumulative (country shares, the Home ranking, Overview): the OWID record's start. */
  cumulativeFrom: number | null;
  /** The first year of the total-anthropogenic cumulative behind the Climate Correlation slope: the fit's start. */
  anthropogenicFrom: number | null;
}) {
  const sources = buildSources(meta);
  return (
    <>
      {metaFailed && !meta && <InlineAlert variant="error">The sources, licences and data vintages could not be loaded right now.</InlineAlert>}
      {!meta && !metaFailed && <p className="syn-text-lg" style={{ margin: 0 }}>Loading…</p>}
      {sources.length > 0 && (
        <div role="region" aria-labelledby="sources-caption" tabIndex={0} style={{ ...card, overflowX: 'auto' }}>
          <table style={{ ...table, minWidth: 960 }}>
            <caption id="sources-caption" className="syn-caption" style={{ textAlign: 'left', paddingBottom: 6 }}>
              Every source the platform uses. Coverage, vintage and licence come from the pipeline&apos;s metadata.
            </caption>
            <thead>
              <tr className="syn-text-lg" style={weak}>
                {['Source', 'Used for', 'Coverage', 'Vintage', 'Licence', 'Links'].map((h) => <th key={h} scope="col" className="syn-text-lg" style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.name} className="syn-caption">
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                    {s.name}
                    {s.citation && <span style={{ display: 'block', fontWeight: 400, ...weak }}>Cite: {s.citation}</span>}
                  </th>
                  <td style={td}>{s.usedFor ?? ''}</td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{s.coverage ?? ''}</td>
                  <td style={td}>{s.vintage ?? ''}</td>
                  <td style={{ ...td, width: 190 }}>
                    {s.licenceShort ? (
                      <>
                        <p style={{ margin: 0 }}>{s.licenceShort}</p>
                        <details style={{ marginTop: 4 }}>
                          <summary style={{ cursor: 'pointer', ...weak }}>Full terms</summary>
                          {s.licences.map((l) => <p key={l} style={{ margin: '4px 0 0' }}>{l}</p>)}
                        </details>
                      </>
                    ) : s.licences.map((l) => <p key={l} style={{ margin: '0 0 4px' }}>{l}</p>)}
                  </td>
                  <td style={{ ...td, width: 280, whiteSpace: 'nowrap' }}>
                    {s.links.map((l) => <p key={l.url} style={{ margin: '0 0 4px' }}><Link href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</Link></p>)}
                    {s.dataUrls.map((u, i) => (
                      <p key={u} className="syn-caption" style={{ margin: '0 0 4px' }}>
                        <Link href={u} target="_blank" rel="noopener noreferrer">{`Data file${s.dataUrls.length > 1 ? ` ${i + 1}` : ''}`}</Link>
                      </p>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div style={card}>
          <div className="syn-caption" style={{ marginBottom: 4 }}>Why emissions series differ</div>
          <p className="syn-caption" style={{ margin: 0 }}>
            OWID/Global Carbon Project and PRIMAP-hist differ in scope, method, the treatment of bunker fuels and process emissions, and data vintage. Differences between them are expected, not errors.
          </p>
        </div>
        {meta?.two_global_totals && (
          <div style={card}>
            <div className="syn-caption" style={{ marginBottom: 4 }}>Two global totals</div>
            <p className="syn-caption" style={{ margin: 0 }}>{meta.two_global_totals}</p>
          </div>
        )}
        {cumulativeFrom !== null && anthropogenicFrom !== null && (
          <div style={card}>
            <div className="syn-caption" style={{ marginBottom: 4 }}>Two cumulative totals</div>
            <p className="syn-caption" style={{ margin: 0 }}>
              Country shares, the Home ranking and the Overview count fossil and industry CO₂ since {cumulativeFrom}, the start of the full OWID record. The Climate Correlation slope uses
              total anthropogenic CO₂, which adds land-use change, since {anthropogenicFrom}, the first year of the land-use series. They are different quantities and are labelled with their
              scope wherever they appear; a regression slope is unaffected by its start year.
            </p>
          </div>
        )}
        {splice && (
          <div style={card}>
            <div className="syn-caption" style={{ marginBottom: 4 }}>The {splice.year} splice</div>
            <p className="syn-caption" style={{ margin: 0 }}>
              Concentration uses Law Dome ice-core values before {splice.year} and Mauna Loa from {splice.year}.
              {splice.overlapYears ? ` Over the overlap years ${splice.overlapYears[0]}–${splice.overlapYears[1]} the two records differ by up to ${splice.maxAbsOverlapGapPpm?.toFixed(1) ?? '—'} ppm` : ''}
              {splice.gapPpm !== null ? `, and by ${Math.abs(splice.gapPpm).toFixed(2)} ppm at the splice itself` : ''}
              {splice.overlapYears ? '.' : ''} The splice year is marked on every concentration chart.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

import { SECTION_GAP } from '../../constants';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ChartCard, Icon, InlineAlert, SegmentedControl, useReducedMotion } from '@syena/ds';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { useShareReplay } from '../../hooks/useShareReplay';
import { SHARE_MEASURES, SHARE_START_YEAR, SHARE_STEP_MS, buildShareFrames, flowShareOf, fmtShare, segmentLabel, stockShareOf, type ShareCountry, type ShareMeasureId } from '../../lib/shareBars';
import { BaselineChip } from '../climate/BaselineChip';
import { PurposeLine } from '../climate/PurposeLine';
import { shareBasis } from '../../lib/shareBasis';
import { OWID } from '../../lib/sources';

export const SHARE_ANCHOR = 'share';

const REST_COLOR = 'var(--syn-color-border-default, #BDD3DB)';
const SEGMENT_TEXT = '#071C24';
// Rest of world is a theme-neutral surface, so its label follows the theme's text colour rather than the fixed dark text the bright country colours use.
const REST_TEXT = 'var(--syn-color-text-secondary)';

export interface BarProps {
  title: string;
  subtitle: string;
  order: ShareCountry[];
  values: number[];
  /** The remainder segment (Rest of world); omit for a bar whose segments are the whole, e.g. the four gases */
  rest?: number;
  tween: boolean;
  /** What a share is of, for the read-out: "of 2024 CO₂ emissions" */
  shareOf: string;
  /** What one segment is, for the stepping buttons' names: "country" ("Previous country") or "gas" */
  itemNoun?: string;
}

const REST = 'rest';
const btn = { background: 'none', border: 'none', padding: '2px 6px', cursor: 'pointer', color: 'var(--syn-color-text-primary)', fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center' } as const;
const srOnly = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const;

/**
 * One 100% stacked bar. Segment widths are flex-grow so they tween; the legend table below is the readable, accessible form of the same numbers.
 * A read-out under the bar names the hovered or tapped segment (SPEC.md §5.36): narrow segments carry no inline label, and phones hide them all.
 * The selection is held by code, so it follows the live value through a replay and closes when that code leaves the bar.
 */
export function ShareBar({ title, subtitle, order, values, rest, tween, shareOf, itemNoun = 'country' }: BarProps) {
  const summary = order.map((c, i) => `${c.name} ${fmtShare(values[i])}`).concat(rest === undefined ? [] : [`Rest of world ${fmtShare(rest)}`]).join(', ');
  const items = [
    ...order.map((c, i) => ({ code: c.code, name: c.name, pct: values[i], color: c.color, textColor: SEGMENT_TEXT, label: segmentLabel(c.code, values[i]) })),
    ...(rest === undefined ? [] : [{ code: REST, name: 'Rest of world', pct: rest, color: REST_COLOR, textColor: REST_TEXT, label: segmentLabel('RoW', rest) }]),
  ];
  const [sel, setSel] = useState<{ code: string; pinned: boolean } | null>(null);
  const [announced, setAnnounced] = useState('');
  const coarse = useMediaQuery('(pointer: coarse)');
  const rowRef = useRef<HTMLDivElement>(null);
  const idx = sel ? items.findIndex((it) => it.code === sel.code) : -1;
  const current = idx >= 0 ? items[idx] : null;
  const readout = (it: (typeof items)[number]) => `${it.name} · ${fmtShare(it.pct)} ${shareOf}`;
  const clear = () => { setSel(null); setAnnounced(''); };

  // The selected code left the bar (another measure or selection): close rather than show a stale value.
  useEffect(() => { if (sel && idx < 0) clear(); }, [sel, idx]);
  // A pinned read-out closes on a tap or click outside this bar row, or on Escape.
  const pinned = sel?.pinned === true;
  useEffect(() => {
    if (!pinned) return undefined;
    const onDown = (e: PointerEvent) => { if (rowRef.current && !rowRef.current.contains(e.target as Node)) clear(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clear(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [pinned]);

  const step = (by: -1 | 1) => {
    const next = items[idx + by];
    if (!next) return; // the ends do not wrap
    setSel({ code: next.code, pinned: true });
    setAnnounced(readout(next)); // a step changes what is shown, so it is announced; hover never is
  };

  const segment = (it: (typeof items)[number]) => (
    <div
      key={it.code}
      data-code={it.code}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse' && !pinned) setSel({ code: it.code, pinned: false }); }}
      onClick={() => (pinned && sel?.code === it.code ? clear() : setSel({ code: it.code, pinned: true }))}
      style={{
        flex: `${Math.max(it.pct, 0)} 1 0`,
        minWidth: 0,
        background: it.color,
        color: it.textColor,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: '44px',
        padding: it.pct >= 3 ? '0 6px' : 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        borderRadius: 4,
        cursor: 'pointer',
        outline: sel?.code === it.code ? '2px solid var(--syn-color-text-primary)' : 'none',
        outlineOffset: 1,
        transition: tween ? `flex-grow ${SHARE_STEP_MS}ms linear` : 'none',
      }}
    >
      <span className="share-seg-label">{it.label}</span>
    </div>
  );
  return (
    <div ref={rowRef} className="share-bar-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 150px) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
      <div style={{ paddingTop: 6 }}>
        <div className="syn-caption">{title}</div>
        <div className="syn-caption" style={{ color: 'var(--syn-color-text-muted)' }}>{subtitle}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div role="img" aria-label={`${title}: ${summary}`} onPointerLeave={(e) => { if (e.pointerType === 'mouse' && !pinned) setSel(null); }} style={{ display: 'flex', gap: 2, height: 44 }}>
          {items.map(segment)}
        </div>
        <div className="share-readout" style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, marginTop: 4 }}>
          {current ? (
            <>
              <span className="syn-caption" style={{ color: 'var(--syn-color-text-primary)', flex: '1 1 auto', minWidth: 0 }}>{readout(current)}</span>
              {pinned && (
                <>
                  <button type="button" aria-label={`Previous ${itemNoun}`} disabled={idx <= 0} onClick={() => step(-1)} style={{ ...btn, opacity: idx <= 0 ? 0.4 : 1 }}>‹</button>
                  <button type="button" aria-label={`Next ${itemNoun}`} disabled={idx >= items.length - 1} onClick={() => step(1)} style={{ ...btn, opacity: idx >= items.length - 1 ? 0.4 : 1 }}>›</button>
                  <button type="button" aria-label="Clear selection" onClick={clear} style={{ ...btn, color: 'var(--syn-color-text-muted)' }}><Icon name="close" size="small" /></button>
                </>
              )}
            </>
          ) : (
            <span className="syn-caption" style={{ color: 'var(--syn-color-text-muted)' }}>
              {coarse ? 'Tap a segment to see its share, then use ‹ › to step' : 'Hover or click a segment to see its share'}
            </span>
          )}
          <span aria-live="polite" style={srOnly}>{announced}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Who emitted the stock, and who emits now (requirements §2.2): two 100% stacked bars for the selected
 * countries -- their share of everything emitted since the cumulative start (the stock) and of one year's emissions (the flow) -- that play
 * 1970 → the page year. It shows the page year; "Replay" animates 1970 → that year (temporarily, changing nothing else on the page) and returns to it.
 * Shares describe contribution to emissions only; no warming is attributed to a country.
 */
export function ShareSection({ countries, year, pagePlaying }: { countries: string[]; year: number; pagePlaying: boolean }) {
  const [measureId, setMeasureId] = useState<ShareMeasureId>('owid_co2');
  const measure = SHARE_MEASURES.find((m) => m.id === measureId) ?? SHARE_MEASURES[0];
  const reduceMotion = useReducedMotion();
  const key = countries.join(',');
  const query = useAsync(
    async () => (countries.length ? api.correlationCountryShare({ source: measure.source, gasScope: measure.gasScope, countries, startYear: SHARE_START_YEAR }) : null),
    [measureId, key],
  );
  // useAsync keeps the previous response while a refetch is in flight; showing it under the newly chosen measure/selection would present the old data
  // as the new, so frames exist only for a settled response.
  const frames = useMemo(() => (query.loading ? null : buildShareFrames(query.data)), [query.data, query.loading]);
  const first = frames?.years[0] ?? SHARE_START_YEAR;
  const lastYear = frames?.years[frames.years.length - 1] ?? SHARE_START_YEAR;
  // The page year decides what is shown; a replay borrows the screen from 1970 up to it, then hands it back. It ends early when the page year
  // moves or the page's own Play starts.
  const { replayYear, replaying, start, stop } = useShareReplay(first, year, pagePlaying);
  const shown = Math.min(Math.max(replayYear ?? year, first), lastYear);
  const yi = frames ? Math.max(0, frames.years.indexOf(shown)) : 0;

  const body = (() => {
    if (countries.length === 0) return <p className="syn-text-lg" style={{ margin: 0 }}>Select countries in the picker below to compare their shares.</p>;
    if (query.error) return <InlineAlert variant="error">{query.error}</InlineAlert>;
    if (!frames) {
      const why = query.data?.notes?.length ? ` ${query.data.notes.join(' ')}` : '';
      return <p className="syn-text-lg" style={{ margin: 0 }}>{query.loading ? 'Loading…' : `No share data is available for these countries in this measure.${why}`}</p>;
    }
    const { order } = frames;
    const stock = frames.stock[yi];
    const flow = frames.flow ? frames.flow[yi] : null;
    const sum = (row: number[]) => row.reduce((a, b) => a + b, 0);
    return (
      <>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Button variant="ghost" onClick={replaying ? stop : start} disabled={!replaying && year <= first}>
            {replaying ? '■ Stop replay' : `▶ Replay ${first} → ${year}`}
          </Button>
          {replaying && (
            <div aria-hidden style={{ flex: '1 1 80px', height: 4, borderRadius: 2, background: 'var(--syn-color-border-subtle)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${year > first ? ((shown - first) / (year - first)) * 100 : 100}%`, background: 'var(--syn-color-accent-fill)' }} />
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="syn-caption" style={{ color: replaying ? 'var(--area2-warning, #6E4800)' : 'var(--syn-color-text-muted)' }}>{replaying ? 'replaying · temporary' : 'page year'}</span>
            <span aria-live="off" className="syn-title-md" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'right' }}>{shown}</span>
          </div>
        </div>
        {frames.missing.length > 0 && (
          <InlineAlert variant="warning">
            No data in this measure for {frames.missing.map((m) => m.name).join(', ')}; {frames.missing.length === 1 ? 'it is' : 'they are'} left out.{frames.notes.length ? ` ${frames.notes.join(' ')}` : ''}
          </InlineAlert>
        )}
        {frames.signed ? (
          <InlineAlert variant="warning">
            Some published shares in this measure are negative (a recorded data deviation), which stacked bars cannot show honestly, so only the table below is drawn.
          </InlineAlert>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ShareBar title="The stock" subtitle={`Cumulative${frames.cumulativeFrom != null ? ` ${frames.cumulativeFrom}` : ''}–${shown}`} order={order} values={stock} rest={frames.restStock[yi]} tween={!reduceMotion} shareOf={stockShareOf(measure, frames.cumulativeFrom)} />
          {flow && frames.restFlow ? (
            <ShareBar title="The flow" subtitle={`Annual, ${shown} only`} order={order} values={flow} rest={frames.restFlow[yi]} tween={!reduceMotion} shareOf={flowShareOf(measure, shown)} />
          ) : (
            <p className="syn-caption" style={{ margin: 0, color: 'var(--syn-color-text-muted)' }}>
              The annual (flow) shares are not published yet in this data release; the stock bar is unaffected.
            </p>
          )}
        </div>
        )}
        <table style={{ width: '100%', maxWidth: 640, marginTop: 12, borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
          <caption className="syn-caption" style={{ textAlign: 'left', color: 'var(--syn-color-text-muted)', paddingBottom: 4 }}>
            Share by country, {shown}
          </caption>
          <thead>
            <tr className="syn-text-lg" style={{ textAlign: 'right', color: 'var(--syn-color-text-muted)' }}>
              <th scope="col" style={{ textAlign: 'left', fontWeight: 600 }}>Country</th>
              <th scope="col" style={{ fontWeight: 600 }}>Stock</th>
              {flow && <th scope="col" style={{ fontWeight: 600 }}>Flow</th>}
            </tr>
          </thead>
          <tbody>
            {order.map((c, i) => (
              <tr key={c.code} className="syn-text-lg" style={{ textAlign: 'right' }}>
                <th scope="row" style={{ textAlign: 'left', fontWeight: 400 }}>
                  <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: c.color, marginRight: 8 }} />
                  {c.name}
                </th>
                <td>{fmtShare(stock[i])}</td>
                {flow && <td>{fmtShare(flow[i])}</td>}
              </tr>
            ))}
            <tr className="syn-text-lg" style={{ textAlign: 'right' }}>
              <th scope="row" style={{ textAlign: 'left', fontWeight: 400 }}>
                <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: REST_COLOR, marginRight: 8 }} />
                Rest of world
              </th>
              <td>{fmtShare(frames.restStock[yi])}</td>
              {flow && frames.restFlow && <td>{fmtShare(frames.restFlow[yi])}</td>}
            </tr>
            <tr className="syn-text-lg" style={{ textAlign: 'right', borderTop: '1px solid var(--syn-color-border-subtle)' }}>
              <th scope="row" style={{ textAlign: 'left' }}>Selected {order.length}</th>
              <td>{fmtShare(sum(stock))}</td>
              {flow && <td>{fmtShare(sum(flow))}</td>}
            </tr>
          </tbody>
        </table>
        <p className="syn-caption" style={{ margin: '10px 0 0', color: 'var(--syn-color-text-muted)' }}>
          {frames.label} · {shareBasis(measure.source).footer} Replay animates {first} → the page year at about a quarter of a second a year and changes nothing else on the page. Same selected countries in both bars, same colours. Shares describe contribution to emissions; no warming is attributed to a country.
        </p>
      </>
    );
  })();

  const measureControl = (
    <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
      <SegmentedControl
        name="share-measure"
        size="small"
        value={measureId}
        onChange={(v) => setMeasureId(v as ShareMeasureId)}
        items={SHARE_MEASURES.map((m) => ({ value: m.id, label: m.label }))}
      />
    </div>
  );

  return (
    <section id={SHARE_ANCHOR} aria-label="Share of cumulative emissions" style={{ marginBottom: SECTION_GAP }}>
      <ChartCard source={OWID}
        title={`Who emitted the stock, and who emits now (${year})`}
        headingLevel={2}
      >
        <PurposeLine>compare each selected country&apos;s part of everything emitted so far, by the measure chosen below, with its part of a single year.</PurposeLine>
        {/* Phones: the bars stack under their titles and drop the inline labels (the table below carries every value). */}
        <style>{`@media (max-width: 640px) { .share-bar-row { grid-template-columns: minmax(0, 1fr) !important; gap: 4px !important; } .share-seg-label { display: none; } }`}</style>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', marginBottom: 8 }}>
          {measureControl}
          {frames && (
            <BaselineChip baseline={`cumulative${frames.cumulativeFrom != null ? ` since ${frames.cumulativeFrom}` : ''}`} source={shareBasis(measure.source).chip} />
          )}
        </div>
        {body}
      </ChartCard>
    </section>
  );
}

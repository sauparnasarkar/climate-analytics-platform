import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Slider, useReducedMotion } from '@syena/ds';
import type { WorldMapTimeSeries } from '../../api/types';
import { MAX_SELECTED_COUNTRIES } from '../../constants';
import { buildRaceModel, fmtInt, raceFrame, raceShare, RACE_SIZE } from '../../lib/landingData';
import { VISUALLY_HIDDEN } from '../../lib/visuallyHidden';

const YEAR_STEP_MS = 550;
/** A row is at least this tall, and the gap between rows is fixed: a row grows with its label when the name wraps (a narrow phone, a long name). */
const MIN_ROW_HEIGHT = 36;
const ROW_GAP = 10;

/** The ten largest emitters, year by year (real per-year values from the world-map series), with
 * rows that re-rank as the years advance. One step per year; CSS handles the movement, not
 * per-frame React updates. Autoplays once when scrolled into view. Under prefers-reduced-motion it
 * shows the final year with no autoplay and no transitions (rows jump between years), but Play
 * still works -- pressing it is a deliberate user action, and a permanently dead Play button is
 * not an accommodation -- and a year slider is offered as well. */
export function RankRace({ series, worldTotals, expandedCount }: { series: WorldMapTimeSeries; worldTotals: number[]; expandedCount: number }) {
  const reduced = useReducedMotion();
  const model = useMemo(() => buildRaceModel(series), [series]);
  const last = model.years.length - 1;
  const [yearIdx, setYearIdx] = useState(last);
  const [playing, setPlaying] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const autoplayed = useRef(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const [labelHeight, setLabelHeight] = useState(0);

  // Advance one year per tick while playing; stop at the end.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setYearIdx((i) => {
        if (i >= last) { setPlaying(false); return last; }
        return i + 1;
      });
    }, YEAR_STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, last]);

  // useReducedMotion is live-subscribed: if the preference turns on mid-race, stop and snap to the
  // static final-year state instead of letting the timer keep advancing.
  useEffect(() => {
    if (reduced) { setPlaying(false); setYearIdx(last); }
  }, [reduced, last]);

  // First time the section scrolls into view, play from the start (never under reduced motion).
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || reduced || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (autoplayed.current || !entries.some((e) => e.isIntersecting)) return;
      autoplayed.current = true;
      setYearIdx(0);
      setPlaying(true);
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  // Rows are positioned absolutely so they can slide, so they cannot grow by themselves: every row takes the height of the tallest wrapped label,
  // measured before paint and again whenever a label changes size (the width changes, or a longer name arrives).
  useLayoutEffect(() => {
    const labels = [...(chartRef.current?.querySelectorAll<HTMLElement>('[data-race-label]') ?? [])];
    if (labels.length === 0 || typeof ResizeObserver === 'undefined') return;
    const measure = () => setLabelHeight(Math.ceil(Math.max(...labels.map((el) => el.getBoundingClientRect().height))));
    measure();
    const observer = new ResizeObserver(measure);
    labels.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [model, yearIdx]);
  const rowHeight = Math.max(MIN_ROW_HEIGHT, labelHeight);
  const rowPitch = rowHeight + ROW_GAP;

  const frame = raceFrame(model, yearIdx);
  const share = raceShare(frame.topTotal, worldTotals[yearIdx]);
  const ranked = frame.rows.filter((r) => r.inTop).sort((a, b) => a.rank - b.rank);
  // Each country's share of the same World total as the heading's, one decimal; none if the total is unavailable (never a share of something else).
  const worldNow = worldTotals[yearIdx];
  const rowShare = (value: number) => (worldNow && worldNow > 0 ? `${((value / worldNow) * 100).toFixed(1)}%` : null);
  const transition = reduced ? 'none' : 'top 450ms ease, opacity 300ms, width 450ms ease';

  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    if (yearIdx >= last) setYearIdx(0);
    setPlaying(true);
  };

  return (
    <section ref={sectionRef} aria-labelledby="race-heading" className="landing-race" style={{ padding: 'var(--landing-pad-y) var(--landing-pad-x)', background: 'var(--syn-color-surface-base)' }}>
      <div className="landing-race__text" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 id="race-heading" className="landing-h2" style={{ margin: 0 }}>
          {RACE_SIZE} countries{share != null ? `, ${share}% of the world’s CO₂` : ''}
        </h2>
        <p className="syn-text-lg" style={{ margin: 0, color: 'var(--syn-color-text-muted)' }}>
          The {RACE_SIZE} largest emitters each year, {model.years[0]} → {model.years[last]}. Watch the ranking reshuffle as the largest growers rise.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button variant="secondary" onClick={togglePlay}>
            {playing ? 'Pause' : yearIdx >= last ? `Replay ${model.years[0]} → ${model.years[last]}` : 'Play'}
          </Button>
        </div>
        {reduced && (
          // Reduced motion: no autoplay, so give the reshuffle a manual route too. The slider speaks in real
          // years (its aria-valuenow/min/max are read out), not row indices; scrubbing pauses playback.
          <Slider
            label="Year"
            min={model.years[0]}
            max={model.years[last]}
            step={1}
            value={model.years[yearIdx]}
            onChange={(year) => {
              setPlaying(false);
              setYearIdx(Math.max(0, Math.min(last, year - model.years[0])));
            }}
            showValue={false}
          />
        )}
        <div aria-hidden="true" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{frame.year}</div>
        <Link to="/overview" style={{ fontWeight: 600, color: 'var(--syn-color-accent-text, inherit)' }}>
          Compare any {MAX_SELECTED_COUNTRIES} of {expandedCount} countries on the Overview →
        </Link>
      </div>

      <div ref={chartRef} className="landing-race__chart" role="group" aria-label={`Ranking race, ${frame.year}`}>
        {/* Screen-reader view: the current year's ranking in rank order (the animated rows below are
            positioned absolutely in name order, so their DOM order says nothing about rank). */}
        <ol style={VISUALLY_HIDDEN} aria-label={`${RACE_SIZE} largest emitters in ${frame.year}, MtCO₂`}>
          {ranked.map((r) => <li key={r.country}>{r.country}: {fmtInt(r.value)}{rowShare(r.value) ? ` (${rowShare(r.value)})` : ''}</li>)}
        </ol>
        <div aria-hidden="true" style={{ position: 'relative', height: RACE_SIZE * rowPitch - ROW_GAP }}>
          {frame.rows.map((r) => (
            <div
              key={r.country}
              style={{
                position: 'absolute', left: 0, right: 0, top: r.inTop ? r.rank * rowPitch : RACE_SIZE * rowPitch, height: rowHeight,
                display: 'flex', alignItems: 'center', gap: 14, opacity: r.inTop ? 1 : 0, pointerEvents: 'none', transition,
              }}
            >
              <div data-race-label className="syn-text-lg" style={{ width: 'clamp(84px, 22vw, 140px)', flexShrink: 0, textAlign: 'right' }}>{r.country}</div>
              <div style={{ flexGrow: 1, height: '100%', background: 'var(--syn-color-surface-raised)', borderRadius: '0 4px 4px 0', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(r.value / model.maxValue) * 100}%`, background: 'var(--syn-color-accent-fill)', borderRadius: '0 4px 4px 0', transition: reduced ? 'none' : 'width 450ms ease' }} />
              </div>
              <div className="syn-text-lg" style={{ width: 64, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(r.value)}</div>
              {rowShare(r.value) != null && <div className="syn-caption" style={{ width: 46, flexShrink: 0, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: 'var(--syn-color-text-muted)' }}>{rowShare(r.value)}</div>}
            </div>
          ))}
        </div>
        <div className="syn-caption" style={{ marginTop: 12, color: 'var(--syn-color-text-muted)' }}>
          MtCO₂{worldNow && worldNow > 0 ? ', and each country’s share of the world total (international aviation and shipping included)' : ''} · bar length on a fixed 0–{fmtInt(model.maxValue)} scale
        </div>
      </div>
    </section>
  );
}

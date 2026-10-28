import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ClimateKpiStrip } from '../components/overview/ClimateKpiStrip';
import { RelationshipSection } from '../components/overview/RelationshipSection';
import { useClimateSignal } from '../hooks/useClimateSignal';
import { CLIMATE_SIGNAL_ANCHOR, RELATIONSHIP_ANCHOR } from '../lib/climateCopy';
import { worldTotals } from '../lib/mapSeries';
import { computeAutoplayStops } from '../lib/yearStops';
import { AtmosphericCo2Card, type ConcentrationContext } from '../components/overview/AtmosphericCo2Card';
import { LeadingEmitters, type MapMode } from '../components/overview/LeadingEmitters';
import { buildCumulative, cumulativeBaseFrom, fmtGt, leaders, positiveRange, worldTotalsFrom, type WorldTotals } from '../lib/cumulative';
import { ChartCard, MultiSelect, Button, InlineAlert, Spinner, Slider, JumpLinks, SegmentedControl, Choropleth, Text, useReducedMotion, Chart, formatFigure } from '@syena/ds';
import type { JumpLinkItem } from '@syena/ds';
import { api } from '../api/client';
import { ShareSection, SHARE_ANCHOR } from '../components/overview/ShareSection';
import { useAsync } from '../hooks/useAsync';
import { useCountries } from '../hooks/useCountries';
import { PAGE_YEAR_STEP, usePageYear } from '../hooks/usePageYear';
import type { UseYearAnimationResult } from '../hooks/useYearAnimation';
import { useElementHeight } from '../hooks/useElementHeight';
import { PageChrome } from '../layouts/PageChrome';
import { useStickyBarHeight } from '../hooks/useStickyBarHeight';
import { AnchorScroll, StickyAnchorRow } from '../components/StickyAnchorRow';
import { YearBadge } from '../components/overview/YearBadge';
import { PathwaysSection } from '../components/overview/PathwaysSection';
import { PATHWAYS_ANCHOR, buildPathways } from '../lib/pathways';
import { countryValuesForYear } from '../lib/yearViews';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { useJumpToHashOnLoad } from '../hooks/useJumpToHashOnLoad';
import { useSelectedCountries } from '../hooks/useCountrySelection';
import { buildHeadlineSentence } from '../lib/overviewHeadline';
import { BASELINE_YEAR, CLIMATE_SERIES_START_YEAR, MAX_SELECTED_COUNTRIES, POSITIVE_COLOR, NEGATIVE_COLOR, SECTION_GAP } from '../constants';
import type { MoverRow, OverviewTierMetrics, WorldMapTimeSeries } from '../api/types';
import { OWID } from '../lib/sources';
import { MethodNote } from '../components/MethodNote';
import { METHODS_ANCHORS } from '../lib/methodology';

// Stable, hand-authored jump-nav labels (SPEC.md §5.19) -- never copied from a ChartCard's own
// (often dynamic) title. "Map" and "By Country" would otherwise collide if taken verbatim from
// their titles, which share the literal prefix "CO₂ Emissions by Country".
// The map section's anchor was #map; it is #top-emitters now (the design's name). The grid that wraps the map and its side cards keeps
// id="map", so bookmarked and shared #map links still land at the same place.
const TOP_EMITTERS_ANCHOR = 'top-emitters';
const JUMP_ITEMS: JumpLinkItem[] = [
  // The map section's link reads "All Countries" (the section covers every country and the tier cards beside it); its id stays #top-emitters for the agent's and bookmarked links.
  { id: TOP_EMITTERS_ANCHOR, label: 'All Countries' },
  { id: SHARE_ANCHOR, label: 'Share' },
  { id: 'by-country', label: 'By Country' },
];
// The dashboard header is pinned at the top and 68 px tall (App header minHeight; styles.css offsets every anchor by the same 68). The
// anchor row sticks just below it, so jump targets get that plus the row's own height as their scroll margin.
// Any country will do: the share endpoint returns the same per-year World totals beside whichever series is asked for, and one country keeps it small.
const WORLD_TOTALS_PROBE_ISO = 'USA';
const JUMP_ROW_PX = 52; // the row's height plus a gap on one line; the measured height replaces it where the row wraps (Year control under the links)
const JUMP_ROW_GAP_PX = 10;

// Area 2's two leading sections come first; "Relationship" only exists while the climate data does.
const CLIMATE_SIGNAL_JUMP: JumpLinkItem = { id: CLIMATE_SIGNAL_ANCHOR, label: 'Climate signal' };
// "Pathways" closes the page and only exists while the scenario output does.
const RELATIONSHIP_JUMP: JumpLinkItem = { id: RELATIONSHIP_ANCHOR, label: 'Relationship' };

// The page year (usePageYear) steps by decade (1970, 1980 … 2020, then the latest year; requirements §2.6) and dwells ~1.75 s at each stop with
// the map, cards and the ppm panel all showing the same year. Year-over-year change is gradual enough to be hard to notice, while a decade
// jump is glaring; the slider and the stop buttons still reach any year. The KPI tier numbers snap directly to their new value each stop
// rather than counting up -- no separate animation duration to coordinate with this one.

// The muted-text colour, shared by the many small captions and labels on this page (one place to change it).
const WEAK_TEXT: CSSProperties = { color: 'var(--syn-color-text-muted)' };


interface TierRow {
  tier: string;
  countries: number;
  co2Total: number;
  pctChange: number;
  // True only at the animation's first frame (the map's minYear itself) -- "% Change since
  // {minYear}" is trivially +0.0% there, which reads as broken rather than informative.
  suppressPctChange?: boolean;
  // Cumulative mode (the map's other view): GtCO₂ emitted to the selected year and the group's share of the world total.
  cumulativeGt?: number;
  sharePct?: number;
}

// Builds a TierRow from a per-year series and the currently-playing frame, rather than
// reading OverviewResponse's static (always-latest-year) figures. countriesCount stays a
// plain number -- it doesn't vary by year.
// `baseIdx` is where the "% change since" baseline sits in `co2ByYear` (1990 on the real 1970 series; the first frame in a series that
// starts at the baseline). The change is suppressed at and before the baseline: "since 1990" is trivially 0 at 1990 and meaningless before it.
function animatedTierRow(
  title: string,
  countriesCount: number,
  co2ByYear: number[],
  yearIdx: number,
  baseIdx = 0,
): TierRow {
  const co2Total = co2ByYear[yearIdx] ?? 0;
  const base = co2ByYear[baseIdx] ?? 0;
  const pctChange = base ? ((co2Total - base) / base) * 100 : 0;
  return { tier: title, countries: countriesCount, co2Total, pctChange, suppressPctChange: yearIdx <= baseIdx };
}

// Each tier gets a full-width heading line (its name, e.g. "Expanded (Coverage + ≥100 Mt)") above
// a compact 3-column metric strip, rather than a single 4-column table (SPEC.md §5.18.2 original
// shape). A shared 4-column table crammed the tier name into ~130px of a ~380-450px-wide panel --
// measured directly against the DOM: "Expanded (Coverage + ≥100 Mt)" needs 204px and was getting
// 133px, truncating to "Expanded (Cover..." and losing the coverage/materiality qualifier this
// tier's whole definition rests on. Promoting the name to its own full-width line gives it the
// panel's entire width to wrap into instead, while Countries/CO₂/%Change -- short, fixed-format
// numbers that were never the truncation risk -- stay in a compact strip below it. Still one
// visually compact block (a shared border, no per-tier cards/icons), not the taller card layout
// this replaced.
// No count-up animation here -- these three metrics change every autoplay tick (as often as
// every 1.2s), so they snap directly to the new value in step with the map rather than easing,
// which would otherwise either lag behind the map or still be mid-animation when the next tick
// arrives. CountUpText (below) stays reserved for values that only ever change once, on load.
function TierSummaryPanel({ rows, year, mode = 'absolute', cumulativeFrom = null }: { rows: TierRow[]; year: number; mode?: MapMode; cumulativeFrom?: number | null }) {
  return (
    // A categorical-colour top rule (the data colours are applied per metric, never per sentiment).
    // Pairs with OverviewHeadline's rule below -- the two hero-row cards read as distinct metric groups.
    <div style={{ background: 'var(--syn-color-surface-raised)', border: '1px solid var(--syn-color-border-subtle)', borderTop: '3px solid var(--syn-data-cat-3, transparent)', borderRadius: 8, overflow: 'hidden' }}>
      {rows.map((row, i) => (
        <div
          key={row.tier}
          style={{ padding: '8px 12px', borderTop: i === 0 ? undefined : '1px solid var(--syn-color-border-subtle)' }}
        >
          <div className="syn-caption" style={{ marginBottom: 6 }}>{row.tier}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div>
              <div className="syn-caption" style={WEAK_TEXT}>Countries</div>
              <div className="syn-text-lg">{Math.round(row.countries).toLocaleString()}</div>
            </div>
            {mode === 'cumulative' ? (
              <>
                <div>
                  <div className="syn-caption" style={WEAK_TEXT}>{`Cumulative ${cumulativeFrom ?? ''}–${year}`}</div>
                  <div className="syn-text-lg">{`${fmtGt(row.cumulativeGt ?? 0)} GtCO₂`}</div>
                </div>
                <div>
                  <div className="syn-caption" style={WEAK_TEXT}>Share of world total</div>
                  <div className="syn-text-lg">{row.sharePct == null ? '—' : `${row.sharePct.toFixed(1)}%`}</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="syn-caption" style={WEAK_TEXT}>{`CO₂ (${year})`}</div>
                  <div className="syn-text-lg">{`${row.co2Total.toLocaleString(undefined, { maximumFractionDigits: 0 })} MtCO₂`}</div>
                </div>
                <div>
                  <div className="syn-caption" style={WEAK_TEXT}>% Chg. since 1990</div>
                  <div className="syn-text-lg" style={{ color: row.pctChange >= 0 ? NEGATIVE_COLOR : POSITIVE_COLOR }}>
                    {row.suppressPctChange ? '—' : `${formatFigure(row.pctChange, { signed: true, decimals: 1 })}%`}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// The Overview headline sentence (SPEC.md §5.18.1, decoupled from the picker in §5.18.5) -- a
// deterministic, data-derived one-sentence summary of who's grown/declined the most since 1990
// among a fixed top-emitters set, placed above the compressed tier table in the hero row's right
// column. Renders nothing when there's not enough usable data (see buildHeadlineSentence's own
// null cases).
// Country names are bolded and increase/decrease values colored (SPEC.md §5.18.6) -- the same
// NEGATIVE_COLOR (increase, bad)/POSITIVE_COLOR (decrease, good) convention TierSummaryPanel's
// own % Change column already uses, so a value here reads consistently with the rest of the
// page rather than introducing a third color rule.
function OverviewHeadline({ headlineMovers, scope, latestYear }: { headlineMovers: MoverRow[]; scope: string; latestYear: number }) {
  const segments = buildHeadlineSentence(headlineMovers, scope);
  if (!segments) return null;
  return (
    // accent-secondary top rule -- see TierSummaryPanel's own comment for the fallback/pairing
    // rationale.
    <div style={{ background: 'var(--syn-color-surface-raised)', padding: '12px 16px', border: '1px solid var(--syn-color-border-subtle)', borderTop: '3px solid var(--syn-color-accent-secondary, transparent)', borderRadius: 8 }}>
      <span className="syn-caption" style={WEAK_TEXT}>Since 1990</span>
      {/* A fixed 1990-to-latest comparison: it does not follow the map's year (unlike the tiers and the CO₂ panel below), and says so. */}
      <span className="syn-caption" style={{ display: 'block', color: 'var(--syn-color-text-muted)' }}>
        {`Fixed comparison, 1990 to ${latestYear}; the cards below follow the map's year.`}
      </span>
      <p className="syn-text-lg" style={{ margin: '4px 0 0' }}>
        {segments.map((seg, i) => {
          if (seg.kind === 'country') return <strong key={i}>{seg.text}</strong>;
          if (seg.kind === 'value') {
            return (
              <span key={i} style={{ color: seg.sentiment === 'negative' ? NEGATIVE_COLOR : POSITIVE_COLOR }}>
                {seg.text}
              </span>
            );
          }
          return seg.text;
        })}
      </p>
    </div>
  );
}

// Only ever mounted once worldMapSeries has actually loaded (see OverviewContent's guard).
function AnimatedWorldMap({
  worldMapSeries,
  selected,
  expanded,
  allCountriesTier,
  expandedTier,
  headlineMovers,
  concentration,
  cumulative,
  world,
  pageYear,
}: {
  /** The 1970-based series the map plays; the tiers' API totals cover its 1990-and-later part */
  worldMapSeries: WorldMapTimeSeries;
  selected: string[];
  expanded: string[];
  allCountriesTier: OverviewTierMetrics;
  expandedTier: OverviewTierMetrics;
  headlineMovers: MoverRow[];
  concentration: ConcentrationContext | null;
  /** Each country's cumulative CO₂ (Mt) at the last year before the series, from the all-countries snapshot; null while loading or if unavailable */
  cumulative: { byIso: Record<string, number>; from: number | null } | null;
  /** The World total per year (Mt): the denominator of every "share of the world total" here, so a share matches the Correlation tool's; null while loading or if unavailable (no share is shown then) */
  world: WorldTotals | null;
  /** The page's shared year and its Play/scrub controls (the sticky Year control drives the same value). */
  pageYear: UseYearAnimationResult;
}) {
  const minYear = worldMapSeries.years[0];
  const maxYear = worldMapSeries.years[worldMapSeries.years.length - 1];
  // The year is the page's (usePageYear), not the map's own: the map's Play, stops and slider move the same value as the sticky Year control.
  const { currentYear, isPlaying, toggle, seek } = pageYear;
  const yearIdx = currentYear - minYear;
  const stops = useMemo(() => computeAutoplayStops(minYear, maxYear, PAGE_YEAR_STEP), [minYear, maxYear]);

  // Absolute (annual MtCO₂) or Cumulative (running total, GtCO₂): one toggle drives the map, the tiers, the ranking and the table together.
  // Cumulative needs its base snapshot; until that arrives (or if it fails) the toggle offers only Absolute.
  const [mode, setMode] = useState<MapMode>('absolute');
  const cumMatrix = useMemo(() => (cumulative ? buildCumulative(worldMapSeries, cumulative.byIso) : null), [cumulative, worldMapSeries]);
  // The map layer, table and ranking read the running totals in MtCO₂ (the unit of the annual values, and the one whose hover format shows
  // small countries as numbers rather than "0"); the tier cards use the same totals in GtCO₂ (cumMatrix), as the design shows them.
  const cumMatrixMt = useMemo(() => (cumMatrix ? cumMatrix.map((row) => row.map((v) => (v == null ? null : v * 1000))) : null), [cumMatrix]);
  const cumRange = useMemo(() => (cumMatrixMt ? positiveRange(cumMatrixMt) : null), [cumMatrixMt]);
  const isCumulative = mode === 'cumulative' && cumMatrixMt !== null && cumRange !== null;
  const activeValues: ReadonlyArray<ReadonlyArray<number | null>> = isCumulative ? cumMatrixMt : worldMapSeries.values;
  const cumulativeFrom = cumulative?.from ?? null;

  // The map takes the values of the year in view, by country code; a country with no value (or none above zero) is drawn as no data. The map keeps
  // its zoom when the year or the selection changes, since only these inputs change.
  const valuesForYear = useMemo(
    () => Object.fromEntries(worldMapSeries.iso_codes.flatMap((code, i) => { const v = activeValues[yearIdx]?.[i]; return v == null || v <= 0 ? [] : [[code, v]]; })) as Record<string, number>,
    [worldMapSeries, activeValues, yearIdx],
  );

  // Every tier's per-year total is summed here from the same columnar series the map already holds (the API no longer sends per-year tier totals: they
  // duplicated this sum exactly), restricted to the tier's countries. Recomputed only when the series or the selection changes, not per
  // animation tick.
  const selectedIndices = useMemo(() => {
    const selectedNames = new Set(selected);
    const indices: number[] = [];
    worldMapSeries.countries.forEach((country, idx) => {
      if (selectedNames.has(country)) indices.push(idx);
    });
    return indices;
  }, [worldMapSeries, selected]);
  const selectedCo2ByYear = useMemo(
    () => worldMapSeries.values.map((row) => selectedIndices.reduce((sum, idx) => sum + (row[idx] ?? 0), 0)),
    [worldMapSeries, selectedIndices],
  );

  // All Countries / Expanded per year across the whole 1970 series. `baselineIdx` is where the "% change since 1990" baseline year sits in it.
  const baselineIdx = Math.max(0, worldMapSeries.years.findIndex((y) => y >= BASELINE_YEAR));
  const expandedIndices = useMemo(() => {
    const names = new Set(expanded);
    return worldMapSeries.countries.flatMap((c, i) => (names.has(c) ? [i] : []));
  }, [worldMapSeries, expanded]);
  const allCo2ByYear = useMemo(() => worldTotals(worldMapSeries), [worldMapSeries]);
  const expandedCo2ByYear = useMemo(
    () => worldMapSeries.values.map((row) => expandedIndices.reduce((sum, idx) => sum + (row[idx] ?? 0), 0)),
    [worldMapSeries, expandedIndices],
  );

  // Cumulative totals per tier and year (Gt), and each tier's share of the world total, for Cumulative mode.
  const groupCum = (indices: number[] | null) => (cumMatrix ? cumMatrix.map((row) => (indices ? indices.reduce((s, i) => s + (row[i] ?? 0), 0) : row.reduce<number>((s, v) => s + (v ?? 0), 0))) : null);
  const allCum = useMemo(() => groupCum(null), [cumMatrix]); // eslint-disable-line react-hooks/exhaustive-deps
  const expandedCum = useMemo(() => groupCum(expandedIndices), [cumMatrix, expandedIndices]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedCum = useMemo(() => groupCum(selectedIndices), [cumMatrix, selectedIndices]); // eslint-disable-line react-hooks/exhaustive-deps
  const cumulativeRow = (title: string, count: number, groupSeries: number[] | null): TierRow => {
    const gt = groupSeries?.[yearIdx] ?? 0;
    const worldMt = world?.cumulativeMt.get(currentYear);
    return { tier: title, countries: count, co2Total: 0, pctChange: 0, cumulativeGt: gt, sharePct: worldMt ? (gt / (worldMt / 1000)) * 100 : undefined };
  };

  // The top-5 leading emitters among ALL countries for the year on screen, in the active mode.
  const topFive = useMemo(
    () => leaders(activeValues[yearIdx] ?? [], worldMapSeries.countries, worldMapSeries.iso_codes, 5, (isCumulative ? world?.cumulativeMt : world?.annualMt)?.get(currentYear) ?? null),
    [activeValues, yearIdx, worldMapSeries, world, isCumulative, currentYear],
  );

  // ISO codes of the picker's selection, outlined on the map. Its own memo (and a separate Chart
  // prop) so a selection change restyles just the outline and never resets the user's zoom; it
  // only changes when the selection does, not per animation tick.
  const outlineLocations = useMemo(() => selectedIndices.map((i) => worldMapSeries.iso_codes[i]), [selectedIndices, worldMapSeries]);

  return (
    <>
      <ChartCard source={OWID}
        id={TOP_EMITTERS_ANCHOR}
        className="overview-map-card"
        // The annual map is "Where emissions come from": the By Country bar chart below keeps "CO₂ Emissions by Country (year)", so no two charts share a title.
        title={isCumulative ? `Cumulative CO₂ Emissions by Country, ${cumulativeFrom ?? ''}–${currentYear}` : `Where emissions come from, ${currentYear}`}
        supportText={isCumulative ? `Running total, MtCO₂ emitted ${cumulativeFrom != null ? `since ${cumulativeFrom}` : 'to date'} (the cards beside the map show GtCO₂)` : 'Annual MtCO₂'}
        actions={
          <SegmentedControl
            name="map-mode"
            size="small"
            value={isCumulative ? 'cumulative' : 'absolute'}
            onChange={(v) => setMode(v as MapMode)}
            items={[
              { value: 'absolute', label: 'Absolute' },
              { value: 'cumulative', label: 'Cumulative', disabled: !cumMatrix, reason: !cumMatrix ? 'Cumulative totals are unavailable right now' : undefined },
            ]}
          />
        }
        headingLevel={2}
        expandable
      >
        {/* flexWrap + a shrinkable slider track: Slider carries its own 220px min-width,
            which together with the Play/Pause button floored this row (and therefore the
            whole card, and therefore the page) at ~330px -- wider than a 320px phone like
            the Galaxy S9+, forcing horizontal scroll on the entire Overview page. Wrapping
            lets the slider drop to its own line before it has to overflow. */}
        <div style={{ marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={toggle}>
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          {/* No `minWidth: 0` here on purpose: Slider hardcodes its own 220px min-width, so
              zeroing this wrapper's floor would let the wrapper shrink while the Slider
              inside overflowed it instead of the row wrapping. Keeping the intrinsic floor
              is what makes flexWrap above actually trigger. */}
          <div style={{ flex: 1 }}>
            <Slider
              label="Year"
              min={minYear}
              max={maxYear}
              step={1}
              value={currentYear}
              onChange={seek}
              showValue={false}
              showRangeLabels
              showThumbValue
            />
          </div>
        </div>
        {/* Decade stops (§2.6): jump straight to one; Play steps through them. The slider above still scrubs year by year. */}
        <div role="group" aria-label="Jump to a year" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {stops.map((year) => (
            <Button key={year} size="small" variant={year === currentYear ? 'primary' : 'secondary'} aria-pressed={year === currentYear} onClick={() => seek(year)}>
              {year}
            </Button>
          ))}
          <span className="syn-caption" style={WEAK_TEXT}>or drag the year slider, year by year</span>
        </div>
        <Choropleth
          values={valuesForYear}
          valueLabel={isCumulative ? 'Cumulative CO₂, MtCO₂' : 'CO₂ emissions, MtCO₂'}
          unit="MtCO₂"
          domain={isCumulative && cumRange ? [Math.max(cumRange[0], 0.01), Math.max(cumRange[1], 0.02)] : undefined}
          ariaLabel={
            isCumulative
              ? `World map of cumulative CO₂ emissions by country: the running total emitted ${cumulativeFrom != null ? `since ${cumulativeFrom}` : 'to date'}, currently showing ${currentYear}, log-scaled colour from pale yellow (lowest) to deep red (highest)`
              : `World map of CO₂ emissions by country, ${minYear} to ${maxYear}, currently showing ${currentYear}, log-scaled colour from pale yellow (lowest) to deep red (highest)`
          }
          outline={outlineLocations}
        />
        <Text as="p" type="caption" tone="muted">
          {isCumulative
            ? `Grey: no CO₂ ever recorded for that country up to ${currentYear}.`
            : `Grey: no CO₂ data reported for that country in ${currentYear}.`}
          {outlineLocations.length > 0 ? ' Outlined: your selected countries.' : ''}
        </Text>
      </ChartCard>

      <div className="overview-hero-right" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Selection-invariant (SPEC.md §5.18.5) -- headlineMovers is a fixed top-N set from the
            server, independent of the picker, so this stays visible even at 0 selected
            countries (unlike the Selected tier row just below, which is still gated). */}
        <OverviewHeadline
          headlineMovers={headlineMovers}
          scope={`the top ${headlineMovers.length} emitters by ${allCountriesTier.latest_year} output`}
          latestYear={allCountriesTier.latest_year}
        />
        <TierSummaryPanel
          year={currentYear}
          mode={isCumulative ? 'cumulative' : 'absolute'}
          cumulativeFrom={cumulativeFrom}
          rows={
            isCumulative
              ? [
                  cumulativeRow('All Countries', allCountriesTier.countries_count, allCum),
                  cumulativeRow('Expanded (Coverage + ≥100 Mt)', expandedTier.countries_count, expandedCum),
                  ...(selected.length > 0 ? [cumulativeRow('Selected', selected.length, selectedCum)] : []),
                ]
              : [
                  animatedTierRow('All Countries', allCountriesTier.countries_count, allCo2ByYear, yearIdx, baselineIdx),
                  animatedTierRow('Expanded (Coverage + ≥100 Mt)', expandedTier.countries_count, expandedCo2ByYear, yearIdx, baselineIdx),
                  ...(selected.length > 0
                    ? [animatedTierRow('Selected', selected.length, selectedCo2ByYear, yearIdx, baselineIdx)]
                    : []),
                ]
          }
        />
        {/* The five leading emitters among all countries, in the same year and mode as the map and the tiers. */}
        <LeadingEmitters year={currentYear} mode={isCumulative ? 'cumulative' : 'absolute'} leaders={topFive} cumulativeFrom={cumulativeFrom} />
        {/* Atmospheric CO₂ for the map's own year (a stock: one global value, unchanged by the Absolute/Cumulative mode, never split by country). */}
        {concentration && <AtmosphericCo2Card year={currentYear} concentration={concentration} />}
      </div>
    </>
  );
}

// Split out so the overview fetch only ever starts once the expanded country list (and its
// featured-default seed) are already known — avoiding a wasted initial fetch before
// GET /api/countries resolves.
/** The link on to Historical Trends' Top Movers: the selection, and the page year unless it is the latest (Historical's default), so the same comparison opens there. */
function moversHref(selected: string[], year: number, latest: number): string {
  const params = new URLSearchParams(selected.map((c): [string, string] => ['countries', c]));
  if (year !== latest && year > BASELINE_YEAR) params.set('year', String(year));
  const qs = params.toString();
  return `/historical${qs ? `?${qs}` : ''}#top-movers`;
}

function OverviewContent({ featured, expanded }: { featured: string[]; expanded: string[] }) {
  // URL-backed (?countries=…, SPEC.md §5.25) so links can open with a chosen selection.
  const [selected, setSelected] = useSelectedCountries(featured, expanded);
  // Still fires even when selected is empty (client.ts omits the query param, server
  // defaults to FEATURED_COUNTRIES) — matches HistoricalTrendsPage's exact precedent. The
  // Selected tier/charts/movers below are gated on the *local* selected.length, not on
  // whatever the server happened to default to, so an empty selection reliably shows the
  // warning regardless of what data resolves to.
  const { data, error, loading } = useAsync(() => api.overview(selected), [selected.join(',')]);
  // Selection-invariant -- deps: [] means this fires exactly once for the page's lifetime,
  // regardless of how many times `selected` changes (SPEC.md §5.17.1).
  // One request for the 1970 range (requirements §2.6). The map plays all of it in decade stops, and the climate chart and sparklines
  // read the same series; the tiers use the API's totals from the 1990 baseline and are summed from this series before it.
  const { data: globeSeries, error: worldMapError, loading: worldMapLoading } = useAsync(() => api.worldMapSeries(CLIMATE_SERIES_START_YEAR), []);
  const worldMapSeries = globeSeries ?? null;
  // One year for the map, tiers, ranking and ppm card (and, in later steps, Share, By Country and % Change), set by the sticky control or the map.
  const pageYear = usePageYear(worldMapSeries?.years ?? null);
  // The sticky anchor row's real height (it wraps to two lines on a narrow screen), so jump targets clear all of it.
  const [stickyRow, setStickyRow] = useState<HTMLElement | null>(null);
  const stickyRowHeight = useElementHeight(stickyRow);
  const barHeight = useStickyBarHeight();
  const jumpRowPx = stickyRowHeight ? Math.ceil(stickyRowHeight) + JUMP_ROW_GAP_PX : JUMP_ROW_PX;
  const climate = useClimateSignal();
  // Each country's cumulative CO₂ just before the map's first year (one all-countries snapshot, ~200 rows): the base for Cumulative mode.
  // If it fails the map simply offers Absolute only.
  const cumulativeQuery = useAsync(async () => api.correlationCountryShare({ year: CLIMATE_SERIES_START_YEAR - 1, allCountries: true }), []);
  // The World total per year, from the remainder the share endpoint publishes beside any series (one country keeps the response small). If it fails, shares are left
  // out rather than shown against another total.
  const worldQuery = useAsync(async () => api.correlationCountryShare({ countries: [WORLD_TOTALS_PROBE_ISO], startYear: CLIMATE_SERIES_START_YEAR }), []);
  const worldShareTotals = useMemo(() => worldTotalsFrom(worldQuery.data), [worldQuery.data]);
  // The closing Pathways block; if the scenario output is unavailable the section (and its anchor) is simply omitted.
  const scenarioQuery = useAsync(async () => api.correlationScenarioTemperature(), []);
  const pathways = useMemo(() => buildPathways(scenarioQuery.data), [scenarioQuery.data]);
  const jumpItems = [CLIMATE_SIGNAL_JUMP, ...(climate.signal ? [RELATIONSHIP_JUMP] : []), ...JUMP_ITEMS];
  // The underlined link follows the section on screen, not only the last click.
  const activeJumpId = useScrollSpy(jumpItems.map((i) => i.id), barHeight + jumpRowPx);
  const cumulativeBase = useMemo(() => cumulativeBaseFrom(cumulativeQuery.data, CLIMATE_SERIES_START_YEAR - 1), [cumulativeQuery.data]);
  const concentrationContext = useMemo<ConcentrationContext | null>(
    () => (climate.signal ? { series: climate.signal.series.concentration, spliceYear: climate.signal.spliceYear, ppm1850: climate.signal.ppm1850 } : null),
    [climate.signal],
  );
  // The Share bars take ISO3 codes (what /country-share keys on); the picker holds names.
  const selectedIso = useMemo(
    () => (worldMapSeries ? worldMapSeries.countries.flatMap((c, i) => (selected.includes(c) ? [worldMapSeries.iso_codes[i]] : [])) : []),
    [worldMapSeries, selected],
  );
  const emissionsSeries = useMemo(() => (globeSeries ? worldTotals(globeSeries).map((value, i) => ({ year: globeSeries.years[i], value })) : []), [globeSeries]);
  const reduceMotion = useReducedMotion();
  // Handles a bookmarked/shared #anchor already in the URL (SPEC.md §5.19) -- called
  // unconditionally (before the early returns below) per the Rules of Hooks; the hook itself
  // only actually jumps once `data`/`worldMapSeries` (and therefore the jump targets) exist.
  // A deep link to #relationship must wait for the climate request to actually finish: that section only exists with its data, and the
  // hook jumps once only. (Any other hash jumps as soon as the page renders, which is bounded by the timeout.)
  const { hash } = useLocation();
  const waitsForClimate = hash === `#${RELATIONSHIP_ANCHOR}`;
  // Likewise #pathways: that section loads on its own request and only exists once it has answered.
  const waitsForPathways = hash === `#${PATHWAYS_ANCHOR}`;
  // ...and for the sticky row's first measurement: the jump's offset depends on whether the Year control wrapped onto a second line.
  useJumpToHashOnLoad(Boolean(data && worldMapSeries && climate.settled && (!waitsForClimate || climate.done) && (!waitsForPathways || !scenarioQuery.loading) && stickyRowHeight !== null), reduceMotion);

  // useAsync preserves the previous `data` while a refetch is in flight (only `loading`
  // flips), so only block on a spinner before anything has ever loaded — once `data`
  // exists, keep the picker/last-good UI mounted across every selection change instead of
  // unmounting the whole page (and its MultiSelect) on every refetch.
  if (error || worldMapError) return <InlineAlert variant="error">{error ?? worldMapError}</InlineAlert>;
  if (!data || !worldMapSeries || !climate.settled) return loading || worldMapLoading || !climate.settled ? <Spinner label="Loading…" /> : null;

  // By Country follows the page year: computed here from the series the map holds, for the selected countries, rather than the API's latest-year
  // /overview figures (the two agree at the latest year). Top Movers and % Change moved to Historical Trends.
  const year = pageYear.currentYear;
  const barRows = countryValuesForYear(worldMapSeries, selected, year);
  const barSeries = barRows.map((c) => c.country);
  const barValues = barRows.map((c) => c.value);

  const pickerLabel = `Select countries (up to ${MAX_SELECTED_COUNTRIES}/${expanded.length})`;

  return (
    <div className="overview-page">
      {/* Overrides styles.css's global 68 px anchor offset for this page: the header AND the sticky anchor row both sit above a jump target. */}
      <style>{`.overview-page [id] { scroll-margin-top: ${barHeight + jumpRowPx}px; }`}</style>
      <PageChrome
        title="Overview"
        purpose="Where emissions are, how they moved, and what they mean for temperature."
        summary={`${selected.length} of ${MAX_SELECTED_COUNTRIES} countries · ${pageYear.currentYear}`}
        filters={
          <>
            {/* The label sits on the same line as the picker and Reset (there is no Year control beside them any more): visible text here, the same words as the picker's accessible name. */}
            <span aria-hidden="true" className="syn-text-lg" style={{ color: 'var(--syn-color-text-muted)', whiteSpace: 'nowrap' }}>{pickerLabel}</span>
            <MultiSelect
              ariaLabel={pickerLabel}
              options={expanded.map((c) => ({ value: c, label: c }))}
              value={selected}
              onChange={setSelected}
              maxSelected={MAX_SELECTED_COUNTRIES}
            />
            <Button variant="ghost" onClick={() => setSelected(featured)}>Reset to default</Button>
          </>
        }
      />
      <Text as="p" type="caption" tone="muted" style={{ margin: '0 0 8px' }}>
        {selected.length} of {MAX_SELECTED_COUNTRIES} max · from the {expanded.length} Expanded countries · drives the Selected tier and every chart below
      </Text>
      {/* Breathing room below the jump links: the active link's underline used to sit flush against the
          map card's accent top rule (and its shadow), reading as one muddled line. */}
      {/* Sticks to the top while the page scrolls (requirements §2.2 wireframes: anchor / deep-link support). */}
      <StickyAnchorRow innerRef={setStickyRow}>
        <div className="area2-anchor-line">
          <AnchorScroll>
            <JumpLinks items={jumpItems} activeId={activeJumpId} />
          </AnchorScroll>
        </div>
      </StickyAnchorRow>

      <section id={CLIMATE_SIGNAL_ANCHOR} aria-labelledby="climate-signal-heading" style={{ marginBottom: SECTION_GAP }}>
        <h2 id="climate-signal-heading" className="syn-title-md" style={{ margin: '0 0 12px' }}>What is happening globally</h2>
        <ClimateKpiStrip
          emissions={{
            year: data.all_countries.latest_year,
            total: data.all_countries.latest_co2_total,
            pctChange: data.all_countries.pct_change_since_1990,
            baselineYear: BASELINE_YEAR,
            series: emissionsSeries,
          }}
          signal={climate.signal}
          mean5y={climate.mean5y}
        />
      </section>
      {climate.signal && <RelationshipSection signal={climate.signal} emissionsSeries={emissionsSeries} />}

      {/* 1400px, not the original 900px -- covers both reported iPad orientations (portrait
          1024, landscape 1366): at either width, the 2fr column left the choropleth too
          narrow for a world map, forced tall by the taller TierSummaryPanel sharing its row
          (SPEC.md §5.10). */}
      <style>{'@media (max-width: 1400px) { .overview-hero-grid { grid-template-columns: 1fr !important; } }'}</style>
      <div id="map" className="overview-hero-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: SECTION_GAP, alignItems: 'stretch' }}>
        <AnimatedWorldMap
          worldMapSeries={worldMapSeries}
          selected={selected}
          expanded={expanded}
          concentration={concentrationContext}
          cumulative={cumulativeBase}
          world={worldShareTotals}
          pageYear={pageYear}
          allCountriesTier={data.all_countries}
          expandedTier={data.expanded_countries}
          headlineMovers={data.headline_movers}
        />
      </div>

      <ShareSection countries={selectedIso} year={pageYear.currentYear} pagePlaying={pageYear.isPlaying} />

      {/* By Country, driven by the selection and the page year. Heading lives outside the selected.length guard (matching HistoricalTrendsPage's own pattern)
          so there is always an element to anchor to when deselected to 0. Top Movers and % Change since 1990 moved to Historical Trends. */}
      <div id="by-country" style={{ minWidth: 0 }}>
        <h2 className="syn-title-sm" style={{ margin: '8px 0 12px' }}>By Country<YearBadge year={year} /></h2>
        {selected.length === 0 ? (
          <InlineAlert variant="warning">Select at least one country.</InlineAlert>
        ) : barRows.length === 0 ? (
          <InlineAlert variant="warning">No CO₂ data for the selected countries in {year}.</InlineAlert>
        ) : (
          <ChartCard source={OWID} title={`CO₂ Emissions by Country (${year})`} headingLevel={3}>
            <Chart
              height={320}
              xTitle="Country"
              yTitle="CO₂ (MtCO₂)"
              showLegend={false}
              ariaLabel={`Bar chart of total CO₂ emissions in ${year} for ${barSeries.length} countries, ranging from ${Math.min(...barValues).toLocaleString()} to ${Math.max(...barValues).toLocaleString()} MtCO₂`}
              // Explicit brand color -- a single-series bar chart would otherwise default to
              // the categorical palette's index-0 token, which SPEC.md §5.12
              // deliberately made near-white for multi-line chart hierarchies. That reads as a
              // washed-out, colorless bar rather than a real color, so this chart gets the
              // app's own brand blue instead.
              series={[{ name: 'CO₂', x: barSeries, y: barValues, kind: 'bar' }]}
            />
          </ChartCard>
        )}
        {/* #percent-change is the design's name for the section that moved; the old #pct-change id stays on the inner element, so bookmarked links still land here, beside the link on. */}
        <div id="percent-change">
          <p id="pct-change" className="syn-text-lg" style={{ margin: '12px 0 0' }}>
            <Link className="area2-link" to={moversHref(selected, year, worldMapSeries.years[worldMapSeries.years.length - 1])} style={{ fontWeight: 600 }}>
              Top movers and % change since 1990 → Historical Trends
            </Link>
          </p>
        </div>
      </div>

      <MethodNote anchor={METHODS_ANCHORS.baselines}>
        Totals are fossil and cement CO₂ from Our World in Data (Global Carbon Project); indexed views use 1990 = 100. Each tier&apos;s country set, and the baselines every page uses, are on Methods &amp; data.
      </MethodNote>
      {pathways && <PathwaysSection pathways={pathways} />}
    </div>
  );
}

export default function OverviewPage() {
  const countries = useCountries();

  if (countries.loading) return <Spinner label="Loading…" />;
  if (countries.error) return <InlineAlert variant="error">{countries.error}</InlineAlert>;
  if (!countries.data) return null;

  return <OverviewContent featured={countries.data.featured} expanded={countries.data.expanded} />;
}

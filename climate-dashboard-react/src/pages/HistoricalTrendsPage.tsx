import { ChartCard, MultiSelect, Select, SegmentedControl, Button, InlineAlert, Spinner, useReducedMotion, Chart } from '@syena/ds';
import { MethodNote } from '../components/MethodNote';
import { MoversSection, PERCENT_CHANGE_ANCHOR, TOP_MOVERS_ANCHOR } from '../components/historical/MoversSection';
import { METHODS_ANCHORS } from '../lib/methodology';
import { Link } from 'react-router-dom';
import type { JumpLinkItem } from '@syena/ds';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useCountries } from '../hooks/useCountries';
import { useSelectedCountries } from '../hooks/useCountrySelection';
import { useJumpToHashOnLoad } from '../hooks/useJumpToHashOnLoad';
import { useLayoutSettled } from '../hooks/useLayoutSettled';
import { useCountingFrom } from '../hooks/useCountingFrom';
import { useUrlChoice } from '../hooks/useUrlChoice';
import { CountingFromControl } from '../components/CountingFromControl';
import { BASELINE_YEAR, GAS_COLUMNS, MAX_SELECTED_COUNTRIES } from '../constants';
import { cumulativeAreaSeries, shareLineSeries } from '../lib/historicalCumulative';
import { PageChrome } from '../layouts/PageChrome';
import { StickyJumpLinks, useStickyRowReady } from '../components/StickyJumpLinks';
import { OWID } from '../lib/sources';

const GAS_OPTIONS = Object.entries(GAS_COLUMNS).map(([value, label]) => ({ value, label }));
const GAS_KEYS = Object.keys(GAS_COLUMNS);
// The Top Movers / % Change year, kept in ?year= like the page's other choices. 'latest' is the default (no param); any year after the 1990 baseline is accepted here and
// read against the data later, so a year the series does not have falls back to the latest.
const MOVERS_YEAR_KEYS = ['latest', ...Array.from({ length: 2100 - BASELINE_YEAR }, (_, i) => String(BASELINE_YEAR + 1 + i))];

// The chart-card view switch (SPEC.md §5.28). URL-backed (?view=cumulative) so a link opens on it. Cumulative and Share
// are CO₂-only (OWID has no cumulative methane/N₂O): for any other gas the switch is not shown at all (only Annual exists),
// and a stale ?view=cumulative with ?gas=methane is read as Annual.
const VIEW_ITEMS = [
  { value: 'annual', label: 'Annual' },
  { value: 'cumulative', label: 'Cumulative' },
  { value: 'share', label: 'Share of world' },
];
const VIEW_KEYS = VIEW_ITEMS.map((v) => v.value);
interface ViewCopy {
  title: string;
  purpose: string;
  yTitle: string;
}

/** The chart copy per view; counting from a year (`from`) says what the figures are: emissions from that year, from zero, not the total since records began. */
function viewCopy(view: string, from: number | null): ViewCopy {
  if (view === 'cumulative') {
    return from == null
      ? { title: 'Cumulative CO₂ Emissions by Country', purpose: "Each band is a country's running total. The full height is the world total, and the grey band is every other country.", yTitle: 'GtCO₂, running total' }
      : { title: `CO₂ Emitted Since ${from}, by Country`, purpose: `Each band is the CO₂ a country has emitted since ${from}, counted from zero just before ${from}. The full height is the world's emissions in that period, and the grey band is every other country.`, yTitle: `GtCO₂ emitted since ${from}` };
  }
  return from == null
    ? { title: "Share of the World's Cumulative CO₂", purpose: "A falling line means the country's share of the total is shrinking, even though its own total keeps growing.", yTitle: '% of world cumulative CO₂' }
    : { title: `Share of the World's CO₂ Emitted Since ${from}`, purpose: `Each line is a country's share of all the CO₂ the world emitted since ${from}: a rising line means it is emitting more than its share of the period so far.`, yTitle: `% of world emissions since ${from}` };
}

// Stable labels (SPEC.md §5.19) -- distinct from the h2s' own gas-dependent text (e.g. "CO₂
// Emissions Over Time" vs. "Methane Emissions Over Time"), which would otherwise relabel the
// nav itself every time the gas selector changes.
const JUMP_ITEMS: JumpLinkItem[] = [
  { id: 'emissions-over-time', label: 'Emissions Over Time' },
  { id: TOP_MOVERS_ANCHOR, label: 'Top Movers' },
  { id: PERCENT_CHANGE_ANCHOR, label: '% Change Since 1990' },
  { id: 'ghg-by-decade', label: 'GHG Share by Decade' },
];

// Split out so the timeseries fetch only ever starts once the expanded country list (and
// its featured-default seed) are already known — avoiding a wasted initial fetch before
// GET /api/countries resolves.
function HistoricalTrendsContent({ featured, expanded }: { featured: string[]; expanded: string[] }) {
  // Defaults to the full 10 featured countries, matching Overview's Selected tier default
  // (previously just the first 5 here — inconsistent with the rest of the app).
  // URL-backed (?countries=…, SPEC.md §5.25) so links can open with a chosen selection.
  const [selectedCountries, setSelectedCountries] = useSelectedCountries(featured, expanded);
  // URL-backed too (?gas=methane), so "Open in Historical Trends" from the Ask page lands on the same gas.
  const [gas, setGas] = useUrlChoice('gas', GAS_KEYS, 'co2');
  const [moversYear, setMoversYear] = useUrlChoice('year', MOVERS_YEAR_KEYS, 'latest');

  const [from, setFrom] = useCountingFrom();
  const [viewChoice, setView] = useUrlChoice('view', VIEW_KEYS, 'annual');
  const co2 = gas === 'co2';
  const view = co2 ? viewChoice : 'annual';
  const annual = view === 'annual';

  // Only the active view's request is made: the annual one is skipped in the cumulative views and vice versa.
  const timeseries = useAsync(
    () => (annual ? api.historicalTimeseries(selectedCountries, gas) : Promise.resolve(null)),
    [selectedCountries.join(','), gas, annual],
  );
  const cumulative = useAsync(
    () => (annual ? Promise.resolve(null) : from == null ? api.historicalCumulative(selectedCountries) : api.historicalCumulative(selectedCountries, from)),
    [selectedCountries.join(','), annual, from],
  );
  // Top Movers and % Change are always CO₂ and always the annual series, whatever the chart above is showing (its gas and view switches do not apply to them).
  const moversSeries = useAsync(
    () => (selectedCountries.length ? api.historicalTimeseries(selectedCountries, 'co2') : Promise.resolve(null)),
    [selectedCountries.join(',')],
  );
  const composition = useAsync(
    () => api.historicalDecadeComposition(selectedCountries),
    [selectedCountries.join(',')],
  );

  // One concrete annotation instance, not a systematic framework -- placed at the highest
  // 2020 value across the selected series so the label sits near the line it's calling out.
  const year2020Values = (timeseries.data?.series ?? []).flatMap((s) => {
    const idx = s.years.indexOf(2020);
    return idx >= 0 && s.values[idx] != null ? [s.values[idx] as number] : [];
  });
  const lockdownAnnotation =
    year2020Values.length > 0 ? [{ x: 2020, y: Math.max(...year2020Values), text: 'Global lockdowns' }] : undefined;

  const reduceMotion = useReducedMotion();
  // Both jump targets below are always in the DOM as soon as this component mounts (h2s are
  // unconditional, only the chart content beneath each is gated) -- no data-loaded guard to wait
  // on here, unlike Overview.
  // The deep-link jump also waits for the pinned row's first measurement: where it wraps, the offset is wrong until then.
  const { rowReady, onRowReady } = useStickyRowReady();
  // The jump waits for the page's data and for the layout to stop growing: a jump measured on the short, still-loading page lands short of the section.
  const dataIn = !timeseries.loading && !cumulative.loading && !moversSeries.loading && !composition.loading;
  const layoutSettled = useLayoutSettled(rowReady && dataIn);
  useJumpToHashOnLoad(rowReady && dataIn && layoutSettled, reduceMotion);

  const pickerLabel = `Select countries (up to ${MAX_SELECTED_COUNTRIES}/${expanded.length})`;

  return (
    <div>
      <PageChrome
        title="Historical Emissions Trends"
        purpose="How emissions have changed over time, and which gases make them up."
        summary={`${selectedCountries.length} of ${MAX_SELECTED_COUNTRIES} countries`}
        filters={
          <>
            {/* The label sits on one line with the picker and Reset, as on the Overview: visible text here, the same words as the picker's accessible name. */}
            <span aria-hidden="true" className="syn-text-lg" style={{ color: 'var(--syn-color-text-muted)', whiteSpace: 'nowrap' }}>{pickerLabel}</span>
            <MultiSelect
              ariaLabel={pickerLabel}
              options={expanded.map((c) => ({ value: c, label: c }))}
              value={selectedCountries}
              onChange={setSelectedCountries}
              maxSelected={MAX_SELECTED_COUNTRIES}
            />
            <Button variant="ghost" onClick={() => setSelectedCountries(featured)}>Reset to default</Button>
          </>
        }
      />
      <StickyJumpLinks onReady={onRowReady} items={JUMP_ITEMS} />

      <h2 id="emissions-over-time" className="syn-title-sm">{annual ? `${GAS_COLUMNS[gas]} Emissions Over Time` : 'CO₂ Emissions Over Time'}</h2>
      <div style={{ marginBottom: 12 }}>
        <Select label="Emissions metric" options={GAS_OPTIONS} value={annual ? gas : 'co2'} onChange={setGas} disabled={!annual} />
      </div>
      {co2 && (
        <div style={{ marginBottom: 12 }}>
          <SegmentedControl name="historical-view" items={VIEW_ITEMS} value={view} onChange={setView} />
        </div>
      )}
      {!annual && (
        <CountingFromControl name="historical-counting-from" from={from} onChange={setFrom} lastYear={cumulative.data?.latest_year ?? cumulative.data?.years.at(-1) ?? new Date().getFullYear() - 2} />
      )}
      {selectedCountries.length === 0 ? (
        <InlineAlert variant="warning">Select at least one country.</InlineAlert>
      ) : annual ? (
        timeseries.loading ? (
          <Spinner label="Loading…" />
        ) : timeseries.error ? (
          <InlineAlert variant="error">{timeseries.error}</InlineAlert>
        ) : (
          <ChartCard source={OWID} title={`${GAS_COLUMNS[gas]} Emissions by Country`} headingLevel={3}>
            <Chart
              height={320}
              xTitle="Year"
              yTitle={`${GAS_COLUMNS[gas]} (MtCO₂e)`}
              ariaLabel={`Line chart of ${GAS_COLUMNS[gas]} emissions over time for ${selectedCountries.join(', ')}`}
              annotations={lockdownAnnotation}
              series={(timeseries.data?.series ?? []).map((s) => ({ name: s.name, x: s.years, y: s.values, kind: 'line' as const }))}
            />
          </ChartCard>
        )
      ) : cumulative.loading ? (
        <Spinner label="Loading…" />
      ) : cumulative.error ? (
        <InlineAlert variant="error">{cumulative.error}</InlineAlert>
      ) : cumulative.data ? (
        <ChartCard source={OWID} title={viewCopy(view, from).title} headingLevel={3}>
          <p className="syn-caption" style={{ margin: '0 0 8px', color: 'var(--syn-color-text-muted)' }}>
            <strong>Purpose:</strong> {viewCopy(view, from).purpose}
          </p>
          <Chart
            height={320}
            xTitle="Year"
            yTitle={viewCopy(view, from).yTitle}
            ariaLabel={`${view === 'cumulative' ? (from == null ? 'Stacked area chart of cumulative' : `Stacked area chart of CO\u2082 emitted since ${from},`) : from == null ? 'Line chart of the share of the world\u2019s cumulative' : `Line chart of the share of the world\u2019s CO\u2082 emitted since ${from},`} CO₂ emissions from ${cumulative.data.years[0]} for ${selectedCountries.join(', ')}`}
            series={view === 'cumulative' ? cumulativeAreaSeries(cumulative.data) : shareLineSeries(cumulative.data)}
          />
          <p className="syn-caption" style={{ margin: '8px 0 0', color: 'var(--syn-color-text-muted)' }}>
            Fossil and cement CO₂ · OWID · {from == null ? <>counted from each country&rsquo;s first record, shown from {cumulative.data.years[0]}</> : <>emissions since {from}: each total minus its total the year before {from}, so the chart is rebased to zero just before {from} and the first point is {from}&rsquo;s own emissions</>}
            {view === 'cumulative' ? ' · Rest of world = World minus the countries shown' : ''}. Shares are of the World total, international aviation and shipping included, the same as in Climate Correlation, which also offers PRIMAP-hist.{' '}
            <Link to="/climate-correlation">Open in Climate Correlation</Link>
          </p>
        </ChartCard>
      ) : null}

      <MoversSection series={moversSeries.data?.series ?? null} loading={moversSeries.loading} error={moversSeries.error} countryCount={selectedCountries.length} year={moversYear === 'latest' ? null : Number(moversYear)} onYearChange={(y) => setMoversYear(String(y))} />

      <div style={{ marginTop: 24 }}>
        <h2 id="ghg-by-decade" className="syn-title-sm">GHG Share by Gas Type per Decade</h2>
        {selectedCountries.length === 0 ? (
          <InlineAlert variant="warning">Select at least one country.</InlineAlert>
        ) : composition.loading ? (
          <Spinner label="Loading…" />
        ) : composition.error ? (
          <InlineAlert variant="error">{composition.error}</InlineAlert>
        ) : (
          <ChartCard source={OWID} title={`GHG Composition by Decade — ${selectedCountries.length} Countries (% share)`} headingLevel={3}>
            <Chart
              height={320}
              barmode="stack"
              xTitle="Decade"
              yTitle="Share (%)"
              ariaLabel={`Stacked bar chart of greenhouse gas composition by decade across ${selectedCountries.length} analyzed countries, showing CO2, methane, and nitrous oxide share of total emissions`}
              series={(composition.data?.series ?? []).map((s) => ({
                name: s.gas_label,
                x: composition.data!.decades,
                y: s.share,
                kind: 'bar' as const,
                // CO2 is always the dominant share (bottom of the stack), which lands on the
                // categorical palette's near-white index-0 token by default -- explicit brand
                // color instead of a washed-out white segment (SPEC.md §5.12).
                color: s.gas === 'co2' ? 'var(--syn-color-accent-fill)' : undefined,
              }))}
            />
          </ChartCard>
        )}
        {selectedCountries.length > 0 && !composition.loading && !composition.error && (
          <p className="syn-caption" style={{ margin: '8px 0 0', color: 'var(--syn-color-text-muted)' }}>
            Per-decade mix for the countries you select, from OWID. Climate Correlation shows the global mix from PRIMAP-hist since 1970; the two differ in scope and method.{' '}
            <Link to="/climate-correlation#gas-composition">Global view →</Link>
          </p>
        )}
      </div>
      <MethodNote anchor={METHODS_ANCHORS.baselines}>
        Emissions are Our World in Data (Global Carbon Project) series; indexed views use 1990 = 100, and the gas mix here is OWID per decade. Baselines, and why this differs from the PRIMAP-hist gas view, are on Methods &amp; data.
      </MethodNote>
    </div>
  );
}

export default function HistoricalTrendsPage() {
  const countries = useCountries();

  if (countries.loading) return <Spinner label="Loading…" />;
  if (countries.error) return <InlineAlert variant="error">{countries.error}</InlineAlert>;
  if (!countries.data) return null;

  return (
    <HistoricalTrendsContent
      featured={countries.data.featured}
      expanded={countries.data.expanded}
    />
  );
}

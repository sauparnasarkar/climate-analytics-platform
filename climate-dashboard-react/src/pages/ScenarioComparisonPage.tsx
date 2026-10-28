import { useState } from 'react';
import { MethodNote } from '../components/MethodNote';
import { METHODS_ANCHORS } from '../lib/methodology';
import { ChartCard, MultiSelect, Radio, DataTable, InlineAlert, Spinner, Icon, useIsMobile, useReducedMotion, type DataTableColumn, Chart, Treemap } from '@syena/ds';
import type { JumpLinkItem } from '@syena/ds';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useCountries } from '../hooks/useCountries';
import { useSelectedCountries } from '../hooks/useCountrySelection';
import { useJumpToHashOnLoad } from '../hooks/useJumpToHashOnLoad';
import { useLayoutSettled } from '../hooks/useLayoutSettled';
import { MAX_SELECTED_COUNTRIES, SCENARIO_PANELS } from '../constants';
import { PageChrome } from '../layouts/PageChrome';
import { StickyJumpLinks, useStickyRowReady } from '../components/StickyJumpLinks';
import { SCENARIOS } from '../lib/sources';
import { ScenarioSection } from '../components/module/ScenarioSection';
import { useScenarioTemperature } from '../hooks/useScenarioTemperature';
import { SCENARIOS_ANCHOR } from '../lib/scenarioView';

// Countries whose cumulative BAU emissions fall below this share of the total are grouped
// into a single "Other" tile rather than rendered individually -- at the treemap's default
// height the long tail's tiles are too small to hold even a short country name without the
// label overflowing or truncating mid-word.
// Grouping (rather than suppressing the label on an otherwise-still-tiny unlabeled tile)
// keeps every rendered tile both legible and tap-able. Keyed off BAU value alone, not the
// selected scenario's color, so which countries are grouped stays stable across a scenario
// switch -- only the tiles' colors change.
//
// The cutoff is 0.0125, not 0.01: the design system's Chart sets
// `uniformtext: { minsize: 10, mode: 'hide' }` on the treemap so a label that can't fit at 10px is
// hidden rather than shrunk illegibly, which is the right fix for THAT problem, but collided
// with this one: South Africa (1.223% at the 40-country Expanded view, individually rendered
// under the old 1% cutoff) landed in a narrow squarified-layout slot in the Moderate scenario
// and lost its label entirely -- an unlabeled-but-individually-rendered tile, exactly what C7
// exists to prevent. Squarified treemap layout doesn't allocate tile width as a strictly
// monotonic function of value share (Vietnam at 1.209% and Mexico at 1.272%, both close
// neighbors of South Africa's 1.223%, kept legible labels in the same layout), so this
// threshold is a heuristic margin against that non-monotonicity, not a hard guarantee -- if a
// similar hidden-label tile turns up again at a share above this cutoff, raise it further
// rather than assume this fully closes the class of bug.
const OTHER_TREEMAP_SHARE_THRESHOLD = 0.0125;

interface TreemapTile {
  label: string;
  value: number;
  color: number | null;
  countryCount: number;
}

// Stable labels (SPEC.md §5.19). "Country Comparison" anchors the shared <h2> above the
// per-scenario ChartCard loop below (one card per SCENARIO_PANELS entry) -- there's no single
// stable per-card target otherwise.
const IMPLIED_JUMP: JumpLinkItem = { id: SCENARIOS_ANCHOR, label: 'Implied Temperature' };
const JUMP_ITEMS: JumpLinkItem[] = [
  { id: 'reduction-map', label: 'Reduction Map' },
  { id: 'country-comparison', label: 'Country Comparison' },
  { id: 'cumulative-impact', label: 'Cumulative Impact' },
];

// Split out so the cumulative/compare fetches only ever start once the expanded country
// list (and its featured-default seed) are already known — avoiding a wasted initial fetch
// for an undefined selection before GET /api/countries resolves.
function ScenarioComparisonContent({ featured, expanded }: { featured: string[]; expanded: string[] }) {
  // URL-backed (?countries=…, like Historical Trends and Overview) so a link opens with a chosen selection.
  const [selectedCountries, setSelectedCountries] = useSelectedCountries(featured, expanded);
  const pickerLabel = `Select countries (up to ${MAX_SELECTED_COUNTRIES}/${expanded.length})`;
  const isMobile = useIsMobile();
  const [treemapScenario, setTreemapScenario] = useState<string>('BAU');
  // Touch-friendly surface for the treemap's hover info (SPEC.md §5.10): a tap never produces
  // a hover on touch devices, so tapping a tile shows the same size + color values here
  // instead -- Chart cancels Plotly's default drill-to-zoom on tap for this reason.
  const [tappedTileIndex, setTappedTileIndex] = useState<number | null>(null);

  // sort_by only affects the response's own `order` field, which nothing here reads anymore
  // now that the treemap is sized by BAU total (unaffected by the radio) and the table below
  // sorts via its own AG Grid column headers -- fixed at 'BAU' rather than a second control.
  const cumulative = useAsync(() => api.scenarioCumulative('BAU'), []);
  // scenarios/compare has no graceful empty-selection fallback (it requires at least one
  // country) -- short-circuit locally rather than round-tripping to a 422 the same way
  // Overview/Historical Trends's own endpoints tolerate an empty selection.
  const compare = useAsync(
    () => (selectedCountries.length > 0 ? api.scenarioCompare(selectedCountries) : Promise.resolve(null)),
    [selectedCountries.join(',')],
  );

  // One column per scenario; each row is a country with its cumulative value under every scenario.
  type CumulativeRow = { country: string } & Record<string, number | string | null | undefined>;
  const cumulativeColumns: DataTableColumn<CumulativeRow>[] = cumulative.data
    ? [{ key: 'country', header: 'Country' }, ...cumulative.data.scenarios.map((s) => ({ key: s, header: s, unit: 'MtCO₂' }))]
    : [];
  const cumulativeRows: CumulativeRow[] = cumulative.data?.rows.map((r) => ({ country: r.country, ...r.values })) ?? [];

  const treemapValues = cumulative.data?.rows.map((r) => r.values.BAU ?? 0) ?? [];
  // Signed delta: the scenario's 2040 level minus the country's current level. Below zero is still falling by 2040 (good), above zero still rising.
  const treemapColors = cumulative.data?.rows.map((r) => {
    const level2040 = r.year_2040[treemapScenario];
    const current = r.current_level;
    return level2040 != null && current != null ? level2040 - current : null;
  }) ?? [];

  const treemapRows = cumulative.data?.rows ?? [];
  const totalTreemapValue = treemapValues.reduce((sum, v) => sum + v, 0);
  const bigIndices: number[] = [];
  const groupedIndices: number[] = [];
  treemapValues.forEach((v, i) => {
    (totalTreemapValue > 0 && v / totalTreemapValue < OTHER_TREEMAP_SHARE_THRESHOLD ? groupedIndices : bigIndices).push(i);
  });
  const otherTile: TreemapTile | null =
    groupedIndices.length > 0
      ? (() => {
          const value = groupedIndices.reduce((sum, i) => sum + treemapValues[i], 0);
          // Value-weighted average delta, not a plain mean -- otherwise one large outlier
          // among many near-zero small countries gets diluted into an unrepresentative color.
          const withColor = groupedIndices.filter((i) => treemapColors[i] != null);
          const weightSum = withColor.reduce((sum, i) => sum + treemapValues[i], 0);
          const color = weightSum > 0 ? withColor.reduce((sum, i) => sum + treemapColors[i]! * treemapValues[i], 0) / weightSum : null;
          return { label: 'Other', value, color, countryCount: groupedIndices.length };
        })()
      : null;
  const treemapTiles: TreemapTile[] = [
    ...bigIndices.map((i): TreemapTile => ({ label: treemapRows[i].country, value: treemapValues[i], color: treemapColors[i], countryCount: 1 })),
    ...(otherTile ? [otherTile] : []),
  ];
  // Symmetric around zero so "2040 level equals current level" always lands on
  // `treemapColorScale`'s true midpoint stop -- required once an explicit colorScale is passed,
  // since Chart's own `cmid: 0` zero-centering only applies to its own default scale (see the
  // series prop below). The `1` floor guards the degenerate all-zero case (a real Plotly
  // colorRange can't span [0, 0]).

  const panelValues = SCENARIO_PANELS.flatMap(
    (scenario) => (compare.data?.scenarios[scenario] ?? []).flatMap((series) => series.values),
  );
  const yRange: [number, number] = [0, panelValues.length > 0 ? Math.max(...panelValues) : 0];

  const reduceMotion = useReducedMotion();
  // All three jump targets below are always in the DOM as soon as this component mounts (h2s
  // are unconditional, only the chart/table content beneath each is gated).
  // The deep-link jump also waits for the pinned row's first measurement: where it wraps, the offset is wrong until then.
  const { rowReady, onRowReady } = useStickyRowReady();
  // The jump waits for the page's data and for the layout to stop growing: a jump measured on the short, still-loading page lands short of the section.
  const implied = useScenarioTemperature();
  const dataIn = !cumulative.loading && !compare.loading && !implied.loading;
  const layoutSettled = useLayoutSettled(rowReady && dataIn);
  useJumpToHashOnLoad(rowReady && dataIn && layoutSettled, reduceMotion);

  return (
    <div>
      <PageChrome
        title="Scenario Comparison (2025–2040)"
        purpose="Compare Business as Usual (BAU), Moderate Mitigation (−2%/yr) and Aggressive Mitigation (−5%/yr), starting from 2025."
      />
      <StickyJumpLinks onReady={onRowReady} items={implied.view ? [IMPLIED_JUMP, ...JUMP_ITEMS] : JUMP_ITEMS} />

      {/* Emissions and implied temperature for the same three pathways, side by side: the section moved here from Climate Correlation. */}
      {implied.view && <ScenarioSection view={implied.view} />}

      <h2 id="reduction-map" className="syn-title-sm">Reduction Scenarios by Country</h2>
      <p className="syn-text-lg" style={{ marginBottom: 8, color: 'var(--syn-color-text-muted)' }}>
        Tile size is each country&apos;s cumulative BAU emissions, 2025–2040 (the smallest
        emitters grouped into a single &quot;Other&quot; tile); color{isMobile ? '' : ' (see the colorbar)'} shows
        whether the selected scenario&apos;s 2040 level is above or below the country&apos;s
        current level.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
        {SCENARIO_PANELS.map((scenario) => (
          <Radio
            key={scenario}
            name="treemap-scenario"
            label={scenario}
            checked={treemapScenario === scenario}
            onChange={() => setTreemapScenario(scenario)}
          />
        ))}
      </div>
      {cumulative.loading ? (
        <Spinner label="Loading…" />
      ) : cumulative.error ? (
        <InlineAlert variant="error">{cumulative.error}</InlineAlert>
      ) : cumulative.data ? (
        <ChartCard source={SCENARIOS}
          title={`Cumulative Emissions & Reduction Scenarios — ${treemapScenario} — ${cumulative.data.rows.length} Expanded Countries`}
          headingLevel={3}
          expandable
        >
          {(isExpanded) => (
            <>
              <Treemap
                compact
                height={isExpanded ? 640 : 360}
                ariaLabel={`Treemap of ${cumulative.data!.rows.length} countries (the smallest grouped into one "Other" tile), sized by cumulative BAU emissions 2025 to 2040 and coloured by the change to 2040 under ${treemapScenario}: below zero is still falling, above zero is still rising`}
                valueLabel="Cumulative BAU, MtCO₂"
                colorBy="value"
                diverging
                colorLabel={`${treemapScenario} 2040 vs. current, %`}
                items={treemapTiles.map((t, i) => ({ id: String(i), label: t.label, value: t.value, ...(t.color != null ? { colorValue: t.color } : {}) }))}
                selectedId={tappedTileIndex != null ? String(tappedTileIndex) : undefined}
                onSelect={(id) => setTappedTileIndex(Number(id))}
              />
              {tappedTileIndex != null && treemapTiles[tappedTileIndex] && (
                <div
                  className="syn-text-lg"
                  style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--syn-color-surface-overlay)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div>
                    <strong>
                      {treemapTiles[tappedTileIndex].label}
                      {treemapTiles[tappedTileIndex].countryCount > 1 ? ` (${treemapTiles[tappedTileIndex].countryCount} countries)` : ''}
                    </strong>
                    {' — '}
                    Cumulative BAU: {treemapTiles[tappedTileIndex].value.toLocaleString(undefined, { maximumFractionDigits: 0 })} MtCO₂
                    {', '}
                    {treemapScenario} 2040 vs. Current{treemapTiles[tappedTileIndex].countryCount > 1 ? ' (weighted avg.)' : ''}:{' '}
                    {treemapTiles[tappedTileIndex].color != null
                      ? `${treemapTiles[tappedTileIndex].color! >= 0 ? '+' : ''}${treemapTiles[tappedTileIndex].color!.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                      : '—'}{' '}
                    MtCO₂
                  </div>
                  <button
                    type="button"
                    onClick={() => setTappedTileIndex(null)}
                    aria-label="Dismiss country detail"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--syn-color-text-muted)', display: 'flex' }}
                  >
                    <Icon name="close" size="small" />
                  </button>
                </div>
              )}
            </>
          )}
        </ChartCard>
      ) : null}

      <div style={{ marginTop: 24 }}>
        <h2 className="syn-title-sm">Country Comparison</h2>
        {/* id lives here, not on the heading above -- matching Overview's "By Country" fix
            (SPEC.md §5.19/§5.20): the jump target should land on the picker a user actually
            needs to interact with, not just its heading, so the dropdown is guaranteed to be
            the first thing on screen after following the link rather than requiring a further
            manual scroll to reach it. */}
        <div id="country-comparison" className="country-picker-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          {/* The label sits on one line with the picker, as on the Overview and Historical Trends: visible text here, the same words as the picker's accessible name. */}
          <span aria-hidden="true" className="syn-text-lg" style={{ color: 'var(--syn-color-text-muted)', whiteSpace: 'nowrap' }}>{pickerLabel}</span>
          <MultiSelect
            ariaLabel={pickerLabel}
            options={expanded.map((c) => ({ value: c, label: c }))}
            value={selectedCountries}
            onChange={setSelectedCountries}
            maxSelected={MAX_SELECTED_COUNTRIES}
          />
        </div>

        {selectedCountries.length === 0 ? (
          <InlineAlert variant="warning">Select at least one country.</InlineAlert>
        ) : compare.loading ? (
          <Spinner label="Loading…" />
        ) : compare.error ? (
          <InlineAlert variant="error">{compare.error}</InlineAlert>
        ) : compare.data ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 16 }}>
            {SCENARIO_PANELS.map((scenario) => (
              <ChartCard source={SCENARIOS} key={scenario} title={scenario} headingLevel={3} expandable>
                {(isExpanded) => (
                  <Chart
                    height={isExpanded ? 600 : 300}
                    xTitle="Year"
                    yTitle="CO₂ (MtCO₂)"
                    showLegend={false}
                    yRange={yRange}
                    ariaLabel={`Line chart of ${scenario} CO₂ emissions from 1990 to 2040 for ${selectedCountries.join(', ')}`}
                    series={(compare.data!.scenarios[scenario] ?? []).map((s) => ({
                      name: s.name,
                      x: s.years,
                      y: s.values,
                      kind: 'line' as const,
                    }))}
                  />
                )}
              </ChartCard>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 24 }}>
        <h2 id="cumulative-impact" className="syn-title-sm">Cumulative Emissions Impact, 2025–2040</h2>
        <p className="syn-caption" style={{ marginBottom: 8, color: 'var(--syn-color-text-muted)' }}>
          Precise cumulative CO₂ totals per country and scenario — click a column header to sort.
        </p>

        {cumulative.loading ? (
          <Spinner label="Loading…" />
        ) : cumulative.error ? (
          <InlineAlert variant="error">{cumulative.error}</InlineAlert>
        ) : cumulative.data ? (
          <DataTable caption="Cumulative emissions by country under each scenario, 2025–2040" columns={cumulativeColumns} rows={cumulativeRows} />
        ) : null}
      </div>
      <MethodNote anchor={METHODS_ANCHORS.scenarios}>
        Business as usual is a second ETS fit on all observed years; Moderate and Aggressive cut emissions by 2% and 5% a year from 2025. Illustrative pathways, not projections. How the implied temperature is derived is on Methods &amp; data.
      </MethodNote>
    </div>
  );
}

export default function ScenarioComparisonPage() {
  const countries = useCountries();

  if (countries.loading) return <Spinner label="Loading…" />;
  if (countries.error) return <InlineAlert variant="error">{countries.error}</InlineAlert>;
  if (!countries.data) return null;

  return <ScenarioComparisonContent featured={countries.data.featured} expanded={countries.data.expanded} />;
}

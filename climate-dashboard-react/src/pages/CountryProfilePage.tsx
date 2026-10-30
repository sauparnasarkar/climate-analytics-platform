import { ChartCard, Select, DataTable, InlineAlert, KpiStat, Spinner, useReducedMotion, Chart } from '@syena/ds';
import { MethodNote } from '../components/MethodNote';
import { METHODS_ANCHORS } from '../lib/methodology';
import { Link } from 'react-router-dom';
import type { JumpLinkItem } from '@syena/ds';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useCountries } from '../hooks/useCountries';
import { useSelectedCountry } from '../hooks/useCountrySelection';
import { useEffectiveDefaults } from '../lib/DefaultCountriesProvider';
import { useJumpToHashOnLoad } from '../hooks/useJumpToHashOnLoad';
import type { CountryCumulativeResponse } from '../api/types';
import { fmtGt } from '../lib/cumulative';
import { KEY_STATISTICS_COLUMNS } from '../lib/keyStatistics';
import { useCountingFrom } from '../hooks/useCountingFrom';
import { CountingFromControl } from '../components/CountingFromControl';
import { PageChrome } from '../layouts/PageChrome';
import { StickyJumpLinks, useStickyRowReady } from '../components/StickyJumpLinks';
import { OWID } from '../lib/sources';

// The cumulative section's anchor. A constant (not a literal) because the agent's follow-up links point at `#cumulative` and its tests read `*_ANCHOR` constants
// from the dashboard source, so a rename here fails there (services/agent follow_ups.py).
const CUMULATIVE_ANCHOR = 'cumulative';

// Stable labels (SPEC.md §5.19) -- distinct from the ChartCards' own titles, which are always
// suffixed with the currently-selected country.
const JUMP_ITEMS: JumpLinkItem[] = [
  { id: 'emissions', label: 'Emissions' },
  // topSection (SPEC.md §5.20): stacked directly under "Emissions", close enough a neighbor
  // that scrolling it away while both are already visible would just hide the nav for no
  // benefit -- still scrolls normally once it's genuinely below the fold (e.g. mobile).
  { id: 'per-capita', label: 'Per Capita', topSection: true },
  { id: 'yoy-change', label: 'YoY Change' },
  { id: 'key-stats', label: 'Key Statistics' },
  { id: CUMULATIVE_ANCHOR, label: 'Cumulative' },
];

// Split out so the country-profile fetch only ever starts once the expanded country list
// (and its featured-default seed) are already known — avoiding a wasted initial fetch for
// an undefined country before GET /api/countries resolves.
function CountryProfileContent({ featured, expanded }: { featured: string[]; expanded: string[] }) {
  // URL-backed (?country=…, SPEC.md §5.25) so links can open a specific country's profile.
  // Opens on the first of the visitor's own default countries (Settings) where they have set some, else the first Featured country.
  const { defaults } = useEffectiveDefaults(featured, expanded);
  const [country, setCountry] = useSelectedCountry(defaults[0], expanded, featured[0]);
  const { data, error, loading } = useAsync(() => api.countryProfile(country), [country]);
  // Its own request, so a slow or failed cumulative fetch never blanks the sections above it (SPEC.md §5.28).
  const [from, setFrom] = useCountingFrom();
  const cumulative = useAsync(() => (from == null ? api.countryCumulative(country) : api.countryCumulative(country, from)), [country, from]);
  const reduceMotion = useReducedMotion();
  // The deep-link jump also waits for the pinned row's first measurement: where it wraps, the offset is wrong until then.
  const { rowReady, onRowReady } = useStickyRowReady();
  useJumpToHashOnLoad(rowReady && Boolean(data), reduceMotion);
  // Resolved once per render rather than once per YoY data point --

  return (
    <div>
      <PageChrome
        title="Country Profile"
        purpose="How one country's emissions have changed, per person and in total."
        summary={country}
        filters={
          <Select
            label={`Select a country (${expanded.length} available)`}
            options={expanded.map((c) => ({ value: c, label: c }))}
            value={country}
            onChange={setCountry}
          />
        }
      />
      <StickyJumpLinks onReady={onRowReady} items={JUMP_ITEMS} />

      {loading ? (
        <Spinner label="Loading…" />
      ) : error ? (
        <InlineAlert variant="error">{error}</InlineAlert>
      ) : data ? (
        <>
          {/* min(280px, 100%) — not a bare 280px floor — since a track that can never
              shrink below 280px still overflows a ~272px content area on the narrowest
              real phones (320px viewport, e.g. Galaxy S9+), even with auto-fit. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 16, margin: '16px 0' }}>
            <ChartCard source={OWID} id="emissions" title={`CO₂ Emissions — ${country}`} headingLevel={2} expandable>
              {(isExpanded) => (
                <Chart height={isExpanded ? 560 : 280} xTitle="Year" yTitle="CO₂ (MtCO₂)" showLegend={false} ariaLabel={`Line chart of total CO₂ emissions for ${country} from ${data.years[0]} to ${data.years[data.years.length - 1]}`} series={[{ name: 'CO₂', x: data.years, y: data.co2, kind: 'line' }]} />
              )}
            </ChartCard>
            <ChartCard source={OWID} id="per-capita" title={`CO₂ per Capita — ${country}`} headingLevel={2} expandable>
              {(isExpanded) => (
                <Chart height={isExpanded ? 560 : 280} xTitle="Year" yTitle="tCO₂/person" showLegend={false} ariaLabel={`Line chart of CO₂ emissions per capita for ${country} from ${data.years[0]} to ${data.years[data.years.length - 1]}`} series={[{ name: 'CO₂ per Capita', x: data.years, y: data.co2_per_capita, kind: 'line' }]} />
              )}
            </ChartCard>
          </div>

          <ChartCard source={OWID} id="yoy-change" title={`Year-on-Year CO₂ Change — ${country}`} headingLevel={2}>
            <Chart
              height={280}
              legendWithinHeight
              xTitle="Year"
              yTitle="YoY % Change"
              ariaLabel={`Bar chart of year-over-year percent change in CO₂ emissions for ${country}, coloured by whether emissions fell (decrease) or rose (increase)`}
              series={[{
                name: 'YoY % Change',
                x: data.yoy_years,
                y: data.yoy_values,
                kind: 'bar',
                signed: 'change',
                signLabels: ['Decrease', 'Increase'],
              }]}
            />
          </ChartCard>

          <div id="key-stats" style={{ marginTop: 24 }}>
            <h2 className="syn-title-sm">Key Statistics</h2>
            <DataTable caption={`Key statistics for ${country}`} columns={KEY_STATISTICS_COLUMNS} rows={data.table} />
          </div>

          <div id={CUMULATIVE_ANCHOR} style={{ marginTop: 24 }}>
            <h2 className="syn-title-sm">Cumulative contribution</h2>
            <CountingFromControl name="country-counting-from" from={from} onChange={setFrom} lastYear={cumulative.data?.years.at(-1) ?? new Date().getFullYear() - 2} />
            {cumulative.loading ? (
              <Spinner label="Loading…" />
            ) : cumulative.error ? (
              <InlineAlert variant="error">{cumulative.error}</InlineAlert>
            ) : cumulative.data ? (
              <CumulativeSection country={country} data={cumulative.data} from={from} />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function CumulativeSection({ country, data, from }: { country: string; data: CountryCumulativeResponse; from: number | null }) {
  const { latest } = data;
  const first = data.years[0];
  const lastYear = data.years[data.years.length - 1];
  const shareLabel = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`);
  const firstShare = data.share_of_world_cumulative[0];

  if (!latest) return <InlineAlert variant="warning">{`No cumulative CO₂ data for ${country}.`}</InlineAlert>;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 16, margin: '12px 0' }}>
        <KpiStat card label={from == null ? `Cumulative CO₂ since records began · ${latest.year}` : `Emitted since ${from} · ${latest.year}`} value={`${fmtGt(latest.cumulative_co2 / 1000)} GtCO₂`} note="Fossil and cement" />
        <KpiStat card label={from == null ? 'Share of world total' : `Share of the world's emissions since ${from}`} value={shareLabel(latest.share_of_world_cumulative)} note={from != null || firstShare == null ? undefined : `${shareLabel(firstShare)} in ${first}`} />
        <KpiStat card label={from == null ? `Rank by cumulative CO₂ · ${latest.year}` : `Rank by emissions since ${from} · ${latest.year}`} value={`#${latest.rank}`} note={`of ${latest.rank_of} countries`} />
      </div>
      <ChartCard source={OWID} title={from == null ? `Share of World CO₂ — ${country}` : `Share of World CO₂ since ${from} — ${country}`} headingLevel={3}>
        <p className="syn-caption" style={{ margin: '0 0 8px', color: 'var(--syn-color-text-muted)' }}>
          <strong>Purpose:</strong> {from == null ? <>Solid line: share of all CO₂ emitted so far. Dotted line: share of each year&rsquo;s emissions. When the dotted line is above the solid one, the country&rsquo;s share of the total is rising.</> : <>Solid line: share of all the CO₂ the world emitted since {from}. Dotted line: share of each year&rsquo;s emissions. When the dotted line is above the solid one, the country&rsquo;s share of the period&rsquo;s total is rising.</>}
        </p>
        <Chart
          height={280}
          legendWithinHeight
          xTitle="Year"
          yTitle="% of world"
          ariaLabel={`Line chart of ${country}'s share of the world's cumulative CO₂ and of each year's CO₂ emissions, ${first} to ${lastYear}`}
          series={[
            { name: 'Share of cumulative total', x: data.years, y: data.share_of_world_cumulative, kind: 'line' },
            { name: "Share of that year's emissions", x: data.years, y: data.share_of_world_annual, kind: 'line', dashed: true },
          ]}
        />
        <p className="syn-caption" style={{ margin: '8px 0 0', color: 'var(--syn-color-text-muted)' }}>
          Fossil and cement CO₂ · OWID · {from == null ? <>counted from each country&rsquo;s first record, shown from {first}.</> : <>emissions since {from}: each total minus its total the year before {from}.</>} Shares are of the World total, international aviation and shipping included, the same as in Climate Correlation, which also offers PRIMAP-hist.{' '}
          <Link to="/climate-correlation">Open in Climate Correlation</Link>
        </p>
      </ChartCard>
      <MethodNote anchor={METHODS_ANCHORS.baselines}>
        The trend uses each country&apos;s full OWID history, with 1990 shown as a marker. Shares are of the World total. Baselines and the cumulative scope are on Methods &amp; data.
      </MethodNote>
    </>
  );
}

export default function CountryProfilePage() {
  const countries = useCountries();

  if (countries.loading) return <Spinner label="Loading…" />;
  if (countries.error) return <InlineAlert variant="error">{countries.error}</InlineAlert>;
  if (!countries.data) return null;

  return <CountryProfileContent featured={countries.data.featured} expanded={countries.data.expanded} />;
}

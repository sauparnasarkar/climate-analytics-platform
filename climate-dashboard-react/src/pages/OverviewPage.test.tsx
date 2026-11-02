import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { useYearAnimation } from '../hooks/useYearAnimation';
import { ApiError } from '../api/types';
import type { CountriesResponse, OverviewResponse, WorldMapTimeSeries } from '../api/types';
import { NEGATIVE_COLOR, POSITIVE_COLOR } from '../constants';
import OverviewPage from './OverviewPage';
import { DefaultCountriesProvider } from '../lib/DefaultCountriesProvider';
import { DEFAULT_COUNTRIES_STORAGE_KEY } from '../lib/defaultCountries';
import { CONCENTRATION, PAIR, TEMPERATURE, TEMPERATURE_MEAN5Y } from '../test/climateFixtures';
import type { CorrelationCountryShareResponse } from '../api/correlationTypes';
import { buildCumulative } from '../lib/cumulative';
import { shareResponse } from '../test/shareFixtures';
import { SCENARIO_TEMPERATURE } from '../test/scenarioFixtures';
import { CLIMATE_SIGNAL_ANCHOR, RELATIONSHIP_ANCHOR } from '../lib/climateCopy';

const scrollSpy = vi.hoisted(() => vi.fn());
// The map's own table view lives in the design system's Choropleth: tests of what it lists draw the real one.
const realMap = vi.hoisted(() => ({ on: false }));

vi.mock('../api/client', () => ({
  api: {
    listCountries: vi.fn(), overview: vi.fn(), worldMapSeries: vi.fn(),
    correlationEmissionsTemperature: vi.fn(), correlationTemperature: vi.fn(), correlationConcentration: vi.fn(), correlationCountryShare: vi.fn(), correlationScenarioTemperature: vi.fn(),
  },
}));

// Chart's Plotly rendering is the design system's own concern (covered by its own
// test suite) — stubbed here so this page's tests exercise its own data-wiring
// logic, not Plotly's DOM lifecycle in jsdom (which has no real canvas/rAF timing
// and throws internally if a chart unmounts mid-redraw). Also surfaces the choropleth
// series' own `noDataColor` prop so a test can assert it's the live-resolved theme color,
// not `var(...)` or the removed hardcoded value, and the % Change
// bar series' `colorScale`/`colorRange` so a test can assert the diverging scale's stop
// order is reversed (increase reads as the negative/bad end) rather than Chart's own
// default order — the resolver's own unit tests don't protect this page's wiring.
vi.mock('@syena/ds', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const RealChoropleth = actual.Choropleth as ComponentType<Record<string, unknown>>;
  const SynThemeProvider = actual.SynThemeProvider as ComponentType<{ theme: string; storageKey: null; children: ReactNode }>;
  return {
    ...actual,
    // The hash-load hook's jump, observed (JumpLinks' own clicks use the real one internally).
    scrollToJumpTarget: (id: string) => scrollSpy(id),
    Chart: (props: {
      ariaLabel?: string;
      series?: Array<{ kind?: string; axis?: string; signed?: string; signLabels?: string[]; y?: Array<number | null> }>;
    }) => {
      const bar = props.series?.find((s) => s.kind === 'bar');
      return (
        <div
          data-testid="chart"
          aria-label={props.ariaLabel}
          data-axes={props.series ? JSON.stringify(props.series.map((s) => s.axis ?? 'y')) : undefined}
          data-bar-signed={bar?.signed}
          data-bar-sign-labels={bar?.signLabels ? JSON.stringify(bar.signLabels) : undefined}
          data-bar-y={bar?.y ? JSON.stringify(bar.y) : undefined}
        />
      );
    },
    // The map's own drawing is the design system's concern; its props are what this page wires.
    Choropleth: (props: { ariaLabel?: string; values: Record<string, number>; valueLabel: string; unit?: string; domain?: [number, number]; outline?: string[]; scale?: string; surface?: string; flush?: boolean; noDataCount?: number; controls?: string; outlineLabel?: string; breaks?: number[]; bandLabels?: string[] }) => realMap.on ? (
      <SynThemeProvider theme="night" storageKey={null}><RealChoropleth {...props} /></SynThemeProvider>
    ) : (
      <div
        data-testid="choropleth"
        aria-label={props.ariaLabel}
        data-values={JSON.stringify(props.values)}
        data-value-label={props.valueLabel}
        data-unit={props.unit}
        data-domain={props.domain ? JSON.stringify(props.domain) : undefined}
        data-scale={props.scale}
        data-surface={props.surface}
        data-flush={props.flush ? 'true' : undefined}
        data-no-data-count={props.noDataCount}
        data-controls={props.controls}
        data-outline-label={props.outlineLabel}
        data-breaks={props.breaks ? JSON.stringify(props.breaks) : undefined}
        data-band-labels={props.bandLabels ? JSON.stringify(props.bandLabels) : undefined}
        data-outline={props.outline ? JSON.stringify(props.outline) : undefined}
      />
    ),
  };
});

// useCountUp's animation is a UI-polish concern (real timing covered by manual/visual
// verification, not unit tests) -- stubbed to return the target immediately so assertions
// on the final rendered value don't race the animation in jsdom's rAF shim.
vi.mock('../hooks/useCountUp', () => ({ useCountUp: (target: number) => target }));

// useYearAnimation's own play/pause/replay/reduced-motion logic has its own dedicated test
// file (useYearAnimation.test.ts) -- stubbed here to a fixed, controllable return value so
// this page's tests assert on wiring (does the right year/co2 data reach the right controls),
// not on real setInterval timing racing jsdom.
vi.mock('../hooks/useYearAnimation');

const DEFAULT_ANIMATION = {
  currentYear: 2024,
  isPlaying: false,
  play: vi.fn(),
  pause: vi.fn(),
  toggle: vi.fn(),
  seek: vi.fn(),
  reducedMotion: false,
};

const FEATURED = [
  'China', 'United States', 'India', 'Russia', 'Japan',
  'Germany', 'Brazil', 'United Kingdom', 'South Africa', 'Australia',
];

const COUNTRIES: CountriesResponse = {
  featured: FEATURED,
  expanded: [...FEATURED, 'Vietnam'],
};

const RESPONSE: OverviewResponse = {
  all_countries: { label: 'All Countries', countries_count: 195, latest_year: 2024, latest_co2_total: 37406, co2_1990_total: 22184, pct_change_since_1990: 68.6 },
  expanded_countries: { label: 'Expanded', countries_count: 40, latest_year: 2024, latest_co2_total: 34477, co2_1990_total: 19686, pct_change_since_1990: 75.1 },
  selected: { label: 'Selected', countries_count: 10, latest_year: 2024, latest_co2_total: 25324, co2_1990_total: 14350, pct_change_since_1990: 76.5 },
  selected_country_list: FEATURED,
  latest_year_bar: [{ country: 'China', value: 12000 }],
  // Reflects SPEC.md §5.18.1's own hand-verified default-selection example -- exercises a
  // distinct abs-grower (China) vs. pct-grower (India), a near-zero "most stable" entry
  // (United States), and two decliners (United Kingdom, Germany), enough rows to trigger the
  // headline sentence's "most stable" clause (rows.length >= 4).
  top_movers: [
    { country: 'China', co2_1990: 2378, co2_latest: 12184, absolute_change: 9806, pct_change: 412.4 },
    { country: 'India', co2_1990: 681, co2_latest: 3763, absolute_change: 3082, pct_change: 452.6 },
    { country: 'United States', co2_1990: 5104, co2_latest: 4853, absolute_change: -251, pct_change: -4.9 },
    { country: 'United Kingdom', co2_1990: 592, co2_latest: 306, absolute_change: -286, pct_change: -48.3 },
    { country: 'Germany', co2_1990: 1042, co2_latest: 561, absolute_change: -481, pct_change: -46.2 },
  ],
  // Independent, 10-country fixture (SPEC.md §5.18.5) -- deliberately DIFFERENT from top_movers
  // above, to prove in tests that the headline sentence no longer shares data with the
  // selection-scoped Top Movers section. Reflects the real hand-verified top-10-emitters
  // example: China/India/United States/Germany/Russia are the four "interesting" entries the
  // sentence names; the other five (Japan/Indonesia/Iran/Saudi Arabia/South Korea) are filler
  // with moderate positive pct_change that doesn't disturb absGrower/pctGrower/mostStable/
  // decliners selection.
  headline_movers: [
    { country: 'China', co2_1990: 2378, co2_latest: 12184, absolute_change: 9806, pct_change: 412.4 },
    { country: 'India', co2_1990: 420, co2_latest: 2320, absolute_change: 1900, pct_change: 452.5 },
    { country: 'United States', co2_1990: 5000, co2_latest: 4780, absolute_change: -220, pct_change: -4.4 },
    { country: 'Germany', co2_1990: 1000, co2_latest: 543, absolute_change: -457, pct_change: -45.7 },
    { country: 'Russia', co2_1990: 1000, co2_latest: 702, absolute_change: -298, pct_change: -29.8 },
    { country: 'Japan', co2_1990: 1000, co2_latest: 1150, absolute_change: 150, pct_change: 15.0 },
    { country: 'Indonesia', co2_1990: 300, co2_latest: 840, absolute_change: 540, pct_change: 180.0 },
    { country: 'Iran', co2_1990: 300, co2_latest: 660, absolute_change: 360, pct_change: 120.0 },
    { country: 'Saudi Arabia', co2_1990: 250, co2_latest: 800, absolute_change: 550, pct_change: 220.0 },
    { country: 'South Korea', co2_1990: 400, co2_latest: 780, absolute_change: 380, pct_change: 95.0 },
  ],
  fastest_growth: { country: 'China', co2_1990: 2000, co2_latest: 12000, absolute_change: 10000, pct_change: 500 },
  largest_reduction: { country: 'United Kingdom', co2_1990: 600, co2_latest: 300, absolute_change: -300, pct_change: -50 },
  world_map: [{ country: 'China', iso_code: 'CHN', value: 12000 }],
};

// Only China (a FEATURED country) and Vietnam (used by the "switch selection" test) need
// real entries -- AnimatedWorldMap's client-side Selected sum simply skips any FEATURED
// country absent from this array, so the other 9 don't need fixture rows to exercise the
// default-selection path. Two consecutive years (not 1990/2024 literally) keeps yearIdx
// arithmetic (currentYear - years[0]) trivial to reason about in these tests; DEFAULT_ANIMATION's
// currentYear=2024 requires years[1]===2024 to land on index 1.
const WORLD_MAP_SERIES: WorldMapTimeSeries = {
  iso_codes: ['CHN', 'VNM'],
  countries: ['China', 'Vietnam'],
  years: [2023, 2024],
  values: [
    [14350, 21],
    [25324, 370],
  ],
  value_range: [21, 25324],
};

// A contiguous 1990..2024 series for [country, iso, 1990 value, 2024 value] rows (linear between): By Country, Top Movers and % Change are computed
// from the series the map holds, and the movers need the 1990 baseline inside it. DEFAULT_ANIMATION's year 2024 is the last row.
function seriesFrom1990(rows: Array<[string, string, number, number]>): WorldMapTimeSeries {
  const years = Array.from({ length: 35 }, (_, i) => 1990 + i);
  const values = years.map((y) => rows.map(([, , a, b]) => a + ((b - a) * (y - 1990)) / 34));
  const all = values.flat();
  return { iso_codes: rows.map((r) => r[1]), countries: rows.map((r) => r[0]), years, values, value_range: [Math.min(...all), Math.max(...all)] };
}
const SERIES_CHINA: WorldMapTimeSeries = seriesFrom1990([['China', 'CHN', 14350, 25324], ['Vietnam', 'VNM', 21, 370]]);

// JumpLinks (SPEC.md §5.19) calls the design system's useReducedMotion during render -- jsdom has
// no window.matchMedia at all, so every test needs this stub regardless of whether it cares
// about reduced motion specifically.
// The map card (its own Play/slider); the sticky Year control has a Play button too.
async function mapCard() {
  await screen.findByRole('heading', { level: 1, name: 'Overview' });
  return document.querySelector('.overview-map-card') as HTMLElement;
}

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  vi.mocked(useYearAnimation).mockReturnValue(DEFAULT_ANIMATION);
  // The Share section requests its series on mount; tests that care about it set their own, the rest get an empty (no-data) series.
  vi.mocked(api.correlationCountryShare).mockResolvedValue(shareResponse([]));
  // No scenario output unless a test supplies it: the Pathways section is then simply absent.
  vi.mocked(api.correlationScenarioTemperature).mockRejectedValue(new ApiError(503, 'unavailable'));
  mockReducedMotion(false);
});

afterEach(() => {
  realMap.on = false;
  // Not vi.unstubAllGlobals() -- that would also wipe the global ResizeObserver stub
  // src/test/setup.ts establishes once for the whole file (the design system's DataTable needs
  // it), breaking every test after the first. beforeEach already re-stubs matchMedia fresh
  // before each test, so there's nothing stale left for this to clean up anyway.
  vi.clearAllMocks();
  document.documentElement.removeAttribute('style');
});

describe('OverviewPage', () => {
  it('shows a loading state, then renders the summary and the Your countries table from the API response', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(SERIES_CHINA);
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    // The picker's hint is computed from the selection and the expanded list, and says what Expanded means.
    expect(screen.getByText('10 of 10 max · from the 11 Expanded countries (coverage countries plus any country emitting ≥100 Mt) · drives the Your countries table and every chart below')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Select countries \(up to 10\/11\)/ })).toBeInTheDocument();
    // The map and the Selected-tier bar chart no longer share a title: the map is "Where emissions are", the bar chart keeps "CO₂ Emissions by Country".
    expect(screen.getByText('Where emissions come from, 2024')).toBeInTheDocument();
    expect(screen.getAllByText('CO₂ Emissions by Country (2024)')).toHaveLength(1);
    expect(screen.getAllByText('All Countries')).toHaveLength(1); // the jump link to its section
    expect(screen.getByRole('heading', { name: 'Your countries · 2024' })).toBeInTheDocument();
    expect(yourHeads()).toEqual(['Country', 'MtCO₂', 'Share of world', 'Band since 1990']);
    expect(yourFoot().map((r) => r[0])).toEqual(['Selected · 10', 'All countries · 195']); // no World total in this fixture, so no Shipping & aviation row (it is worked out from it)
    // The footer totals snap directly to their value: All countries is summed from the series (the API sends no per-year totals), Selected from the chosen countries.
    expect(yourFoot()[1][1]).toBe('25,694');
    expect(yourFoot()[0][1]).toBe('25,324');
    // (25324 - 14350) / 14350 * 100 = 76.47...% -> "+76.5%", reproduced client-side from the series.
    expect(yourFoot()[0][3]).toBe('+76.5% since 1990');
    expect(screen.queryByRole('heading', { name: /^Top Movers/ })).not.toBeInTheDocument();
    expect(vi.mocked(api.overview)).toHaveBeenCalledWith(FEATURED);
  });
  it("hands the map the year's values by ISO code, labelled in MtCO₂ (the map's own colours are the design system's)", async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    await screen.findByRole('rowheader', { name: /^Selected · \d+/ });

    const map = screen.getByTestId('choropleth');
    expect(JSON.parse(map.dataset.values!)).toEqual({ CHN: 25324, VNM: 370 });
    expect(map.dataset.valueLabel).toBe('CO₂ emissions, MtCO₂');
    expect(map.dataset.unit).toBe('MtCO₂');
  });

  it('renders the headline sentence (with its "Since 1990" eyebrow), bolding country names and coloring increase/decrease values', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    expect(await screen.findByText('Since 1990')).toBeInTheDocument();
    // The sentence now renders as multiple child nodes (bolded country names, colored values),
    // not one text node -- match on the <p>'s full textContent instead of a single string node.
    const expectedText =
      'Among the top 10 emitters by 2024 output, China has grown the most in absolute terms (+9,806 MtCO₂), while India has the fastest growth rate (+452.5%). ' +
      'United States has stayed comparatively flat (-4.4%), while Germany and Russia show the steepest declines (-45.7%, -29.8%).';
    const paragraph = screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === expectedText);
    expect(paragraph).toBeInTheDocument();

    // Country names are bolded (SPEC.md §5.18.6).
    expect(within(paragraph).getByText('China').tagName).toBe('STRONG');
    expect(within(paragraph).getByText('India').tagName).toBe('STRONG');

    // An increase in emissions (more CO2, bad) is colored NEGATIVE_COLOR; a decrease (good) is
    // colored POSITIVE_COLOR -- the same convention TierSummaryPanel's % Change column uses.
    expect(within(paragraph).getByText('+452.5%')).toHaveStyle({ color: NEGATIVE_COLOR });
    expect(within(paragraph).getByText('-4.4%')).toHaveStyle({ color: POSITIVE_COLOR });

    // The "Since 1990" eyebrow already carries the timeframe -- the sentence itself must not
    // repeat it, or the two collide in the same three lines (reported live).
    expect(screen.queryByText(/since 1990/i, { selector: 'p' })).not.toBeInTheDocument();
  });

  it('fetches world-map-series exactly once, regardless of how many times the selection changes', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(SERIES_CHINA);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    await screen.findByRole('rowheader', { name: /^Selected · \d+/ });

    vi.mocked(api.overview).mockResolvedValue({ ...RESPONSE, selected_country_list: ['Vietnam'] });
    await user.click(screen.getByLabelText('Select countries (up to 10/11)'));
    await user.click(screen.getByRole('option', { name: 'Vietnam' }));
    await screen.findByRole('rowheader', { name: /^Selected · \d+/ }); // re-render settled

    expect(vi.mocked(api.worldMapSeries)).toHaveBeenCalledTimes(1);
  });

  it('renders the Play/Pause control and a year slider bounded to the series range', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    const playButton = within(await mapCard()).getByRole('button', { name: 'Play' });
    expect(playButton).not.toBeDisabled();
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '2023');
    expect(slider).toHaveAttribute('max', '2024');
    expect((slider as HTMLInputElement).value).toBe('2024');
  });

  it('calls toggle when the Play/Pause button is clicked', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    await user.click(within(await mapCard()).getByRole('button', { name: 'Play' }));
    expect(DEFAULT_ANIMATION.toggle).toHaveBeenCalledTimes(1);
  });

  it('keeps Play enabled (and the slider scrubbable) when prefers-reduced-motion is set -- reduced motion stops autoplay, it does not remove the control', async () => {
    vi.mocked(useYearAnimation).mockReturnValue({ ...DEFAULT_ANIMATION, isPlaying: false, reducedMotion: true });
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    expect(within(await mapCard()).getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('slider')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('suppresses the change since 1990 on the animation\'s first frame instead of showing a misleading +0.0%', async () => {
    vi.mocked(useYearAnimation).mockReturnValue({ ...DEFAULT_ANIMATION, currentYear: 2023 });
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    await screen.findByRole('rowheader', { name: /^Selected · \d+/ });
    // Both footer rows suppress their own change.
    expect(tierChanges()).toEqual(['—', '—']);
    expect(screen.queryByText('+0.0% since 1990')).not.toBeInTheDocument();
  });
  it('blocks selecting an 11th country beyond the 10-selection cap', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    await screen.findByRole('rowheader', { name: /^Selected · \d+/ });

    await user.click(screen.getByLabelText('Select countries (up to 10/11)'));
    const vietnamOption = screen.getByRole('option', { name: 'Vietnam' });
    expect(vietnamOption).toHaveAttribute('aria-disabled', 'true');

    await user.click(vietnamOption);
    expect(vi.mocked(api.overview)).not.toHaveBeenCalledWith(expect.arrayContaining(['Vietnam']));
  });

  it('refetches and updates the chosen countries\' row and chart when the selection changes', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(SERIES_CHINA);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    await screen.findByRole('rowheader', { name: /^Selected · \d+/ });

    const updated: OverviewResponse = {
      ...RESPONSE,
      selected: { ...RESPONSE.selected, countries_count: 1, latest_co2_total: 370 },
      selected_country_list: ['Vietnam'],
      fastest_growth: { country: 'Vietnam', co2_1990: 21, co2_latest: 370, absolute_change: 349, pct_change: 1641.5 },
      largest_reduction: { country: 'Vietnam', co2_1990: 21, co2_latest: 370, absolute_change: 349, pct_change: 1641.5 },
    };
    vi.mocked(api.overview).mockResolvedValue(updated);

    // Deselect everything except Vietnam: Clear in the open picker, then add Vietnam from its list.
    await user.click(screen.getByRole('combobox', { name: /^Select countries/ }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('option', { name: 'Vietnam' }));

    // 370 MtCO₂ now comes from WORLD_MAP_SERIES' Vietnam entry at the current frame (year 2024), the only row of the table.
    await waitFor(() => expect(yourBody().map((r) => r[0])).toEqual(['Vietnam']));
    expect(yourBody()[0][1]).toBe('370');
    expect(yourFoot()[0].slice(0, 2)).toEqual(['Selected · 1', '370']);
    expect(vi.mocked(api.overview)).toHaveBeenLastCalledWith(['Vietnam']);
  });
  it('shows a warning in place of the charts when deselecting to 0, and the table keeps its footer rows with a prompt to select countries', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    await screen.findByRole('rowheader', { name: /^Selected · \d+/ });

    await user.click(screen.getByRole('combobox', { name: /^Select countries/ }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    // The heading sits outside the selected.length guard (SPEC.md §5.19, so #by-country is always a real jump target), so By Country renders its own InlineAlert.
    expect(await screen.findAllByText('Select at least one country.')).toHaveLength(1);
    // 0 selected: no country rows, the prompt in their place, and both footer rows still there (the chosen group at 0).
    expect(within(yourTable()).getByText('Select countries to compare them here.')).toBeInTheDocument();
    expect(yourFoot().map((r) => r[0]).slice(0, 2)).toEqual(['Selected · 0', 'All countries · 195']);
    expect(yourBody()).toHaveLength(1); // the prompt's row only
    // headline_movers (SPEC.md §5.18.5) is a fixed top-10-emitters set from the server, completely independent of `selected`: it stays visible.
    expect(await screen.findByText('Since 1990')).toBeInTheDocument();
    // #by-country and the old #pct-change/#percent-change anchors (SPEC.md §5.19) stay real, jumpable DOM targets even with 0 selected.
    expect(document.getElementById('by-country')).not.toBeNull();
    expect(document.getElementById('pct-change')).not.toBeNull();
  });
  it('renders a Jump To nav under the h1 linking to all three sections', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    const links = within(nav).getAllByRole('link');
    // "Climate signal" always leads (the emissions KPIs stand on their own); "Relationship" only joins when the climate data is there.
    expect(links.map((l) => l.textContent)).toEqual(['Climate signal', 'All Countries', 'Share', 'By Country']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['#climate-signal', '#top-emitters', '#share', '#by-country']);
    expect(document.getElementById('top-emitters')).not.toBeNull();
    expect(document.getElementById('map')).not.toBeNull(); // the old anchor still lands on the map
  });

  it('"Reset to default" restores the featured selection and refetches', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    await screen.findByRole('rowheader', { name: /^Selected · \d+/ });

    await user.click(screen.getByRole('combobox', { name: /^Select countries/ }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await screen.findAllByText('Select at least one country.');

    vi.mocked(api.overview).mockClear();
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    await user.click(screen.getByRole('button', { name: 'Reset to default' }));

    expect(await screen.findByRole('rowheader', { name: /^Selected · \d+/ })).toBeInTheDocument();
    expect(vi.mocked(api.overview)).toHaveBeenCalledWith(FEATURED);
  });

  it('renders an inline error instead of crashing when the overview API call fails', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockRejectedValue(new Error('Failed to load data.'));
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
  });

  it('renders an inline error instead of crashing when the world-map-series API call fails', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockRejectedValue(new ApiError(503, 'Failed to load map data.'));
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    expect(await screen.findByText('Failed to load map data.')).toBeInTheDocument();
  });

  it('renders an inline error instead of crashing when listCountries fails', async () => {
    vi.mocked(api.listCountries).mockRejectedValue(new Error('Failed to load data.'));
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
    expect(vi.mocked(api.overview)).not.toHaveBeenCalled();
  });

  it('opens with the countries named in ?countries= as its Selected tier, keeping an explicit empty selection empty', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    const { unmount } = render(<MemoryRouter initialEntries={['/overview?countries=vietnam&countries=Atlantis']}><OverviewPage /></MemoryRouter>);
    await screen.findAllByText('All Countries');
    expect(vi.mocked(api.overview)).toHaveBeenCalledWith(['Vietnam']);
    unmount();
    vi.mocked(api.overview).mockClear();
    render(<MemoryRouter initialEntries={['/overview?countries=']}><OverviewPage /></MemoryRouter>);
    await screen.findAllByText('All Countries');
    expect(await screen.findAllByText('Select at least one country.')).not.toHaveLength(0);
  });

  it('outlines the picker\'s selection on the map via its own outline prop (ISO codes), following ?countries=', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD_MAP_SERIES);
    const { unmount } = render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    await screen.findAllByText('All Countries');
    const map = () => screen.getByTestId('choropleth');
    // Default selection is the 10 featured; only China is in this 2-country fixture series.
    expect(map()).toHaveAttribute('data-outline', '["CHN"]');
    expect(map()).toHaveAttribute('data-outline-label', 'Selected'); // the legend's key for the outline (the caption line is gone)
    unmount();
    render(<MemoryRouter initialEntries={['/overview?countries=vietnam']}><OverviewPage /></MemoryRouter>);
    await screen.findAllByText('All Countries');
    expect(map()).toHaveAttribute('data-outline', '["VNM"]');
  });

  it('offers a Table view of every country for the current year (largest first, "No data" included), and back', async () => {
    realMap.on = true;
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue({ ...WORLD_MAP_SERIES, iso_codes: ['CHN', 'VNM', 'XXX'], countries: ['China', 'Vietnam', 'Nowhere'], values: [[14350, 21, null], [25324, 370, null]] });
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    await screen.findAllByText('All Countries');
    expect(screen.queryByRole('region', { name: 'Table of values' })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Table view' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const table = within(screen.getByRole('region', { name: 'Table of values' })).getByRole('table', { name: /^World map of CO₂ emissions by country, 2023 to 2024, currently showing 2024/ });
    const rows = within(table).getAllByRole('row').slice(1).map((r) => [...r.children].map((c) => c.textContent));
    expect(rows.slice(0, 2)).toEqual([['China', '25,324', '2.5k+'], ['Vietnam', '370', '250–500']]); // countries with a value, largest first, each with the band it is in
    const noData = rows.slice(2); // then every other country on the map, by name, so a missing value is stated and not silently absent
    expect(noData.length).toBeGreaterThan(100);
    expect(noData.every(([, value]) => value === 'No data')).toBe(true);
    expect(noData.map(([name]) => name)).toEqual([...noData.map(([name]) => name)].sort((a, b) => a!.localeCompare(b!)));

    await user.click(toggle);
    expect(screen.queryByRole('region', { name: 'Table of values' })).not.toBeInTheDocument();
  });
});


// ---------------------------------------------------------------- Area 2: climate signal

// Two years only, as above; the climate series add 1970-style context via the same fixture.
const LONG_MAP: WorldMapTimeSeries = {
  iso_codes: ['CHN', 'VNM'], countries: ['China', 'Vietnam'], years: [1970, 1990, 2023, 2024],
  values: [[800, 5], [2400, 20], [14350, 21], [25324, 370]], value_range: [5, 25324],
};

function mountWithClimate() {
  vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
  vi.mocked(api.overview).mockResolvedValue(RESPONSE);
  vi.mocked(api.worldMapSeries).mockResolvedValue(LONG_MAP);
  vi.mocked(api.correlationEmissionsTemperature).mockResolvedValue(PAIR);
  vi.mocked(api.correlationTemperature).mockImplementation(async (o) => (o?.view === 'mean5y' ? TEMPERATURE_MEAN5Y : TEMPERATURE));
  vi.mocked(api.correlationConcentration).mockResolvedValue(CONCENTRATION);
  return render(
    <MemoryRouter>
      <div data-testid="shell-bar" data-syn-sticky="top" style={{ position: 'sticky' }} />
      <div id="content"><OverviewPage /></div>
    </MemoryRouter>,
  );
}

describe('OverviewPage — climate signal', () => {
  it('has the #climate-signal and #relationship anchors the Landing CTA and the jump links point at, in order, with the jump links first', async () => {
    mountWithClimate();
    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    expect(within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['#climate-signal', '#relationship', '#top-emitters', '#share', '#by-country']);
    expect(CLIMATE_SIGNAL_ANCHOR).toBe('climate-signal'); // the Landing's primary CTA is /overview#climate-signal
    expect(document.getElementById(CLIMATE_SIGNAL_ANCHOR)).not.toBeNull();
    expect(document.getElementById(RELATIONSHIP_ANCHOR)).not.toBeNull();
    const ids = ['climate-signal', 'relationship', 'top-emitters', 'share', 'by-country'].map((id) => document.getElementById(id)!);
    ids.slice(1).forEach((el, i) => expect(ids[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
    // sticks to the top while scrolling
    expect((nav.closest('[style*="position: sticky"]') as HTMLElement).style.position).toBe('sticky');
  });

  it('shows the four KPI cards with figures from the API, each at its own year', async () => {
    mountWithClimate();
    const section = (await screen.findByRole('region', { name: 'What is happening globally' }));
    expect(within(section).getByText('CO₂ emissions · 2024')).toBeInTheDocument();
    expect(within(section).getByText('37,406')).toBeInTheDocument();
    expect(within(section).getByText('Change since baseline')).toBeInTheDocument();
    expect(within(section).getByText('168.6')).toBeInTheDocument(); // 100 + 68.6
    expect(within(section).getByText('+68.6% · 1990 = 100')).toBeInTheDocument();
    expect(within(section).getByText('Atmospheric CO₂ · 2024')).toBeInTheDocument();
    expect(within(section).getByText('424.6')).toBeInTheDocument();
    expect(within(section).getByText('+48.0% vs pre-industrial (1850)')).toBeInTheDocument(); // 424.6 / 286.8
    expect(within(section).getByText('Temperature anomaly · 2024')).toBeInTheDocument();
    expect(within(section).getByText('+1.62 °C')).toBeInTheDocument();
    expect(within(section).getByText('5-year mean 1.39 °C')).toBeInTheDocument();
  });

  it('every KPI carries its baseline as a chip and the full baseline detail behind the ⓘ (requirements §2.5)', async () => {
    mountWithClimate();
    const section = await screen.findByRole('region', { name: 'What is happening globally' });
    expect(within(section).getAllByText(/^Baseline /).length).toBeGreaterThanOrEqual(4);
    expect(within(section).getByText('Baseline 1850–1900 · Berkeley Earth')).toBeInTheDocument();
    const info = within(section).getByRole('button', { name: 'Baseline details: Change since baseline' });
    fireEvent.click(info);
    const panel = within(section).getByRole('region', { name: 'Baseline for Change since baseline' });
    for (const text of ['1990 = 100', 'World total in 1990', 'value ÷ value1990 × 100', 'OWID, 1970–2024', 'None']) expect(panel).toHaveTextContent(text);
    fireEvent.click(within(section).getByRole('button', { name: 'Baseline details: Temperature anomaly · 2024' }));
    expect(within(section).getByRole('region', { name: 'Baseline for Temperature anomaly · 2024' })).toHaveTextContent(/vintage 2025-01-10/);
  });

  it('shows the emissions and temperature over time on two axes, with no scatter toggle and no "Why emissions matter" card (Climate Correlation owns both)', async () => {
    mountWithClimate();
    const section = await screen.findByRole('region', { name: 'Why the trend matters' });
    expect(within(section).getByRole('heading', { level: 3, name: 'CO₂ emissions and temperature anomaly, 1970–2024' })).toBeInTheDocument();
    const chart = within(section).getByTestId('chart');
    expect(chart).toHaveAttribute('data-axes', JSON.stringify(['y', 'y2'])); // emissions on the left axis, temperature on the right
    expect(within(section).getByText(/^Purpose:/)).toBeInTheDocument();
    expect(within(section).getByText(/Long-term co-movement, shown as context. No single factor or year explains warming./)).toBeInTheDocument();
    // The only baselined series is the temperature anomaly (1850–1900); the window is in the title.
    expect(within(section).getByText('Baseline 1850–1900 · Berkeley Earth')).toBeInTheDocument();
    expect(within(section).queryByRole('radio', { name: 'Against cumulative CO₂' })).not.toBeInTheDocument();
    expect(within(section).queryByRole('img', { name: /scatter chart/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Why emissions matter' })).not.toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'see the relationship on Climate Correlation →' })).toHaveAttribute('href', '/climate-correlation');
  });
  it('states the percent formula of the concentration card in full, including the × 100%', async () => {
    mountWithClimate();
    const section = await screen.findByRole('region', { name: 'What is happening globally' });
    fireEvent.click(within(section).getByRole('button', { name: 'Baseline details: Atmospheric CO₂ · 2024' }));
    expect(within(section).getByRole('region', { name: 'Baseline for Atmospheric CO₂ · 2024' })).toHaveTextContent('(ppm ÷ ppm₁₈₅₀ − 1) × 100%');
  });

 it('states the sources, the not-a-climate-model note and the Berkeley vintage caveat behind "Sources & method"', async () => {
    mountWithClimate();
    const section = await screen.findByRole('region', { name: 'Why the trend matters' });
    expect(within(section).getByText('Sources & method')).toBeInTheDocument();
    expect(within(section).getByText(/not a climate model/i)).toBeInTheDocument();
    expect(within(section).getByText(/vintage 2025-01-10/)).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Full methodology →' })).toHaveAttribute('href', '/about#correlation');
  });

  it('leaves the climate cards, the relationship section and its jump link out when the climate data fails, never showing zeros', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(LONG_MAP);
    vi.mocked(api.correlationEmissionsTemperature).mockRejectedValue(new ApiError(503, 'climate data missing'));
    vi.mocked(api.correlationTemperature).mockResolvedValue(TEMPERATURE);
    vi.mocked(api.correlationConcentration).mockResolvedValue(CONCENTRATION);
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    const section = await screen.findByRole('region', { name: 'What is happening globally' });
    expect(within(section).getByText('CO₂ emissions · 2024')).toBeInTheDocument(); // the emissions cards stand alone
    expect(within(section).getByText('Change since baseline')).toBeInTheDocument();
    expect(within(section).queryByText(/Atmospheric CO₂/)).not.toBeInTheDocument();
    expect(within(section).queryByText(/Temperature anomaly/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Why the trend matters' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'On this page' })).queryByRole('link', { name: 'Relationship' })).not.toBeInTheDocument();
  });

  it('does not hold the page back indefinitely when the climate request stalls: renders after a bound, and shows the climate parts if they arrive late', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
      vi.mocked(api.overview).mockResolvedValue(RESPONSE);
      vi.mocked(api.worldMapSeries).mockResolvedValue(LONG_MAP);
      let late: (v: typeof PAIR) => void = () => {};
      vi.mocked(api.correlationEmissionsTemperature).mockReturnValue(new Promise((r) => { late = r; }));
      vi.mocked(api.correlationTemperature).mockResolvedValue(TEMPERATURE);
      vi.mocked(api.correlationConcentration).mockResolvedValue(CONCENTRATION);
      render(<MemoryRouter><OverviewPage /></MemoryRouter>);
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(screen.queryByRole('heading', { level: 1, name: 'Overview' })).not.toBeInTheDocument(); // still within the bound
      await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
      expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Why the trend matters' })).not.toBeInTheDocument();
      await act(async () => { late(PAIR); await vi.advanceTimersByTimeAsync(100); });
      expect(screen.getByRole('region', { name: 'Why the trend matters' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});


describe('OverviewPage — deep links', () => {
  afterEach(() => { window.history.replaceState(null, '', '/'); scrollSpy.mockClear(); });

  it('a #relationship deep link waits for the climate request to finish, then jumps once the section exists -- also when the answer comes late', async () => {
    window.history.replaceState(null, '', '/overview#relationship');
    vi.useFakeTimers();
    try {
      vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
      vi.mocked(api.overview).mockResolvedValue(RESPONSE);
      vi.mocked(api.worldMapSeries).mockResolvedValue(LONG_MAP);
      let late: (v: typeof PAIR) => void = () => {};
      vi.mocked(api.correlationEmissionsTemperature).mockReturnValue(new Promise((r) => { late = r; }));
      vi.mocked(api.correlationTemperature).mockImplementation(async (o) => (o?.view === 'mean5y' ? TEMPERATURE_MEAN5Y : TEMPERATURE));
      vi.mocked(api.correlationConcentration).mockResolvedValue(CONCENTRATION);
      render(<MemoryRouter initialEntries={['/overview#relationship']}><OverviewPage /></MemoryRouter>);
      await act(async () => { await vi.advanceTimersByTimeAsync(100); }); // the data round trips
      await act(async () => { await vi.advanceTimersByTimeAsync(3200); }); // past the wait bound
      expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument(); // the page rendered at the bound...
      expect(document.getElementById('relationship')).toBeNull();
      expect(scrollSpy).not.toHaveBeenCalled(); // ...but the jump is not spent on a target that is not there yet
      await act(async () => { late(PAIR); await vi.advanceTimersByTimeAsync(100); });
      expect(document.getElementById('relationship')).not.toBeNull();
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy).toHaveBeenCalledWith('relationship');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a #pathways deep link waits for the scenario request, then jumps once the section exists', async () => {
    window.history.replaceState(null, '', '/overview#pathways');
    let answer!: (r: typeof SCENARIO_TEMPERATURE) => void;
    vi.mocked(api.correlationScenarioTemperature).mockReturnValue(new Promise((r) => { answer = r; }));
    try {
      mountFullRange(2024, '#pathways');
      await screen.findByRole('heading', { level: 1, name: 'Overview' });
      await new Promise((r) => setTimeout(r, 50));
      expect(scrollSpy).not.toHaveBeenCalled(); // the target does not exist yet
      expect(document.getElementById('pathways')).toBeNull();
      await act(async () => answer(SCENARIO_TEMPERATURE));
      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith('pathways'));
      expect(document.getElementById('pathways')).not.toBeNull();
      expect(scrollSpy).toHaveBeenCalledTimes(1);
    } finally {
      scrollSpy.mockReset();
    }
  });

  it('a #pathways deep link still jumps (to nothing) when the scenario request fails, instead of waiting forever', async () => {
    window.history.replaceState(null, '', '/overview#pathways');
    mountFullRange(2024, '#pathways'); // the default mock rejects
    await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith('pathways'));
    scrollSpy.mockReset();
  });

  it('a deep link scrolls only after the sticky row has been measured, so the first scroll clears a wrapped Year control', async () => {
    window.history.replaceState(null, '', '/overview#share');
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: barOrRowHeight(this, 90) } as DOMRect;
    });
    let marginAtJump = '';
    scrollSpy.mockImplementation(() => { marginAtJump = document.querySelector('.overview-page style')?.textContent ?? ''; });
    try {
      mountWithClimate();
      await screen.findByRole('navigation', { name: 'On this page' });
      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith('share'));
      expect(marginAtJump).toMatch(/scroll-margin-top: 168px/); // the measured 90 px row, not the 52 px fallback (which would be 120)
    } finally {
      rect.mockRestore();
      scrollSpy.mockReset();
    }
  });

  it('any other deep link (#map) jumps as soon as the page has rendered, without waiting for a stalled climate request', async () => {
    window.history.replaceState(null, '', '/overview#map');
    vi.useFakeTimers();
    try {
      vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
      vi.mocked(api.overview).mockResolvedValue(RESPONSE);
      vi.mocked(api.worldMapSeries).mockResolvedValue(LONG_MAP);
      vi.mocked(api.correlationEmissionsTemperature).mockReturnValue(new Promise(() => {}));
      vi.mocked(api.correlationTemperature).mockResolvedValue(TEMPERATURE);
      vi.mocked(api.correlationConcentration).mockResolvedValue(CONCENTRATION);
      render(<MemoryRouter initialEntries={['/overview#map']}><OverviewPage /></MemoryRouter>);
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      await act(async () => { await vi.advanceTimersByTimeAsync(3200); });
      expect(scrollSpy).toHaveBeenCalledWith('map');
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts the sticky anchor row below the pinned header and offsets every jump target by the header plus the row', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: barOrRowHeight(this, 0) } as DOMRect; // the row not yet measured: the one-line fallback applies
    });
    try {
      mountWithClimate();
      const nav = await screen.findByRole('navigation', { name: 'On this page' });
      await vi.waitFor(() => expect((nav.closest('[style*="position: sticky"]') as HTMLElement).style.top).toBe('68px'));
      expect(document.querySelector('.overview-page style')?.textContent).toMatch(/scroll-margin-top: 120px/); // 68 header + 52 one-line row
    } finally {
      rect.mockRestore();
    }
  });

  it('offsets jump targets by the sticky row\'s measured height, so a wrapped row (Year control on a second line) is cleared too', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: barOrRowHeight(this, 90) } as DOMRect;
    });
    mountWithClimate();
    await screen.findByRole('navigation', { name: 'On this page' });
    await vi.waitFor(() => expect(document.querySelector('.overview-page style')?.textContent).toMatch(/scroll-margin-top: 168px/)); // 68 header + 90 row + 10 gap
    rect.mockRestore();
  });
});


// ---------------------------------------------------------------- Area 2: map 1970-2024, decade stops, ppm card

// A contiguous 1970-2024 series (the real shape): China grows 800 -> 25,324 Mt, Vietnam 5 -> 370.
const FULL_MAP: WorldMapTimeSeries = (() => {
  const years = Array.from({ length: 55 }, (_, i) => 1970 + i);
  return {
    iso_codes: ['CHN', 'VNM'], countries: ['China', 'Vietnam'], years,
    values: years.map((y) => [800 + (y - 1970) * ((25324 - 800) / 54), 5 + (y - 1970) * ((370 - 5) / 54)]),
    value_range: [5, 25324],
  };
})();
const chinaAt = (y: number) => 800 + (y - 1970) * ((25324 - 800) / 54);
const vietnamAt = (y: number) => 5 + (y - 1970) * ((370 - 5) / 54);
const fmt0 = (n: number) => Math.round(n).toLocaleString('en-US');

const FULL_RESPONSE: OverviewResponse = {
  ...RESPONSE,
  selected_country_list: ['China'],
};
// The shell's pinned bar (68px) sits outside the canvas; the page's own pinned row inside it (a stand-in for both, measured through getBoundingClientRect).
const barOrRowHeight = (el: HTMLElement, row: number) => (el.dataset.testid === 'shell-bar' ? 68 : el.style.position === 'sticky' ? row : 0);
// "Your countries" is one real table: the chosen countries (biggest first in the map's year), then two footer rows (the chosen group and all countries).
const yourTable = () => screen.getByRole('table', { name: /^The countries you chose/ }) as HTMLTableElement;
const cellsOf = (rows: Iterable<HTMLTableRowElement>) => [...rows].map((r) => [...r.cells].map((c) => (c.textContent ?? '').replace('ⓘ', '').trim()));
const yourBody = () => cellsOf(yourTable().tBodies[0].rows);
const yourFoot = () => cellsOf(yourTable().tFoot!.rows);
const yourHeads = () => within(yourTable()).getAllByRole('columnheader').map((h) => h.textContent);
// The change since the baseline in each footer row (Selected, then All countries), without its "since 1990".
const tierChanges = () => yourFoot().slice(0, 2).map((r) => r[3].replace(/ since \d{4}$/, ''));
const mapSide = () => document.querySelector('.overview-hero-right') as HTMLElement;

// The all-countries snapshot at the last year before the series (1969): cumulative Mt per ISO3 country, recorded from 1750.
const BASE_MT = { CHN: 100_000, VNM: 200 };
const SHARE_SNAPSHOT = {
  schema_version: 1, generated_at: null, note: '', caveats: [], attribution: [], source_vintage: null, name: 'n', method: 'm', source: 'owid_co2', gas_scope: 'co2', label: 'l',
  unit: 'Mt CO2', mode: 'ranking', year: 1969, limit: null, start_year: null, end_year: null, coverage: [1850, 2024], cumulative_from: 1750, total_cumulative_mt: 100_200, annual_total_mt: 1,
  rows: [
    { rank: 1, country: 'CHN', name: 'China', cumulative_mt: BASE_MT.CHN, share_pct: 99.8, annual_mt: 1, annual_share_pct: 50 },
    { rank: 2, country: 'VNM', name: 'Vietnam', cumulative_mt: BASE_MT.VNM, share_pct: 0.2, annual_mt: 1, annual_share_pct: 50 },
  ],
  series: [], denominator: null, reconciliation: null, details: {}, notes: [],
} as CorrelationCountryShareResponse;
const CUM = buildCumulative(FULL_MAP, BASE_MT) as number[][]; // Gt, [yearIdx][country] (both countries in the fixture have history, so no nulls)
const gt = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US'));
// Every share of the world total is of the WORLD total, which holds more than the countries (international aviation and shipping). In this fixture the World
// is 20% above the two countries, so a country's share is smaller than its share of their sum.
const WORLD_OVER_COUNTRIES = 1.2;
const WORLD_SERIES = {
  ...SHARE_SNAPSHOT, mode: 'series', year: null, start_year: 1970, rows: [],
  remainder_series: Array.from({ length: 55 }, (_, i) => {
    const world_cumulative_mt = (CUM[i][0] + CUM[i][1]) * 1000 * WORLD_OVER_COUNTRIES;
    const world_annual_mt = (chinaAt(1970 + i) + vietnamAt(1970 + i)) * WORLD_OVER_COUNTRIES;
    return { year: 1970 + i, world_cumulative_mt, world_annual_mt, cumulative_mt: world_cumulative_mt * 0.1667, share_pct: 16.67, annual_mt: world_annual_mt * 0.1667, annual_share_pct: 16.67, international_transport_cumulative_mt: null, international_transport_annual_mt: null };
  }),
} as unknown as CorrelationCountryShareResponse;
const showCumulative = async () => {
  await screen.findByRole('heading', { level: 1, name: 'Overview' });
  fireEvent.click(await screen.findByRole('radio', { name: 'Cumulative' }));
};

function mountFullRange(currentYear: number, hash = '') {
  vi.mocked(useYearAnimation).mockReturnValue({ ...DEFAULT_ANIMATION, currentYear });
  vi.mocked(api.listCountries).mockResolvedValue({ featured: ['China'], expanded: ['China', 'Vietnam'] });
  vi.mocked(api.overview).mockResolvedValue(FULL_RESPONSE);
  vi.mocked(api.worldMapSeries).mockResolvedValue(FULL_MAP);
  vi.mocked(api.correlationEmissionsTemperature).mockResolvedValue(PAIR);
  vi.mocked(api.correlationTemperature).mockImplementation(async (o) => (o?.view === 'mean5y' ? TEMPERATURE_MEAN5Y : TEMPERATURE));
  vi.mocked(api.correlationConcentration).mockResolvedValue(CONCENTRATION);
  // The page asks for the all-countries snapshot (cumulative base) and, as a series, for the World totals per year
  vi.mocked(api.correlationCountryShare).mockImplementation(async (o) => (o?.countries ? WORLD_SERIES : SHARE_SNAPSHOT));
  return render(<MemoryRouter initialEntries={[`/overview?countries=China${hash}`]}><OverviewPage /></MemoryRouter>);
}

describe('OverviewPage — map 1970–2024 with decade stops', () => {
  it('labels the "Since 1990" headline as a fixed comparison that does not follow the map\'s year, at every stop', async () => {
    mountFullRange(1980);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(within(mapSide()).getByText('Fixed comparison, 1990 to 2024; the map and the table follow the map\'s year.')).toBeInTheDocument();
    // while the table is on the historical frame
    expect(within(mapSide()).getByRole('heading', { name: 'Your countries · 1980' })).toBeInTheDocument();
  });
  it('asks for the 1970 range, plays it in decade stops (~1.75 s each) and spans 1970 to 2024', async () => {
    mountFullRange(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(api.worldMapSeries).toHaveBeenCalledWith(1970);
    const options = vi.mocked(useYearAnimation).mock.calls.at(-1)![0];
    expect(options).toMatchObject({ minYear: 1970, maxYear: 2024, stepYears: 10, intervalMs: 1750, autoplay: false });
    expect(screen.getByRole('slider')).toHaveAttribute('min', '1970');
    expect(screen.getByRole('slider')).toHaveAttribute('max', '2024');
  });

  it('By Country follows the page year, with a year badge; Top Movers and % Change are not here any more, only a link on to Historical Trends', async () => {
    mountFullRange(2000);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    // By Country: the chart is titled and drawn for the page year; the map has its own title
    expect(screen.getAllByText('CO₂ Emissions by Country (2000)')).toHaveLength(1);
    expect(screen.getByText('Where emissions come from, 2000')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Bar chart of total CO₂ emissions in 2000 for 1 countries/)).toBeInTheDocument();
    const h = screen.getByRole('heading', { level: 2, name: /^By Country/ });
    // "Year" is visually hidden text inside the badge (not an aria-label), so the heading reads "… Year 2000"
    // ...with a space before "Year", not "By CountryYear 2000"
    expect(h.textContent).toMatch(/\S Year 2000$/);
    expect(screen.queryByRole('heading', { name: /^Top Movers/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^% Change Since 1990/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Fastest Growth — China')).not.toBeInTheDocument();
    // the line on to the page that owns them carries the selection
    const link = screen.getByRole('link', { name: 'Top movers and % change since 1990 → Historical Trends' });
    expect(link).toHaveAttribute('href', '/historical?countries=China&year=2000#top-movers'); // the page year rides along unless it is the latest
    expect(document.getElementById('percent-change')).toContainElement(link); // bookmarked #percent-change / #pct-change links still land beside it
  });

  it('links on to Historical Trends with an explicitly empty selection when nothing is selected, not the defaults', async () => {
    mountFullRange(2024); // sets every mock; then open the page again on an explicitly empty selection
    cleanup();
    render(<MemoryRouter initialEntries={['/overview?countries=']}><OverviewPage /></MemoryRouter>);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    const link = await screen.findByRole('link', { name: 'Top movers and % change since 1990 → Historical Trends' });
    expect(link).toHaveAttribute('href', '/historical?countries=#top-movers');
  });

  it('keeps By Country for years up to 1990, with nothing about a baseline to explain', async () => {
    for (const year of [1990, 1980]) {
      cleanup();
      mountFullRange(year);
      await screen.findByRole('heading', { level: 1, name: 'Overview' });
      expect(screen.queryByText(/The baseline is 1990/)).not.toBeInTheDocument();
      expect(screen.getAllByText(`CO₂ Emissions by Country (${year})`)).toHaveLength(1);
    }
  });

  it('closes the page with one line on the pathways and links on, with the illustrative label and no jump link', async () => {
    vi.mocked(api.correlationScenarioTemperature).mockResolvedValue(SCENARIO_TEMPERATURE);
    mountFullRange(2024);
    const section = await screen.findByRole('region', { name: "Where today's patterns lead" });
    expect(section.id).toBe('pathways');
    expect(within(section).getByText('Illustrative')).toBeInTheDocument();
    expect(section).toHaveTextContent(/By 2040 the three pathways imply 1\.67–1\.78 °C/); // the lowest and highest implied level, from the scenario output
    expect(within(section).queryByText(/Mt a year/)).not.toBeInTheDocument(); // the per-pathway cards live on Scenario Comparison
    expect(within(section).getByRole('link', { name: 'Forecasts to 2043 →' })).toHaveAttribute('href', '/forecasts');
    expect(within(section).getByRole('link', { name: 'compare them on Scenario Comparison →' })).toHaveAttribute('href', '/scenarios');
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(nav).queryByRole('link', { name: 'Pathways' })).not.toBeInTheDocument(); // one line now, not a section of the anchor row
    // it sits after the By Country section
    expect(document.getElementById('by-country')!.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('omits the Pathways section and its jump link when the scenario output is unavailable, and keeps the old #pct-change id', async () => {
    mountFullRange(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(screen.queryByRole('region', { name: "Where today's patterns lead" })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'On this page' })).queryByRole('link', { name: 'Pathways' })).not.toBeInTheDocument();
    expect(document.getElementById('percent-change')).not.toBeNull();
    expect(document.getElementById('pct-change')).not.toBeNull(); // bookmarked links still land
  });

  it('has no Year select or Play in the page header any more: the year is the map\'s (Play, stops and slider); Replay stays in the Share section (its own tests)', async () => {
    mountFullRange(2010);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(screen.queryByRole('group', { name: 'Page year' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Page year' })).not.toBeInTheDocument();
    // the only Play left is the map's, and it still moves the page's one year
    const plays = screen.getAllByRole('button', { name: 'Play' });
    expect(plays).toHaveLength(1);
    expect(document.querySelector('.overview-map-card')).toContainElement(plays[0]);
    fireEvent.click(plays[0]);
    expect(DEFAULT_ANIMATION.toggle).toHaveBeenCalledTimes(1);
  });

  it('shows a button per decade stop -- 1970 … 2020 and the latest year -- with the current one pressed, and a click seeks to it', async () => {
    mountFullRange(2024);
    const group = await screen.findByRole('group', { name: 'Jump to a year' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['1970', '1980', '1990', '2000', '2010', '2020', '2024']);
    expect(within(group).getByRole('button', { name: '2024' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: '1990' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(within(group).getByRole('button', { name: '1980' }));
    expect(DEFAULT_ANIMATION.seek).toHaveBeenCalledWith(1980);
    expect(screen.queryByText('or drag the year slider, year by year')).not.toBeInTheDocument(); // the row is stops only
  });

  it('before 1990 the footer totals are summed from the series itself and the "since 1990" change is suppressed; from 1990 the API totals are used', async () => {
    mountFullRange(1980);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    const all1980 = chinaAt(1980) + vietnamAt(1980);
    expect(yourFoot()[1][1]).toBe(fmt0(all1980)); // All countries, client-side
    expect(yourFoot()[0][1]).toBe(fmt0(chinaAt(1980))); // Selected = China
    expect(tierChanges()).toEqual(['—', '—']); // no change figure before the baseline, for any row
  });
  it('at 1990 the footer totals sum the series and the change is still suppressed (the baseline)', async () => {
    mountFullRange(1990, '&countries=Vietnam');
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(yourFoot().slice(0, 2).map((r) => r[1])).toEqual([fmt0(chinaAt(1990) + vietnamAt(1990)), fmt0(chinaAt(1990) + vietnamAt(1990))]); // both countries chosen: Selected equals All countries here
    expect(tierChanges()).toEqual(['—', '—']);
  });
  it('after 1990 the change is measured against the 1990 baseline, not the 1970 start', async () => {
    mountFullRange(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    // Selected (China) against its own 1990; All countries (both here): the 2024 sum against the 1990 sum, not against 1970's.
    const chinaChange = ((chinaAt(2024) - chinaAt(1990)) / chinaAt(1990)) * 100;
    const bothChange = (((chinaAt(2024) + vietnamAt(2024)) - (chinaAt(1990) + vietnamAt(1990))) / (chinaAt(1990) + vietnamAt(1990))) * 100;
    expect(tierChanges()).toEqual([`+${chinaChange.toFixed(1)}%`, `+${bothChange.toFixed(1)}%`]);
  });
});

describe('OverviewPage — the map tab\'s columns', () => {
  it('has no Atmospheric CO₂ card on the All Countries tab', async () => {
    mountFullRange(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(screen.queryByText(/^Atmospheric CO₂ · 2024/, { selector: '.overview-hero-right *, .overview-hero-left *' })).not.toBeInTheDocument();
    expect(within(mapSide()).queryByText(/Atmospheric CO₂/)).not.toBeInTheDocument();
  });

  it('keeps the page\'s order from the map down: map, the Since summary, then the Your countries table (this is also the stacked order on a phone)', async () => {
    mountFullRange(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    const card = document.querySelector('.overview-map-card') as HTMLElement;
    const summary = screen.getByText(/^Fixed comparison, 1990 to 2024/).closest('div') as HTMLElement;
    const table = screen.getByRole('region', { name: 'Your countries · 2024' });
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(card, summary)).toBe(true);
    expect(follows(summary, table)).toBe(true);
    // Leading emitters, Changed band and the tier cards are gone: the table replaces them.
    expect(screen.queryByRole('region', { name: /^Leading emitters/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Changed band since/ })).not.toBeInTheDocument();
  });
  it('heads the right column with the summary, then the table, and leaves the map card alone in the left', async () => {
    mountFullRange(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    const column = mapSide();
    const kids = [...column.children];
    expect(kids[0].textContent).toMatch(/^Since 1990/);
    expect(kids[1]).toBe(screen.getByRole('region', { name: 'Your countries · 2024' }));
    expect(column.style.minWidth).toBe('0px'); // may shrink below its content (a 320px page)
    expect(document.querySelector('.overview-hero-left')).toBeNull();
  });
});


// ---------------------------------------------------------------- Area 2: Absolute / Cumulative map, leading emitters (Phase 2.6)

describe('OverviewPage — Absolute / Cumulative map', () => {
  it('starts Absolute, with Cumulative offered once its base snapshot has loaded (requested for the last year before the map\'s range, for every country)', async () => {
    mountFullRange(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(api.correlationCountryShare).toHaveBeenCalledWith({ year: 1969, allCountries: true });
    expect(screen.getByRole('radio', { name: 'Absolute' })).toBeChecked();
    expect(await screen.findByRole('radio', { name: 'Cumulative' })).not.toBeDisabled();
    expect(screen.queryByText('Annual MtCO₂')).not.toBeInTheDocument(); // the legend's label says it; the card keeps no support line
  });

  it('switches the map to running totals: its own title, unit, colour bar and frame values (GtCO₂), and back', async () => {
    mountFullRange(2024);
    await showCumulative();
    const map = screen.getByTestId('choropleth');
    expect(map).toHaveAttribute('data-value-label', 'Cumulative CO₂, GtCO₂');
    expect(map).toHaveAttribute('data-unit', 'GtCO₂');
    // everything on the card is in GtCO₂ in Cumulative: the map layer carries the running totals in Gt, by ISO code
    const values = JSON.parse(map.getAttribute('data-values')!) as Record<string, number>;
    ['CHN', 'VNM'].forEach((iso, i) => expect(values[iso]).toBeCloseTo(CUM[2024 - 1970][i], 6));
    expect(screen.getByText('All CO₂ emitted to 2024, by country')).toBeInTheDocument();
    expect(screen.queryByText(/^Running total, MtCO₂ emitted/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Absolute' }));
    expect(screen.getByText('Where emissions come from, 2024')).toBeInTheDocument();
    expect(screen.getByTestId('choropleth')).toHaveAttribute('data-value-label', 'CO₂ emissions, MtCO₂');
  });

  it('the map\'s accessible label describes the cumulative view, not the annual one, and no caption line is left under the map', async () => {
    mountFullRange(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    // Absolute
    expect(screen.getByLabelText(/^World map of CO₂ emissions by country, 1970 to 2024, currently showing 2024, coloured in 8 bands from pale yellow \(lowest\) to dark red \(highest\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/countries with no data for the year are hatched$/)).toBeInTheDocument();
    expect(screen.queryByText(/^Hatched:/)).not.toBeInTheDocument(); // the legend's No data swatch and Selected key replace the caption
    // Cumulative: the period each value covers is stated, apart from the 1970–2024 frame range
    fireEvent.click(await screen.findByRole('radio', { name: 'Cumulative' }));
    expect(screen.getByLabelText(/^World map of cumulative CO₂ emissions by country: the running total emitted since 1750, currently showing 2024/)).toBeInTheDocument();
    expect(screen.getByLabelText(/countries with no CO₂ ever recorded are hatched$/)).toBeInTheDocument();
    expect(screen.queryByText(/^Hatched:/)).not.toBeInTheDocument();
  });

  it('counts every country with a value in a band, drawn or not: the bands add up to the All Countries tier\'s countries', async () => {
    realMap.on = true;
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    // three countries with a value, one of them (ZZZ) with no shape on the map; one without a value
    vi.mocked(api.worldMapSeries).mockResolvedValue({ ...WORLD_MAP_SERIES, iso_codes: ['CHN', 'VNM', 'ZZZ', 'XXX'], countries: ['China', 'Vietnam', 'Zedland', 'Nowhere'], values: [[14350, 21, 7, null], [25324, 370, 0.4, null]] });
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    const legend = await screen.findByRole('list', { name: /in 8 bands from lowest to highest/ });
    const counts = within(legend).getAllByText(/^\d+$/).map((e) => Number(e.textContent)); // bare numbers, one lead-in after the legend's label
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(counts[0]).toBe(1); // Zedland, 0.4 Mt: <1
    expect(screen.getByText(/· countries per band below$/)).toBeInTheDocument();
  });
  it('adds up: the bands\' counts plus the no-data count are the All Countries tier\'s countries (hidden at 0)', async () => {
    realMap.on = true;
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    // the tier says 5 countries; 3 have a value in 2024 (one of them with no shape on the map), 2 do not
    vi.mocked(api.overview).mockResolvedValue({ ...RESPONSE, all_countries: { ...RESPONSE.all_countries, countries_count: 5 } });
    vi.mocked(api.worldMapSeries).mockResolvedValue({ ...WORLD_MAP_SERIES, iso_codes: ['CHN', 'VNM', 'ZZZ', 'XXX', 'YYY'], countries: ['China', 'Vietnam', 'Zedland', 'Nowhere', 'Neverland'], values: [[14350, 21, 7, null, null], [25324, 370, 0.4, null, null]] });
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    const legend = await screen.findByRole('list', { name: /in 8 bands from lowest to highest/ });
    const bands = within(legend).getAllByText(/^\d+$/).map((e) => Number(e.textContent)).reduce((a, b) => a + b, 0);
    const noData = Number(screen.getByText(/^No data · \d+ countries$/, { selector: 'span' }).textContent!.match(/\d+/)![0]);
    expect(bands).toBe(3);
    expect(noData).toBe(2);
    expect(bands + noData).toBe(5);
  });
  it('passes the no-data count to the map, 0 when every country has a value', async () => {
    mountFullRange(2024);
    const map = await screen.findByTestId('choropleth');
    expect(map.getAttribute('data-no-data-count')).not.toBeNull();
    expect(Number(map.getAttribute('data-no-data-count'))).toBeGreaterThanOrEqual(0);
  });

  it('asks the legend for a Selected key, and the real legend writes "No data · n countries" beside it', async () => {
    mountFullRange(2024);
    expect(await screen.findByTestId('choropleth')).toHaveAttribute('data-outline-label', 'Selected');
  });

  it('writes the no-data count beside the hatched swatch and the Selected key beside it, with no caption line', async () => {
    realMap.on = true;
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue({ ...RESPONSE, all_countries: { ...RESPONSE.all_countries, countries_count: 5 } });
    vi.mocked(api.worldMapSeries).mockResolvedValue({ ...WORLD_MAP_SERIES, iso_codes: ['CHN', 'VNM', 'ZZZ', 'XXX', 'YYY'], countries: ['China', 'Vietnam', 'Zedland', 'Nowhere', 'Neverland'], values: [[14350, 21, 7, null, null], [25324, 370, 0.4, null, null]] });
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    expect(await screen.findByText('No data · 2 countries')).toBeInTheDocument();
    expect(screen.getByText('Selected', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText(/Outlined: your selected countries/)).not.toBeInTheDocument();
  });

  it('keeps the year slider named "Year" for assistive technology while its label is not drawn', async () => {
    mountFullRange(2024);
    await screen.findByTestId('choropleth');
    const slider = screen.getByRole('slider', { name: 'Year' });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAccessibleName('Year');
    // the label is read out, not drawn: it is not in the visible flow
    expect(document.querySelector('.overview-map-card label[for]')?.textContent).toBe('Year');
  });

  it('puts the map\'s controls over its corner from desktop width up, and under the legend on a phone or a portrait tablet', async () => {
    const real = window.matchMedia;
    const stub = (matches: boolean) => { window.matchMedia = ((q: string) => ({ matches: matches && q.includes('min-width: 1024px'), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia; };
    try {
      stub(true);
      mountFullRange(2024);
      expect(await screen.findByTestId('choropleth')).toHaveAttribute('data-controls', 'overlay');
      cleanup();
      stub(false);
      mountFullRange(2024);
      expect(await screen.findByTestId('choropleth')).toHaveAttribute('data-controls', 'below');
    } finally { window.matchMedia = real; }
  });
  it('makes the whole chart card body the map panel, with the map flush on it', async () => {
    mountFullRange(2024);
    const map = await screen.findByTestId('choropleth');
    expect(map).toHaveAttribute('data-flush', 'true');
    expect(document.querySelector('.overview-map-card .syn-map-panel')).not.toBeNull();
    expect(document.querySelector('.overview-map-card .syn-data-panel')).toBeNull();
  });

  it('gives the map a real zero (Antarctica reports 0.0) as a value, for the lowest band, and still leaves a missing value out', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue({ ...WORLD_MAP_SERIES, iso_codes: ['CHN', 'ATA', 'XXX'], countries: ['China', 'Antarctica', 'Nowhere'], values: [[14350, 0, null], [25324, 0, null]] });
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    const map = await screen.findByTestId('choropleth');
    expect(JSON.parse(map.getAttribute('data-values')!)).toEqual({ CHN: 25324, ATA: 0 });
  });

  it('draws the map in eight fixed bands on the map panel, with each mode\'s own breaks and labels', async () => {
    mountFullRange(2024);
    const map = await screen.findByTestId('choropleth');
    expect(map).toHaveAttribute('data-scale', 'bands');
    expect(map).toHaveAttribute('data-surface', 'map');
    expect(map).toHaveAttribute('data-breaks', JSON.stringify([1, 10, 100, 250, 500, 1000, 2500]));
    expect(map).toHaveAttribute('data-band-labels', JSON.stringify(['<1', '1–10', '10–100', '100–250', '250–500', '500–1k', '1k–2.5k', '2.5k+']));
    expect(map).not.toHaveAttribute('data-domain'); // the log domain is no longer passed
    fireEvent.click(await screen.findByRole('radio', { name: 'Cumulative' }));
    const cumulative = await screen.findByTestId('choropleth');
    expect(cumulative).toHaveAttribute('data-breaks', JSON.stringify([0.1, 1, 5, 20, 50, 100, 250])); // the same breaks in GtCO₂ (÷ 1000)
    expect(cumulative).toHaveAttribute('data-band-labels', JSON.stringify(['<0.1', '0.1–1', '1–5', '5–20', '20–50', '50–100', '100–250', '250+']));
  });

  it('in Cumulative the table reads Total to {year}, in GtCO₂, with each row\'s share of the cumulative world total and the footer\'s growth since the baseline', async () => {
    mountFullRange(2024, '&countries=Vietnam');
    await showCumulative();
    expect(yourHeads()).toEqual(['Country', 'Total to 2024, GtCO₂', 'Share of world', 'Band since 1990']);
    const china = CUM[54][0];
    const vietnam = CUM[54][1];
    const worldMt = (china + vietnam) * WORLD_OVER_COUNTRIES; // Gt
    expect(yourBody()[0].slice(0, 3)).toEqual(['China', gt(china), `${((china / worldMt) * 100).toFixed(1)}%`]);
    expect(yourFoot()[1][1]).toBe(gt(china + vietnam)); // All countries
    const growth = (now: number, then: number) => `+${(((now - then) / then) * 100).toFixed(1)}%`;
    expect(yourFoot()[1][3]).toBe(`${growth(china + vietnam, CUM[20][0] + CUM[20][1])} since 1990`); // the running total at 1990 is index 20 of the 1970-based series
    expect(screen.queryByText('Share of world total')).not.toBeInTheDocument();
  });
  it('the table view follows the mode (the running totals in GtCO₂, with a cumulative caption)', async () => {
    realMap.on = true;
    mountFullRange(2024);
    await showCumulative();
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    const region = screen.getByRole('region', { name: 'Table of values' });
    expect(within(region).getByRole('table', { name: /^World map of cumulative CO₂ emissions by country: the running total emitted since 1750, currently showing 2024/ })).toBeInTheDocument();
    expect(within(region).getByRole('columnheader', { name: 'Cumulative CO₂, GtCO₂' })).toBeInTheDocument();
    expect(within(region).getByText(Number(CUM[54][0].toPrecision(3)).toLocaleString('en-GB'))).toBeInTheDocument(); // China's running total, in Gt
    expect(within(region).getAllByText('No data').length).toBeGreaterThan(100); // every country without a value is listed, not left out
  });

  it('also offers only Absolute when the snapshot comes back empty (a 200 with no rows): an empty base would silently drop the pre-1970 history', async () => {
    mountFullRange(2024);
    vi.mocked(api.correlationCountryShare).mockResolvedValue({ ...SHARE_SNAPSHOT, rows: [], notes: ['no data for 1969'] });
    cleanup();
    render(<MemoryRouter initialEntries={['/overview?countries=China']}><OverviewPage /></MemoryRouter>);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(screen.getByRole('radio', { name: 'Cumulative' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Absolute' })).toBeChecked();
  });

  it('offers only Absolute when the cumulative snapshot is unavailable', async () => {
    vi.mocked(useYearAnimation).mockReturnValue({ ...DEFAULT_ANIMATION, currentYear: 2024 });
    vi.mocked(api.listCountries).mockResolvedValue({ featured: ['China'], expanded: ['China', 'Vietnam'] });
    vi.mocked(api.overview).mockResolvedValue(FULL_RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(FULL_MAP);
    vi.mocked(api.correlationEmissionsTemperature).mockResolvedValue(PAIR);
    vi.mocked(api.correlationTemperature).mockResolvedValue(TEMPERATURE);
    vi.mocked(api.correlationConcentration).mockResolvedValue(CONCENTRATION);
    vi.mocked(api.correlationCountryShare).mockRejectedValue(new ApiError(503, 'unavailable'));
    render(<MemoryRouter initialEntries={['/overview?countries=China']}><OverviewPage /></MemoryRouter>);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(screen.getByRole('radio', { name: 'Cumulative' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Absolute' })).toBeChecked();
  });
});

describe('OverviewPage: the visitor\'s own default countries', () => {
  afterEach(() => localStorage.removeItem(DEFAULT_COUNTRIES_STORAGE_KEY));

  it('opens on the stored list, drops names that are no longer Expanded, and the reset button says "my defaults"', async () => {
    localStorage.setItem(DEFAULT_COUNTRIES_STORAGE_KEY, JSON.stringify(['Vietnam', 'Atlantis', 'China']));
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(SERIES_CHINA);
    render(<DefaultCountriesProvider><MemoryRouter><OverviewPage /></MemoryRouter></DefaultCountriesProvider>);
    expect(await screen.findByRole('button', { name: 'Reset to my defaults' })).toBeInTheDocument();
    expect(vi.mocked(api.overview)).toHaveBeenCalledWith(['Vietnam', 'China']);
  });

  it('the reset button has nothing to do while the selection is the defaults, and is enabled once it is not', async () => {
    localStorage.setItem(DEFAULT_COUNTRIES_STORAGE_KEY, JSON.stringify(['Vietnam', 'China']));
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(SERIES_CHINA);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<DefaultCountriesProvider><MemoryRouter><OverviewPage /></MemoryRouter></DefaultCountriesProvider>);
    const reset = await screen.findByRole('button', { name: 'Reset to my defaults' });
    expect(reset).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: /^Select countries/ }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByRole('button', { name: 'Reset to my defaults' })).toBeEnabled();
  });

  it('lets an explicit URL selection matching the defaults reset to following defaults', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(SERIES_CHINA);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const query = FEATURED.map((country) => `countries=${encodeURIComponent(country)}`).join('&');
    render(<MemoryRouter initialEntries={[`/overview?${query}`]}><OverviewPage /></MemoryRouter>);
    const reset = await screen.findByRole('button', { name: 'Reset to default' });
    expect(reset).toBeEnabled();
    await user.click(reset);
    expect(await screen.findByRole('button', { name: 'Reset to default' })).toBeDisabled();
  });

  it('a ?countries= in the address always wins over the stored list', async () => {
    localStorage.setItem(DEFAULT_COUNTRIES_STORAGE_KEY, JSON.stringify(['Vietnam']));
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.overview).mockResolvedValue(RESPONSE);
    vi.mocked(api.worldMapSeries).mockResolvedValue(SERIES_CHINA);
    render(<DefaultCountriesProvider><MemoryRouter initialEntries={['/overview?countries=China&countries=India']}><OverviewPage /></MemoryRouter></DefaultCountriesProvider>);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(vi.mocked(api.overview)).toHaveBeenCalledWith(['China', 'India']);
    expect(vi.mocked(api.overview)).not.toHaveBeenCalledWith(['Vietnam']);
  });
});

// A made-up world for the "Your countries" table, 1970–2024: each country sits at its 1990 value until 1990 and moves in a straight line to its 2024 value. Chosen: Upland (up 3 bands,
// overtakes Downland), Downland (down 1), Stayland (no change). The rest: Outup (+2,900 Mt, up 4), Outmid (+900, up 1), Outdown (−800, down 2), Outsmall (+10, up 1).
const BAND_COUNTRIES: Array<[iso: string, name: string, v1990: number, v2024: number]> = [
  ['UPL', 'Upland', 150, 2000], ['DWN', 'Downland', 2600, 1700], ['STY', 'Stayland', 20, 90],
  ['OUP', 'Outup', 100, 3000], ['OMD', 'Outmid', 600, 1500], ['ODN', 'Outdown', 1100, 300], ['OSM', 'Outsmall', 5, 15],
];
const bandValue = (v1990: number, v2024: number, year: number) => (year <= 1990 ? v1990 : v1990 + ((v2024 - v1990) * (year - 1990)) / 34);
const BAND_MAP: WorldMapTimeSeries = {
  iso_codes: BAND_COUNTRIES.map((c) => c[0]),
  countries: BAND_COUNTRIES.map((c) => c[1]),
  years: Array.from({ length: 55 }, (_, i) => 1970 + i),
  values: Array.from({ length: 55 }, (_, i) => BAND_COUNTRIES.map(([, , a, b]) => bandValue(a, b, 1970 + i))),
  value_range: [5, 3000],
};
const BAND_WORLD = (over: number) => ({
  ...SHARE_SNAPSHOT, mode: 'series', year: null, start_year: 1970, rows: [],
  remainder_series: BAND_MAP.years.map((year, i) => {
    const annual = BAND_MAP.values[i].reduce<number>((a, v) => a + (v ?? 0), 0) * over;
    return { year, world_cumulative_mt: annual * (i + 1), world_annual_mt: annual, cumulative_mt: 0, share_pct: 0, annual_mt: 0, annual_share_pct: 0, international_transport_cumulative_mt: null, international_transport_annual_mt: null };
  }),
}) as unknown as CorrelationCountryShareResponse;

function mountBands(year: number, chosen = ['Upland', 'Downland', 'Stayland'], world: CorrelationCountryShareResponse | Error = BAND_WORLD(1.2)) {
  vi.mocked(useYearAnimation).mockReturnValue({ ...DEFAULT_ANIMATION, currentYear: year });
  vi.mocked(api.listCountries).mockResolvedValue({ featured: ['Upland'], expanded: BAND_COUNTRIES.map((c) => c[1]) });
  vi.mocked(api.overview).mockResolvedValue({ ...FULL_RESPONSE, all_countries: { ...FULL_RESPONSE.all_countries, countries_count: BAND_COUNTRIES.length } });
  vi.mocked(api.worldMapSeries).mockResolvedValue(BAND_MAP);
  vi.mocked(api.correlationEmissionsTemperature).mockResolvedValue(PAIR);
  vi.mocked(api.correlationTemperature).mockImplementation(async (o) => (o?.view === 'mean5y' ? TEMPERATURE_MEAN5Y : TEMPERATURE));
  vi.mocked(api.correlationConcentration).mockResolvedValue(CONCENTRATION);
  vi.mocked(api.correlationCountryShare).mockImplementation(async (o) => { if (o?.countries) { if (world instanceof Error) throw world; return world; } return SHARE_SNAPSHOT; });
  return render(<MemoryRouter initialEntries={[`/overview?${chosen.length ? chosen.map((c) => `countries=${c}`).join('&') : 'countries='}`]}><OverviewPage /></MemoryRouter>);
}
const alsoLine = () => screen.queryByText(/^Also changed band:/)?.textContent ?? null;

describe('OverviewPage: the Your countries table', () => {
  it('lists the chosen countries biggest first in the map\'s year, so the order follows the year', async () => {
    mountBands(1990);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(yourBody().map((r) => r[0])).toEqual(['Downland', 'Upland', 'Stayland']); // 2,600 / 150 / 20
    cleanup();
    mountBands(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(yourBody().map((r) => r[0])).toEqual(['Upland', 'Downland', 'Stayland']); // 2,000 / 1,700 / 90: Upland overtook Downland
    expect(yourBody().map((r) => r[1])).toEqual(['2,000', '1,700', '90']);
  });

  it('says in the band column how many bands each country crossed since the baseline: up, down, or unchanged (a dash), with the ranges in the tooltip and the accessible name', async () => {
    mountBands(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    const cell = (name: string) => within(yourTable()).getByRole('rowheader', { name }).closest('tr')!.cells[3];
    expect(cell('Upland').textContent).toContain('↑3');
    expect(within(cell('Upland')).getByRole('img')).toHaveAccessibleName('Up 3 bands: 100–250 to 1k–2.5k');
    expect(within(cell('Upland')).getByRole('img')).toHaveAttribute('title', '100–250 → 1k–2.5k');
    expect(cell('Downland').textContent).toContain('↓1');
    expect(within(cell('Downland')).getByRole('img')).toHaveAccessibleName('Down 1 band: 2.5k+ to 1k–2.5k');
    // unchanged: the band it is in, and a dash
    expect(cell('Stayland').textContent).toBe('–');
    expect(within(cell('Stayland')).getByRole('img')).toHaveAccessibleName('Unchanged: 10–100');
    expect(within(cell('Stayland')).getByRole('img').querySelector('span[style*="--syn-data-band-3"]')).not.toBeNull(); // the 10–100 band's swatch
  });

  it('shows no band change at the baseline year, and no "Also changed band" line', async () => {
    mountBands(1990);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(yourBody().map((r) => r[3])).toEqual(['–', '–', '–']);
    expect(alsoLine()).toBeNull();
  });

  it('does not compare band changes for years before the baseline', async () => {
    mountBands(1980);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(yourBody().map((r) => r[3])).toEqual(['—', '—', '—']);
    expect(alsoLine()).toBeNull();
  });

  it('has footer rows whose totals are the group\'s values: the chosen countries\' sum, all countries, their shares of the world and the change since the baseline', async () => {
    mountBands(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    const sum = (names: string[], year: number) => BAND_COUNTRIES.filter((c) => names.includes(c[1])).reduce((a, c) => a + bandValue(c[2], c[3], year), 0);
    const all = BAND_COUNTRIES.map((c) => c[1]);
    const chosen = ['Upland', 'Downland', 'Stayland'];
    const world = sum(all, 2024) * 1.2;
    expect(yourFoot().map((r) => r[0])).toEqual(['Selected · 3', 'All countries · 7', 'Shipping & aviation']);
    expect(yourFoot()[0][1]).toBe(fmt0(sum(chosen, 2024)));
    expect(yourFoot()[1][1]).toBe(fmt0(sum(all, 2024)));
    // Shipping & aviation is the World total less the countries' sum, worked out, not typed in
    expect(yourFoot()[2][1]).toBe(fmt0(world - sum(all, 2024)));
    expect(yourFoot()[0][2]).toBe(`${((sum(chosen, 2024) / world) * 100).toFixed(1)}%`);
    expect(yourFoot()[1][2]).toBe(`${((sum(all, 2024) / world) * 100).toFixed(1)}%`);
    const change = (names: string[]) => (((sum(names, 2024) - sum(names, 1990)) / sum(names, 1990)) * 100).toFixed(1);
    expect(yourFoot()[0][3]).toBe(`+${change(chosen)}% since 1990`);
    expect(yourFoot()[1][3]).toBe(`+${change(all)}% since 1990`);
    // the footer value is the sum of the rows above it
    expect(yourBody().reduce((a, r) => a + Number(r[1].replace(/,/g, '')), 0)).toBeCloseTo(Number(yourFoot()[0][1].replace(/,/g, '')), 0);
  });

  it('names who else changed band, never a chosen country: the biggest changes in tonnes first, ups and downs together (top 3)', async () => {
    mountBands(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    // Outup +2,900 Mt (↑4), Outmid +900 (↑1), Outdown −800 (↓2); Outsmall (+10) is the fourth; Upland (+1,850 Mt) is chosen, so it is not here
    expect(alsoLine()).toBe('Also changed band: Outup ↑4, Outmid ↑1, Outdown ↓2');
    expect(alsoLine()).not.toMatch(/Upland|Downland|Stayland/);
    cleanup();
    mountBands(2024, ['Outup', 'Stayland']);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(alsoLine()).toBe('Also changed band: Upland ↑3, Downland ↓1, Outmid ↑1'); // Outup is chosen now; Upland (+1,850) joins; Downland (−900) ties Outmid (+900) in tonnes and wins on the larger value now
  });

  it('in Cumulative reads Total to {year}, and the outside movers are ups only (a running total cannot fall)', async () => {
    mountBands(2024);
    await showCumulative();
    expect(yourHeads()).toEqual(['Country', 'Total to 2024, GtCO₂', 'Share of world', 'Band since 1990']);
    expect(alsoLine()).not.toMatch(/↓/);
    expect(alsoLine()).toMatch(/^Also changed band: /);
  });

  it('with nothing chosen shows the footer rows and the Also changed band line only, with a prompt, in both modes', async () => {
    mountBands(2024, []);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(within(yourTable()).getByText('Select countries to compare them here.')).toBeInTheDocument();
    expect(yourFoot().map((r) => r[0]).slice(0, 2)).toEqual(['Selected · 0', 'All countries · 7']);
    expect(alsoLine()).toBe('Also changed band: Outup ↑4, Upland ↑3, Downland ↓1'); // by tonnes: +2,900, +1,850, then Downland −900 (ties Outmid +900; the larger value now wins)
    await showCumulative();
    expect(within(yourTable()).getByText('Select countries to compare them here.')).toBeInTheDocument();
  });

  it('claims no share when the World totals are unavailable, rather than showing one against another total', async () => {
    mountBands(2024, undefined, new ApiError(503, 'unavailable'));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(yourBody().map((r) => r[2])).toEqual(['—', '—', '—']);
    expect(yourFoot().map((r) => r[0])).toEqual(['Selected · 3', 'All countries · 7']); // and no Shipping & aviation row: it needs the World total
    expect(yourFoot().map((r) => r[2])).toEqual(['—', '—']);
  });

  it('adds a Shipping & aviation row: the World total less the countries, with its share, its change since the baseline and an empty band cell; All countries and Shipping & aviation shares make 100%, in both modes', async () => {
    mountBands(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    const shareOf = (row: string[]) => Number(row[2].replace('%', ''));
    const check = () => {
      const [, all, shipping] = yourFoot();
      expect(shipping[0]).toBe('Shipping & aviation');
      expect(shareOf(all) + shareOf(shipping)).toBeCloseTo(100, 0); // each is rounded to 0.1%
      expect(Math.abs(shareOf(all) + shareOf(shipping) - 100)).toBeLessThanOrEqual(0.1);
    };
    check();
    // 20% over the countries: bunkers are 1/6 of the world
    expect(shareOf(yourFoot()[2])).toBeCloseTo(16.7, 1);
    // its change since 1990 follows the same fraction (20% of both years' sums, so the same growth as the countries'), and the band column holds no swatches
    expect(yourFoot()[2][3]).toMatch(/^\+[\d.]+% since 1990$/);
    expect(within(yourTable().tFoot!.rows[2].cells[3]).queryByRole('img')).toBeNull();
    fireEvent.click(await screen.findByRole('radio', { name: 'Cumulative' }));
    check();
    expect(yourFoot()[2][0]).toBe('Shipping & aviation');
  });

  it('explains Shipping & aviation behind an ⓘ, reachable by keyboard', async () => {
    mountBands(2024);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    const row = within(yourTable()).getByRole('rowheader', { name: /^Shipping & aviation/ });
    const info = within(row).getByRole('button', { name: 'About Shipping & aviation' });
    expect(info).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(info);
    expect(screen.getByRole('note')).toHaveTextContent('International transport fuels (bunkers), not assigned to any country.');
  });

  it('leaves the Shipping & aviation change blank at the baseline year, and has no footnote about it', async () => {
    mountBands(1990);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(yourFoot()[2][0]).toBe('Shipping & aviation');
    expect(yourFoot()[2][3]).toBe('');
    expect(screen.queryByText(/bunkers/i, { selector: 'p, span.syn-caption' })).not.toBeInTheDocument();
  });

  it('states no warming attribution anywhere on the table: it lists emissions only', async () => {
    mountBands(2024);
    const card = await screen.findByRole('region', { name: 'Your countries · 2024' });
    expect(card.textContent).not.toMatch(/warming|temperature/i);
  });
});

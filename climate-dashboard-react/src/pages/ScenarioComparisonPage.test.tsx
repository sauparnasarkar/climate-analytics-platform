import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Themed } from '../test/Themed';
import { api } from '../api/client';
import type { CountriesResponse, ScenarioCompareResponse, ScenarioCumulativeResponse } from '../api/types';
import ScenarioComparisonPage from './ScenarioComparisonPage';

// JumpLinks (SPEC.md §5.19) calls the design system's useReducedMotion during render -- jsdom has
// no window.matchMedia at all, so every test needs this stub. Same pattern as useCountUp.test.ts.
// `mobile` answers the design system's useIsMobile query (a max-width one, below its compact breakpoint), which the page uses to stop
// pointing at the treemap's colour key on phones.
function mockReducedMotion(matches: boolean, mobile = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : /^\(max-width: \d+px\)$/.test(query) ? mobile : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

vi.mock('../api/client', () => ({
  api: { listCountries: vi.fn(), scenarioCumulative: vi.fn(), scenarioCompare: vi.fn() },
}));

// See OverviewPage.test.tsx — the charts' own drawing is the design system's concern.
// The treemap's onSelect (SPEC.md §5.10) is real page-level logic, not the Treemap's own
// concern, so the stub draws one tap button per tile (and one for the first tile), which
// exercises ScenarioComparisonPage's own state wiring without needing a real canvas. Also
// surfaces the tiles' labels, values and colour values verbatim (as JSON in a hidden node), so a
// test can assert the emitted "Other" grouping directly rather than only inferring it from the
// detail panel's rendered text, and that the colour is asked for as a change centred on zero
// (an increase reads as the bad end), the same wiring as Overview's % Change bars.
vi.mock('@syena/ds', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Chart: (props: { ariaLabel?: string; height?: number }) => <div data-testid="chart" aria-label={props.ariaLabel} data-height={props.height} />,
    Treemap: (props: {
      ariaLabel?: string;
      height?: number;
      colorBy?: string;
      diverging?: boolean;
      colorLabel?: string;
      compact?: boolean;
      items: Array<{ id: string; label: string; value: number; colorValue?: number }>;
      onSelect?: (id: string) => void;
    }) => (
      <div
        data-testid="treemap"
        aria-label={props.ariaLabel}
        data-height={props.height}
        data-color-by={props.colorBy}
        data-diverging={String(Boolean(props.diverging))}
        data-color-label={props.colorLabel}
        data-compact={String(Boolean(props.compact))}
      >
        {props.onSelect && (
          <>
            <button onClick={() => props.onSelect!(props.items[0].id)}>Simulate tile tap</button>
            {props.items.map((item) => (
              <button key={item.id} onClick={() => props.onSelect!(item.id)}>
                {`Simulate tap: ${item.label}`}
              </button>
            ))}
          </>
        )}
        <div data-testid="treemap-series-data" style={{ display: 'none' }}>
          {JSON.stringify({ labels: props.items.map((i) => i.label), values: props.items.map((i) => i.value), colorValues: props.items.map((i) => i.colorValue ?? null) })}
        </div>
      </div>
    ),
  };
});

const COUNTRIES: CountriesResponse = { featured: ['China'], expanded: ['China', 'Vietnam'] };

const CUMULATIVE: ScenarioCumulativeResponse = {
  sort_by: 'BAU',
  order: ['China', 'United States'],
  scenarios: ['BAU', 'Moderate', 'Aggressive'],
  rows: [
    {
      country: 'China',
      values: { BAU: 1000, Moderate: 800, Aggressive: 600 },
      year_2040: { BAU: 16000, Moderate: 9000, Aggressive: 7000 },
      current_level: 11000,
    },
    {
      country: 'United States',
      values: { BAU: 500, Moderate: 400, Aggressive: 300 },
      year_2040: { BAU: 3800, Moderate: 3500, Aggressive: 3000 },
      current_level: 4700,
    },
  ],
};

// Exercises the "Other" grouping: China and India
// each clear the 1% threshold and stay individual tiles; Vietnam and Fiji (0.3%/0.7% of the
// 10,000 total) fall under it and are grouped. Deliberately UNEQUAL weights (30 vs. 70), not
// the 50/50 this fixture used before a review caught that a 50/50 split can't
// distinguish weighted from unweighted averaging -- both produce 5 when the weights are equal.
// Here the weighted average is (20*30 + -10*70) / (30+70) = -1, while the plain (unweighted)
// mean of the same two deltas is (20 + -10) / 2 = 5 -- a regression to an unweighted mean
// would assert -1 and get 5, and fail.
const CUMULATIVE_WITH_LONG_TAIL: ScenarioCumulativeResponse = {
  sort_by: 'BAU',
  order: ['China', 'India', 'Vietnam', 'Fiji'],
  scenarios: ['BAU', 'Moderate', 'Aggressive'],
  rows: [
    { country: 'China', values: { BAU: 8000 }, year_2040: { BAU: 16000 }, current_level: 11000 },
    { country: 'India', values: { BAU: 1900 }, year_2040: { BAU: 2500 }, current_level: 2000 },
    { country: 'Vietnam', values: { BAU: 30 }, year_2040: { BAU: 120 }, current_level: 100 },
    { country: 'Fiji', values: { BAU: 70 }, year_2040: { BAU: 90 }, current_level: 100 },
  ],
};

// Exercises the exact boundary OTHER_TREEMAP_SHARE_THRESHOLD sits at 
// -- the long-tail fixture above only exercises 0.3%/0.7% shares, both comfortably below
// either the old 1% or current 1.25% cutoff, so a regression back to 0.01 wouldn't fail that
// test). Qatar sits at exactly 1.1% of the 10,000 total -- above the OLD 1% cutoff (would have
// rendered as its own tile) but below the CURRENT 1.25% cutoff (must be grouped into "Other").
const CUMULATIVE_AT_THRESHOLD_BOUNDARY: ScenarioCumulativeResponse = {
  sort_by: 'BAU',
  order: ['China', 'India', 'Qatar'],
  scenarios: ['BAU', 'Moderate', 'Aggressive'],
  rows: [
    { country: 'China', values: { BAU: 8000 }, year_2040: { BAU: 16000 }, current_level: 11000 },
    { country: 'India', values: { BAU: 1890 }, year_2040: { BAU: 2390 }, current_level: 1890 },
    { country: 'Qatar', values: { BAU: 110 }, year_2040: { BAU: 120 }, current_level: 100 },
  ],
};

const COMPARE: ScenarioCompareResponse = {
  countries: ['China'],
  scenarios: {
    BAU: [{ name: 'China', years: [2020, 2040], values: [10000, 16000] }],
    Moderate: [{ name: 'China', years: [2020, 2040], values: [10000, 9000] }],
    Aggressive: [{ name: 'China', years: [2020, 2040], values: [10000, 7000] }],
  },
};

beforeEach(() => {
  mockReducedMotion(false);
});

afterEach(() => {
  // Not vi.unstubAllGlobals() -- that would also wipe the global ResizeObserver stub
  // src/test/setup.ts establishes once for the whole file (the design system's DataTable needs
  // it), breaking every test after the first. beforeEach already re-stubs matchMedia fresh
  // before each test, so there's nothing stale left for this to clean up anyway.
  vi.clearAllMocks();
  document.documentElement.removeAttribute('style');
});

describe('ScenarioComparisonPage', () => {
  it('renders the treemap and all three scenario panels for the default featured selection', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);

    expect(await screen.findByText('Cumulative Emissions & Reduction Scenarios — BAU — 2 Expanded Countries')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'BAU' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Moderate' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aggressive' })).toBeInTheDocument();
    expect(vi.mocked(api.scenarioCompare)).toHaveBeenCalledWith(['China']);
  });

  it('keeps the treemap colourbar, and the caption that points at it, on a desktop viewport', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);

    expect(await screen.findByTestId('treemap')).toHaveAttribute('data-compact', 'true'); // the colour key shares a row with the table switch
    expect(screen.getByText(/color \(see the colorbar\) shows/)).toBeInTheDocument();
  });

  it('on a phone the caption no longer points at the colour key', async () => {
    // The design system's compact treemap puts the key under the tiles, so a phone loses no width to it; the caption just stops pointing at a side bar.
    mockReducedMotion(false, true);
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);

    expect(await screen.findByTestId('treemap')).toHaveAttribute('data-compact', 'true');
    expect(screen.queryByText(/see the colorbar/)).not.toBeInTheDocument();
    expect(screen.getByText(/color shows\s+whether the selected scenario/)).toBeInTheDocument();
  });

  it('opens on the countries in ?countries= (validated against the expanded list) and falls back for unknown ones', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    const { unmount } = render(<Themed><MemoryRouter initialEntries={['/scenarios?countries=vietnam&countries=Atlantis']}><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByRole('heading', { name: 'BAU' });
    expect(vi.mocked(api.scenarioCompare)).toHaveBeenCalledWith(['Vietnam']);
    unmount();

    vi.mocked(api.scenarioCompare).mockClear();
    render(<Themed><MemoryRouter initialEntries={['/scenarios?countries=Atlantis']}><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByRole('heading', { name: 'BAU' });
    expect(vi.mocked(api.scenarioCompare)).toHaveBeenCalledWith(['China']);
  });

  it('colours the treemap by the change to 2040, centred on zero, so a country whose emissions are still rising reads as the bad end', async () => {
    // The design system's diverging ramp (centred on zero, symmetric) does the colouring; this page's part is to ask for it by value and to hand it each
    // country's change. China's BAU 2040 level (16000) is above its current level (11000), so it is still rising.
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByRole('heading', { name: 'BAU' });

    const treemap = screen.getByTestId('treemap');
    expect(treemap).toHaveAttribute('data-color-by', 'value');
    expect(treemap).toHaveAttribute('data-diverging', 'true');
    expect(treemap).toHaveAttribute('data-color-label', 'BAU 2040 vs. current, %');
    const { labels, colorValues } = JSON.parse(screen.getByTestId('treemap-series-data').textContent!);
    expect(labels).toEqual(['China', 'United States']);
    expect(colorValues[0]).toBeGreaterThan(0); // rising: the bad end
    expect(colorValues[1]).toBeLessThan(0); // falling: the good end
  });

  it('renders a Jump To nav under the h1 linking to all three sections, always present regardless of selection', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByRole('heading', { name: 'BAU' });

    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Reduction Map', 'Country Comparison', 'Cumulative Impact']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['#reduction-map', '#country-comparison', '#cumulative-impact']);
    expect(document.getElementById('reduction-map')).not.toBeNull();
    expect(document.getElementById('country-comparison')).not.toBeNull();
    expect(document.getElementById('cumulative-impact')).not.toBeNull();
  });

  it('refetches the comparison panels when the country selection changes', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByRole('heading', { name: 'BAU' });

    const updated: ScenarioCompareResponse = { ...COMPARE, countries: ['China', 'Vietnam'] };
    vi.mocked(api.scenarioCompare).mockResolvedValue(updated);
    await user.click(screen.getByLabelText(/Select countries/));
    await user.click(screen.getByRole('option', { name: 'Vietnam' }));

    expect(await screen.findByRole('heading', { name: 'BAU' })).toBeInTheDocument();
    expect(vi.mocked(api.scenarioCompare)).toHaveBeenLastCalledWith(['China', 'Vietnam']);
  });

  it('shows a warning instead of calling scenarioCompare when no countries are selected', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByRole('heading', { name: 'BAU' });

    vi.mocked(api.scenarioCompare).mockClear();
    await user.click(screen.getByRole('combobox', { name: /^Select countries/ }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(await screen.findByText('Select at least one country.')).toBeInTheDocument();
    expect(vi.mocked(api.scenarioCompare)).not.toHaveBeenCalled();
  });

  it('expands and restores the treemap via ChartCard\'s expandable control (SPEC.md §5.11)', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByText('Cumulative Emissions & Reduction Scenarios — BAU — 2 Expanded Countries');

    // Every ChartCard on this page is expandable (SPEC.md §5.11): the buttons are named for their card.
    const treemapChart = () => screen.getByTestId('treemap');
    const treemapTitle = 'Cumulative Emissions & Reduction Scenarios — BAU — 2 Expanded Countries';
    expect(treemapChart()).toHaveAttribute('data-height', '360');

    await user.click(screen.getByRole('button', { name: `Expand ${treemapTitle}` }));
    expect(treemapChart()).toHaveAttribute('data-height', '640');
    expect(screen.getByRole('button', { name: `Close expanded ${treemapTitle}` })).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: `Close expanded ${treemapTitle}` }));
    expect(treemapChart()).toHaveAttribute('data-height', '360');
    expect(screen.getByRole('button', { name: `Expand ${treemapTitle}` })).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands and restores a Country Comparison panel independently of the others (SPEC.md §5.11)', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByRole('heading', { name: 'BAU' });

    // The three panel charts (BAU, Moderate, Aggressive) are the 'chart' stubs, in that order; the treemap is its own.
    const bauPanelChart = () => screen.getAllByTestId('chart')[0];
    expect(bauPanelChart()).toHaveAttribute('data-height', '300');

    // The treemap's button comes first, then the BAU/Moderate/Aggressive panels' (the order they render in).
    await user.click(screen.getAllByRole('button', { name: /^Expand / })[1]);
    expect(bauPanelChart()).toHaveAttribute('data-height', '600');

    // The treemap and the other panels are unaffected by this one panel's toggle.
    expect(screen.getByTestId('treemap')).toHaveAttribute('data-height', '360');
    expect(screen.getAllByTestId('chart')[1]).toHaveAttribute('data-height', '300');
  });

  it('recolors the treemap (via its title) when a different scenario radio is selected, without refetching', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByText('Cumulative Emissions & Reduction Scenarios — BAU — 2 Expanded Countries');

    await user.click(screen.getByRole('radio', { name: 'Aggressive' }));

    expect(await screen.findByText('Cumulative Emissions & Reduction Scenarios — Aggressive — 2 Expanded Countries')).toBeInTheDocument();
    // Purely a client-side recolor of the already-fetched data -- no additional fetch.
    expect(vi.mocked(api.scenarioCumulative)).toHaveBeenCalledTimes(1);
  });

  it('shows a dismissible detail area for the tapped tile instead of drilling in (SPEC.md §5.10)', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByText('Cumulative Emissions & Reduction Scenarios — BAU — 2 Expanded Countries');

    expect(screen.queryByText(/Cumulative BAU: 1[,   ]000 MtCO/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simulate tile tap' }));

    expect(await screen.findByText(/Cumulative BAU: 1[,   ]000 MtCO/)).toBeInTheDocument();
    expect(screen.getByText(/BAU 2040 vs\. Current: \+5[,   ]000 MtCO/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss country detail' }));
    expect(screen.queryByText(/Cumulative BAU: 1[,   ]000 MtCO/)).not.toBeInTheDocument();
  });

  it('groups countries below 1% of total BAU into a single "Other" tile with a value-weighted average color (SPEC.md §5.10)', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE_WITH_LONG_TAIL);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByText('Cumulative Emissions & Reduction Scenarios — BAU — 4 Expanded Countries');

    // China and India clear the 1% threshold and stay individual; Vietnam and Fiji (0.3%/0.7%)
    // are grouped into one trailing "Other" tile -- exactly 3 tiles, not 4. colorValues[2] is
    // -1 (the weighted average), not 5 (the unweighted mean of the same two deltas) -- see the
    // fixture's own comment for why the two are deliberately different here.
    const seriesData = JSON.parse(screen.getByTestId('treemap-series-data').textContent!);
    expect(seriesData).toEqual({
      labels: ['China', 'India', 'Other'],
      values: [8000, 1900, 100],
      colorValues: [5000, 500, -1],
    });

    // Tapping the "Other" tile (the mocked Chart exposes one tap button per emitted label)
    // shows the aggregate, not a single country, and the weighted-average wording --
    // distinguishing this from the single-country detail panel checked below. Scoped to the
    // detail panel itself (via its dismiss button's container), not the whole document --
    // "India" and "China" also appear as ordinary rows in the Cumulative Impact table below.
    await user.click(screen.getByRole('button', { name: 'Simulate tap: Other' }));
    const detailPanel = () => screen.getByRole('button', { name: 'Dismiss country detail' }).closest('div')!;
    expect(await within(detailPanel()).findByText('Other (2 countries)')).toBeInTheDocument();
    expect(within(detailPanel()).getByText(/Cumulative BAU: 100 MtCO/)).toBeInTheDocument();
    expect(within(detailPanel()).getByText(/BAU 2040 vs\. Current \(weighted avg\.\): -1 MtCO/)).toBeInTheDocument();

    // Tapping an individual (non-grouped) tile still shows the plain, ungrouped wording.
    await user.click(screen.getByRole('button', { name: 'Simulate tap: India' }));
    expect(await within(detailPanel()).findByText('India')).toBeInTheDocument();
    expect(within(detailPanel()).queryByText(/countries\)/)).not.toBeInTheDocument();
    expect(within(detailPanel()).getByText(/BAU 2040 vs\. Current: \+500 MtCO/)).toBeInTheDocument();
  });

  it('groups a tile whose share sits between the old 1% and current 1.25% threshold into "Other" -- regression guard for the threshold value itself, not just the grouping mechanism)', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE_AT_THRESHOLD_BOUNDARY);
    vi.mocked(api.scenarioCompare).mockResolvedValue(COMPARE);
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);
    await screen.findByText('Cumulative Emissions & Reduction Scenarios — BAU — 3 Expanded Countries');

    // Qatar (110/10000 = 1.1%) clears the OLD 1% cutoff but falls under the CURRENT 1.25% one
    // -- grouped into "Other" alone. If OTHER_TREEMAP_SHARE_THRESHOLD ever regresses to 0.01,
    // Qatar would render as its own tile instead and this assertion would fail.
    const seriesData = JSON.parse(screen.getByTestId('treemap-series-data').textContent!);
    expect(seriesData).toEqual({
      labels: ['China', 'India', 'Other'],
      values: [8000, 1890, 110],
      colorValues: [5000, 500, 20],
    });
  });

  it('renders an inline error instead of crashing when the compare call fails', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockRejectedValue(new Error('Failed to load data.'));
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
  });

  it('renders an inline error instead of crashing when listCountries fails', async () => {
    vi.mocked(api.listCountries).mockRejectedValue(new Error('Failed to load data.'));
    render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
    expect(vi.mocked(api.scenarioCompare)).not.toHaveBeenCalled();
  });

  it('a bookmarked section is jumped to only once the page\'s data is in (a jump measured on the short, still-loading page lands short)', async () => {
    window.history.replaceState(null, '', '/#cumulative-impact');
    let release!: (value: ScenarioCompareResponse) => void;
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.scenarioCumulative).mockResolvedValue(CUMULATIVE);
    vi.mocked(api.scenarioCompare).mockReturnValue(new Promise((resolve) => { release = resolve; }));
    try {
      render(<Themed><MemoryRouter><ScenarioComparisonPage /></MemoryRouter></Themed>);
      await screen.findByRole('navigation', { name: 'On this page' });
      await new Promise((resolve) => setTimeout(resolve, 600)); // longer than the page's own settling time
      expect(document.activeElement?.id).not.toBe('cumulative-impact');
      release(COMPARE);
      await waitFor(() => expect(document.activeElement?.id).toBe('cumulative-impact'));
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});

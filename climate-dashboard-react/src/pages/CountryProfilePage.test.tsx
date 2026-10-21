import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Themed } from '../test/Themed';
import { api } from '../api/client';
import type { CountriesResponse, CountryCumulativeResponse, CountryProfileResponse } from '../api/types';
import CountryProfilePage from './CountryProfilePage';

// JumpLinks (SPEC.md §5.19) calls the design system's useReducedMotion during render -- jsdom has
// no window.matchMedia at all, so every test needs this stub. Same pattern as useCountUp.test.ts.
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

vi.mock('../api/client', () => ({ api: { countryProfile: vi.fn(), countryCumulative: vi.fn(), listCountries: vi.fn() } }));

// See OverviewPage.test.tsx — Chart's Plotly rendering is the design system's own
// concern, stubbed here so this page's data-wiring is what's under test. Also surfaces the
// series' own `color` (none is set: the colours are the design system's) and the YoY bars'
// sign mode, labels and values.
vi.mock('@syena/ds', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Chart: (props: { ariaLabel?: string; height?: number; series: Array<{ name: string; kind?: string; color?: string; signed?: string; signLabels?: string[]; y: Array<number | null> }> }) => {
      const bar = props.series.find((s) => s.kind === 'bar');
      const line = props.series.find((s) => s.kind === 'line');
      return (
        <div
          data-testid="chart"
          aria-label={props.ariaLabel}
          data-height={props.height}
          data-line-name={line?.name}
          data-line-color={line?.color}
          data-bar-signed={bar?.signed}
          data-bar-sign-labels={bar?.signLabels ? JSON.stringify(bar.signLabels) : undefined}
          data-bar-y={bar ? JSON.stringify(bar.y) : undefined}
        />
      );
    },
  };
});

const COUNTRIES: CountriesResponse = {
  featured: ['China', 'United States'],
  expanded: ['China', 'United States', 'India', 'Vietnam'],
};

const RESPONSE: CountryProfileResponse = {
  country: 'China',
  years: [2020, 2021],
  co2: [10000, 11000],
  co2_per_capita: [7.1, 7.4],
  yoy_years: [2021],
  yoy_values: [10.5],
  table: [{ year: 2021, co2: 11000, co2_per_capita: 7.4, co2_yoy_pct_change: 10.5, ghg_intensity: 0.3 }],
};

const CUMULATIVE: CountryCumulativeResponse = {
  country: 'China',
  years: [1970, 2024],
  cumulative_co2: [10870, 285087],
  share_of_world_cumulative: [2.6, 15.4],
  share_of_world_annual: [4.1, 31.8],
  latest: { year: 2024, cumulative_co2: 285087, share_of_world_cumulative: 15.4, rank: 2, rank_of: 215 },
};

beforeEach(() => {
  mockReducedMotion(false);
  vi.mocked(api.countryCumulative).mockResolvedValue(CUMULATIVE);
});

afterEach(() => {
  // Not vi.unstubAllGlobals() -- that would also wipe the global ResizeObserver stub
  // src/test/setup.ts establishes once for the whole file (the design system's DataTable needs
  // it), breaking every test after the first. beforeEach already re-stubs matchMedia fresh
  // before each test, so there's nothing stale left for this to clean up anyway.
  vi.clearAllMocks();
  document.documentElement.removeAttribute('style');
});

describe('CountryProfilePage', () => {
  it('renders the profile for the default (featured[0]) country', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.countryProfile).mockResolvedValue(RESPONSE);
    render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);

    expect(await screen.findByText('CO₂ Emissions — China')).toBeInTheDocument();
    expect(vi.mocked(api.countryProfile)).toHaveBeenCalledWith('China');
  });

  it('draws the CO₂ Emissions and per-capita charts as one line each and sets no colour of its own: the line colours are the design system\'s', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.countryProfile).mockResolvedValue(RESPONSE);
    render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);
    await screen.findByText('CO₂ Emissions — China');

    // Grid order: CO₂ Emissions (0), CO₂ per Capita (1) -- both line charts.
    const charts = screen.getAllByTestId('chart');
    expect(charts[0]).toHaveAttribute('data-line-name', 'CO₂');
    expect(charts[1]).toHaveAttribute('data-line-name', 'CO₂ per Capita');
    expect(charts[0]).not.toHaveAttribute('data-line-color');
    expect(charts[1]).not.toHaveAttribute('data-line-color');
  });

  it('renders a Jump To nav under the h1 linking to all five sections', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.countryProfile).mockResolvedValue(RESPONSE);
    render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);
    await screen.findByText('CO₂ Emissions — China');

    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Emissions', 'Per Capita', 'YoY Change', 'Key Statistics', 'Cumulative']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['#emissions', '#per-capita', '#yoy-change', '#key-stats', '#cumulative']);
    expect(document.getElementById('emissions')).not.toBeNull();
    expect(document.getElementById('key-stats')).not.toBeNull();
  });

  it('re-fetches with a newly selected, expanded-but-not-featured country', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.countryProfile).mockResolvedValue(RESPONSE);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);
    await screen.findByText('CO₂ Emissions — China');

    vi.mocked(api.countryProfile).mockResolvedValue({ ...RESPONSE, country: 'Vietnam' });
    await user.click(screen.getByLabelText('Select a country (4 available)'));
    await user.click(await screen.findByRole('option', { name: 'Vietnam' }));

    expect(await screen.findByText('CO₂ Emissions — Vietnam')).toBeInTheDocument();
    expect(vi.mocked(api.countryProfile)).toHaveBeenLastCalledWith('Vietnam');
  });

  it('expands and restores the CO₂ Emissions chart via ChartCard\'s expandable control (SPEC.md §5.11)', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.countryProfile).mockResolvedValue(RESPONSE);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);
    await screen.findByText('CO₂ Emissions — China');

    // Grid order: CO₂ Emissions (index 0), CO₂ per Capita (index 1), then the already
    // full-width Year-on-Year chart (index 2, not expandable).
    const emissionsChart = () => screen.getAllByTestId('chart')[0];
    expect(emissionsChart()).toHaveAttribute('data-height', '280');

    await user.click(screen.getByRole('button', { name: 'Expand CO₂ Emissions — China' }));
    expect(emissionsChart()).toHaveAttribute('data-height', '560');
    expect(screen.getByRole('button', { name: 'Close expanded CO₂ Emissions — China' })).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Close expanded CO₂ Emissions — China' }));
    expect(emissionsChart()).toHaveAttribute('data-height', '280');

    // The CO₂ per Capita chart is unaffected by this one chart's toggle.
    expect(screen.getAllByTestId('chart')[1]).toHaveAttribute('data-height', '280');
  });

  it('colours the YoY bars by sign (an increase in emissions is the bad direction, a decrease the good one), the design system drawing the two colours', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.countryProfile).mockResolvedValue({ ...RESPONSE, yoy_years: [2020, 2021], yoy_values: [10.5, -3.2] });
    render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);
    await screen.findByText('CO₂ Emissions — China');

    // Grid order: CO₂ Emissions (0), CO₂ per Capita (1), YoY Change (2) -- same ordering the expand/restore test above relies on.
    const yoyChart = screen.getAllByTestId('chart')[2];
    expect(yoyChart).toHaveAttribute('data-bar-signed', 'change');
    expect(JSON.parse(yoyChart.getAttribute('data-bar-sign-labels')!)).toEqual(['Decrease', 'Increase']);
    expect(JSON.parse(yoyChart.getAttribute('data-bar-y')!)).toEqual([10.5, -3.2]);
  });

  it('renders an inline error instead of crashing when the profile API call fails', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.countryProfile).mockRejectedValue(new Error('Failed to load data.'));
    render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
  });

  it('renders an inline error instead of crashing when listCountries fails', async () => {
    vi.mocked(api.listCountries).mockRejectedValue(new Error('Failed to load data.'));
    render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
    expect(vi.mocked(api.countryProfile)).not.toHaveBeenCalled();
  });

  it('opens the country named in ?country= and falls back to the first featured country otherwise', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.countryProfile).mockResolvedValue(RESPONSE);
    const { unmount } = render(<Themed><MemoryRouter initialEntries={['/country-profile?country=india']}><CountryProfilePage /></MemoryRouter></Themed>);
    await screen.findByText(/CO₂ Emissions — India/);
    expect(vi.mocked(api.countryProfile)).toHaveBeenCalledWith('India');
    unmount();
    vi.mocked(api.countryProfile).mockClear();
    render(<Themed><MemoryRouter initialEntries={['/country-profile?country=Atlantis']}><CountryProfilePage /></MemoryRouter></Themed>);
    await screen.findByText(/CO₂ Emissions — China/);
    expect(vi.mocked(api.countryProfile)).toHaveBeenCalledWith('China');
  });

  describe('Cumulative contribution (SPEC.md §5.28)', () => {
    function arrange() {
      vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
      vi.mocked(api.countryProfile).mockResolvedValue(RESPONSE);
    }

    it('counts from the first record by default and, with "From a year", asks for emissions from that year and relabels the figures', async () => {
      arrange();
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);
      await screen.findByText('285 GtCO₂');
      expect(screen.getByRole('radio', { name: 'Since records began' })).toBeChecked();
      expect(screen.getByText('Cumulative CO₂ since records began · 2024')).toBeInTheDocument();
      vi.mocked(api.countryCumulative).mockResolvedValue({ ...CUMULATIVE, from_year: 1990, years: [1990, 2024], cumulative_co2: [0, 244176], share_of_world_cumulative: [null, 22.9], latest: { year: 2024, cumulative_co2: 244176, share_of_world_cumulative: 22.9, rank: 2, rank_of: 215 } });
      await user.click(screen.getByRole('radio', { name: 'From a year' }));
      expect(await screen.findByText('Emitted since 1990 · 2024')).toBeInTheDocument();
      expect(vi.mocked(api.countryCumulative)).toHaveBeenLastCalledWith('China', 1990);
      expect(screen.getByText('244 GtCO₂')).toBeInTheDocument();
      expect(screen.getByText("Share of the world's emissions since 1990")).toBeInTheDocument();
      expect(screen.getByText('22.9%')).toBeInTheDocument();
      expect(screen.getByText('Rank by emissions since 1990 · 2024')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'Share of World CO₂ since 1990 — China' })).toBeInTheDocument();
      expect(screen.getByText(/emissions since 1990: each total minus its total the year before 1990/)).toBeInTheDocument();
      expect(screen.queryByText(/in 1990$/)).toBeNull(); // no "x% in the first year" delta: the period starts from zero
    });

    it('opens on ?from= so a link from the Ask page shows the answer\'s numbers', async () => {
      arrange();
      render(<Themed><MemoryRouter initialEntries={['/country-profile?country=China&from=1990']}><CountryProfilePage /></MemoryRouter></Themed>);
      await screen.findByRole('heading', { name: 'Cumulative contribution' });
      await waitFor(() => expect(vi.mocked(api.countryCumulative)).toHaveBeenCalledWith('China', 1990));
      expect(screen.getByRole('radio', { name: 'From a year' })).toBeChecked();
    });

    it('shows the three figures and the share chart for the selected country', async () => {
      arrange();
      render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);
      expect(await screen.findByRole('heading', { name: 'Cumulative contribution' })).toBeInTheDocument();
      expect(vi.mocked(api.countryCumulative)).toHaveBeenCalledWith('China');
      expect(await screen.findByText('285 GtCO₂')).toBeInTheDocument();
      expect(screen.getByText('15.4%')).toBeInTheDocument();
      expect(screen.getByText('2.6% in 1970')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
      expect(screen.getByText('of 215 countries')).toBeInTheDocument();
      expect(screen.getByLabelText(/share of the world's cumulative CO₂ and of each year's CO₂ emissions, 1970 to 2024/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Open in Climate Correlation' })).toHaveAttribute('href', '/climate-correlation');
    });

    it('adds a Cumulative jump link to the new section', async () => {
      arrange();
      render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);
      const nav = await screen.findByRole('navigation', { name: 'On this page' });
      expect(within(nav).getByRole('link', { name: 'Cumulative' })).toHaveAttribute('href', '#cumulative');
      expect(document.getElementById('cumulative')).not.toBeNull();
    });

    it('keeps the rest of the profile when the cumulative request fails', async () => {
      arrange();
      vi.mocked(api.countryCumulative).mockRejectedValue(new Error('boom'));
      render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);
      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
      expect(screen.getByRole('heading', { name: 'Key Statistics' })).toBeInTheDocument();
    });

    it('says so when the country has no cumulative data', async () => {
      arrange();
      vi.mocked(api.countryCumulative).mockResolvedValue({ ...CUMULATIVE, latest: null });
      render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);
      expect(await screen.findByText('No cumulative CO₂ data for China.')).toBeInTheDocument();
    });

    it('shows a dash when OWID has no share for the latest year', async () => {
      arrange();
      vi.mocked(api.countryCumulative).mockResolvedValue({
        ...CUMULATIVE,
        share_of_world_cumulative: [null, null],
        latest: { ...CUMULATIVE.latest!, share_of_world_cumulative: null },
      });
      render(<Themed><MemoryRouter><CountryProfilePage /></MemoryRouter></Themed>);
      expect(await screen.findByText('—')).toBeInTheDocument();
    });
  });
});

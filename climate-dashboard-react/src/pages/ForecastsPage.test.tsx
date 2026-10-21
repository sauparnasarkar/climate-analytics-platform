import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Themed } from '../test/Themed';
import { api } from '../api/client';
import type {
  CountriesResponse,
  EtsParametersResponse,
  FeatureImportanceResponse,
  ForecastCountryResponse,
  ForecastSummaryResponse,
  ModelComparisonResponse,
} from '../api/types';
import ForecastsPage from './ForecastsPage';

vi.mock('../api/client', () => ({
  api: {
    listCountries: vi.fn(),
    forecast: vi.fn(),
    forecastSummary: vi.fn(),
    modelComparison: vi.fn(),
    etsParameters: vi.fn(),
    featureImportance: vi.fn(),
  },
}));

// See OverviewPage.test.tsx — Chart's Plotly rendering is the design system's own concern. Also
// surfaces each series' own wiring (name, kind, projection flag, categorical slot and band label)
// as JSON, so a test can assert how the forecast, its band and the history are drawn.
vi.mock('@syena/ds', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Chart: (props: { ariaLabel?: string; series?: Array<{ name?: string; kind?: string; projected?: boolean; slot?: number; band?: { label: string } }> }) => (
      <div
        data-testid="chart"
        aria-label={props.ariaLabel}
        data-series={JSON.stringify((props.series ?? []).map((s) => ({ name: s.name, kind: s.kind, projected: s.projected, slot: s.slot, band: s.band?.label })))}
      />
    ),
  };
});

const COUNTRIES: CountriesResponse = { featured: ['China'], expanded: ['China', 'Vietnam'] };
const FORECAST: ForecastCountryResponse = {
  country: 'China',
  hist_years: [2018],
  hist_co2: [10000],
  holdout_years: [2019],
  holdout_co2: [10500],
  forecast_years: [2024],
  forecast_mean: [11000],
  ci_upper: [11500],
  ci_lower: [10500],
};
const SUMMARY: ForecastSummaryResponse = { rows: [{ country: 'China', forecast_2030: 1, forecast_2035: 2, forecast_2040: 3, actual_2020: 4, pct_change_2020_2040: 5 }], effective_scope: 'featured' };
const MODEL_COMPARISON: ModelComparisonResponse = { columns: ['model', 'mae'], rows: [{ model: 'ETS', mae: 12.3 }] };
const ETS_PARAMS: EtsParametersResponse = { rows: [{ country: 'China', alpha: 0.1, beta_star: 0.2, phi: 0.9 }] };
const FEATURE_IMPORTANCE: FeatureImportanceResponse = { rows: [{ feature: 'co2_lag1', importance: 0.5 }] };

function mockAllResolved() {
  vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
  vi.mocked(api.forecast).mockResolvedValue(FORECAST);
  vi.mocked(api.forecastSummary).mockResolvedValue(SUMMARY);
  vi.mocked(api.modelComparison).mockResolvedValue(MODEL_COMPARISON);
  vi.mocked(api.etsParameters).mockResolvedValue(ETS_PARAMS);
  vi.mocked(api.featureImportance).mockResolvedValue(FEATURE_IMPORTANCE);
}

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

beforeEach(() => {
  mockReducedMotion(false);
});

afterEach(() => {
  // Not vi.unstubAllGlobals() -- that would also wipe the global ResizeObserver stub
  // src/test/setup.ts establishes once for the whole file (the design system's DataTable needs
  // it), breaking every test after the first. beforeEach already re-stubs matchMedia fresh
  // before each test, so there's nothing stale left for this to clean up anyway.
  vi.clearAllMocks();
  window.location.hash = '';
  document.documentElement.removeAttribute('style');
});

describe('ForecastsPage', () => {
  it('fires all 5 endpoint calls and renders the chart, summary table, and all 3 accordion sections', async () => {
    mockAllResolved();
    render(<Themed><ForecastsPage /></Themed>);

    expect(await screen.findByText('ETS(A,Ad,N) Forecast — China')).toBeInTheDocument();
    expect(screen.getByText('Forecast Summary — 1 Country')).toBeInTheDocument();
    expect(await screen.findByText('Five-Model Comparison Table (MAE / RMSE)')).toBeInTheDocument();
    expect(screen.getByText('ETS(A,Ad,N) Fitted Parameters — 1 Country')).toBeInTheDocument();
    expect(screen.getByText('Random Forest Feature Importance (Pooled Model)')).toBeInTheDocument();

    expect(vi.mocked(api.forecast)).toHaveBeenCalledWith('China');
    expect(vi.mocked(api.forecastSummary)).toHaveBeenCalledWith('expanded');
    expect(vi.mocked(api.modelComparison)).toHaveBeenCalled();
    expect(vi.mocked(api.etsParameters)).toHaveBeenCalled();
    expect(vi.mocked(api.featureImportance)).toHaveBeenCalled();
  });

  it('draws the history and the holdout as plain lines and the ETS forecast as a projection with its 95% band, on one categorical slot', async () => {
    mockAllResolved();
    render(<Themed><ForecastsPage /></Themed>);
    await screen.findByText('ETS(A,Ad,N) Forecast — China');

    const forecastChart = screen.getAllByTestId('chart')[0];
    const series = JSON.parse(forecastChart.getAttribute('data-series')!) as Array<{ name: string; kind: string; projected?: boolean; slot?: number; band?: string }>;
    expect(series.map((x) => x.name)).toEqual(['Historical (1990–2018)', 'Holdout actuals (2019–2023)', 'ETS Forecast']);
    const [history, holdout, ets] = series;
    expect(history).toMatchObject({ kind: 'line' });
    expect(history.projected).toBeUndefined();
    expect(holdout).toMatchObject({ kind: 'line' });
    expect(holdout.projected).toBeUndefined();
    expect(ets).toMatchObject({ kind: 'line', projected: true, slot: 5 }); // the band and the line share the forecast's colour
    expect(ets.band).toMatch(/^95%/);
  });

  it('only renders accordion sections whose data has actually loaded', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.forecast).mockResolvedValue(FORECAST);
    vi.mocked(api.forecastSummary).mockResolvedValue(SUMMARY);
    vi.mocked(api.modelComparison).mockResolvedValue(MODEL_COMPARISON);
    vi.mocked(api.etsParameters).mockRejectedValue(new Error('Failed to load data.'));
    vi.mocked(api.featureImportance).mockRejectedValue(new Error('Failed to load data.'));
    render(<Themed><ForecastsPage /></Themed>);

    expect(await screen.findByText('Five-Model Comparison Table (MAE / RMSE)')).toBeInTheDocument();
    expect(screen.queryByText('ETS(A,Ad,N) Fitted Parameters — 1 Country')).not.toBeInTheDocument();
    expect(screen.queryByText('Random Forest Feature Importance (Pooled Model)')).not.toBeInTheDocument();
  });

  it('renders an inline error for the main forecast chart when that call fails, independent of the others', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.forecast).mockRejectedValue(new Error('Failed to load data.'));
    vi.mocked(api.forecastSummary).mockResolvedValue(SUMMARY);
    vi.mocked(api.modelComparison).mockResolvedValue(MODEL_COMPARISON);
    vi.mocked(api.etsParameters).mockResolvedValue(ETS_PARAMS);
    vi.mocked(api.featureImportance).mockResolvedValue(FEATURE_IMPORTANCE);
    render(<Themed><ForecastsPage /></Themed>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
    expect(await screen.findByText('Forecast Summary — 1 Country')).toBeInTheDocument();
  });

  it('renders an inline error instead of crashing when listCountries fails', async () => {
    vi.mocked(api.listCountries).mockRejectedValue(new Error('Failed to load data.'));
    render(<Themed><ForecastsPage /></Themed>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load data.');
    expect(vi.mocked(api.forecast)).not.toHaveBeenCalled();
  });

  it('renders a Jump To nav with all 5 sections once every endpoint has resolved', async () => {
    mockAllResolved();
    render(<Themed><ForecastsPage /></Themed>);
    await screen.findByText('ETS(A,Ad,N) Forecast — China');
    await screen.findByText('Five-Model Comparison Table (MAE / RMSE)');

    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Forecast Chart', 'Forecast Summary', 'Model Comparison', 'ETS Parameters', 'Feature Importance',
    ]);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '#forecast-chart', '#forecast-summary',
      '#model-comparison-accordion-panel', '#ets-params-accordion-panel', '#feature-importance-accordion-panel',
    ]);
  });

  it('only lists accordion-backed jump items for sections whose data has actually loaded', async () => {
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    vi.mocked(api.forecast).mockResolvedValue(FORECAST);
    vi.mocked(api.forecastSummary).mockResolvedValue(SUMMARY);
    vi.mocked(api.modelComparison).mockResolvedValue(MODEL_COMPARISON);
    vi.mocked(api.etsParameters).mockRejectedValue(new Error('Failed to load data.'));
    vi.mocked(api.featureImportance).mockRejectedValue(new Error('Failed to load data.'));
    render(<Themed><ForecastsPage /></Themed>);
    await screen.findByText('Five-Model Comparison Table (MAE / RMSE)');

    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Forecast Chart', 'Forecast Summary', 'Model Comparison']);
  });

  it('clicking a jump link opens its collapsed Accordion panel before scrolling to it', async () => {
    // jsdom has no real scrollIntoView implementation at all.
    Element.prototype.scrollIntoView = vi.fn();
    mockAllResolved();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Themed><ForecastsPage /></Themed>);
    await screen.findByText('Five-Model Comparison Table (MAE / RMSE)');

    // Collapsed by default -- Accordion.tsx only mounts a panel's content once open.
    expect(screen.queryByText(/Five-Model Comparison Table \(MAE \/ RMSE\)/)?.closest('[role="region"]')).toBeNull();
    const panelButton = screen.getByRole('button', { name: 'Five-Model Comparison Table (MAE / RMSE)' });
    expect(panelButton).toHaveAttribute('aria-expanded', 'false');

    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    await user.click(within(nav).getByRole('link', { name: 'Model Comparison' }));

    expect(await screen.findByRole('button', { name: 'Five-Model Comparison Table (MAE / RMSE)' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('model-comparison-accordion-panel')).not.toBeNull();
  });

  it('a bookmarked URL targeting an accordion panel opens that panel and scrolls to it once its data loads', async () => {
    // Regression test for a bug a review caught: useJumpToHashOnLoad used to fire on
    // first render (before modelComparison/etsParams/featureImportance resolved), so a bookmarked
    // #model-comparison-accordion-panel URL silently no-opped -- the panel doesn't exist in the
    // DOM until its data has loaded AND the panel is open.
    Element.prototype.scrollIntoView = vi.fn();
    window.location.hash = '#model-comparison-accordion-panel';
    mockAllResolved();
    render(<Themed><ForecastsPage /></Themed>);

    const panelButton = await screen.findByRole('button', { name: 'Five-Model Comparison Table (MAE / RMSE)' });
    await waitFor(() => expect(panelButton).toHaveAttribute('aria-expanded', 'true')); // opened by the page once all three data sets are in
    await waitFor(() => expect(document.activeElement?.id).toBe('model-comparison-accordion-panel'));
  });

  it('a bookmarked panel is jumped to only once it has finished opening (the jump measured while it opens lands short)', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    window.location.hash = '#ets-params-accordion-panel';
    mockAllResolved();
    render(<Themed><ForecastsPage /></Themed>);

    const header = await screen.findByRole('button', { name: /^ETS\(A,Ad,N\) Fitted Parameters/ });
    await waitFor(() => expect(header).toHaveAttribute('aria-expanded', 'true'));
    expect(document.activeElement?.id).not.toBe('ets-params-accordion-panel'); // opened, but the opening is still under way: no jump yet
    await waitFor(() => expect(document.activeElement?.id).toBe('ets-params-accordion-panel'));
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { HEADLINE_PAIR } from '../../test/climateFixtures';
import { compareToAr6, countWord, headlineFacts } from '../../lib/aboutProject';
import { AboutProject } from './AboutProject';

vi.mock('../../api/client', () => ({ api: { overview: vi.fn(), scenarioTimeseries: vi.fn(), forecast: vi.fn() } }));

const fit = (over: Record<string, unknown>) => ({ ...HEADLINE_PAIR, fit: { ...HEADLINE_PAIR.fit, ...over } }) as typeof HEADLINE_PAIR;
const overview = (all = 218, expanded = 40) => ({ all_countries: { countries_count: all }, expanded_countries: { countries_count: expanded } }) as never;
const scenarios = (n: number) => ({ scenarios: Array.from({ length: n }, (_, i) => ({ name: `S${i}`, years: [2025], values: [1] })) }) as never;
const forecast = (end: number) => ({ forecast_years: [2019, end] }) as never;

beforeEach(() => {
  vi.mocked(api.overview).mockResolvedValue(overview());
  vi.mocked(api.scenarioTimeseries).mockResolvedValue(scenarios(3));
  vi.mocked(api.forecast).mockResolvedValue(forecast(2043));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const mount = (headline: typeof HEADLINE_PAIR | null = HEADLINE_PAIR) => render(<AboutProject headline={headline} featured="China" />);
const text = () => document.body.textContent ?? '';

describe('AboutProject — figures follow the API', () => {
  it('writes every figure from the mocked responses', async () => {
    mount(fit({ n_years: 180, slope: 0.4949 }));
    expect(await screen.findByText(/across 218 countries/)).toBeInTheDocument();
    expect(text()).toContain('Across 180 years of records, warming has tracked the total CO₂ emitted: about 0.49 °C for every 1,000 billion tonnes');
    expect(text()).toContain('since 1990');
    expect(text()).toContain('forecasts to 2043 for 40 countries, and what three pathways would imply for temperature');
    expect(text()).toContain('a pipeline that can be re-run from scratch, and the forecasts');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('changes with the data: other counts, forecast end year and scenario number', async () => {
    vi.mocked(api.overview).mockResolvedValue(overview(195, 52));
    vi.mocked(api.scenarioTimeseries).mockResolvedValue(scenarios(4));
    vi.mocked(api.forecast).mockResolvedValue(forecast(2050));
    mount();
    expect(await screen.findByText(/across 195 countries/)).toBeInTheDocument();
    expect(text()).toContain('forecasts to 2050 for 52 countries, and what four pathways');
  });

  it('ends with the muted "Coming next" line', async () => {
    mount();
    const line = (await screen.findByText('Coming next:')).closest('p')!;
    expect(line).toHaveTextContent('Coming next: what drives emissions, sector by sector, and scenarios you can adjust yourself to see how each choice changes the warming.');
    expect(line.style.color).toContain('muted');
    expect(text()).not.toMatch(/7-week|began as/);
  });
});

describe('AboutProject — the comparison word is computed', () => {
  it.each([
    ['in line with', [0.48, 0.56]],
    ['in line with', [0.6, 0.7]], // overlaps the top of the AR6 range
    ['above', [0.64, 0.8]],
    ['below', [0.1, 0.26]],
  ] as const)('%s for a fit range of %j', async (word, ci) => {
    mount(fit({ ci95_hac: [...ci], slope: 0.5 }));
    expect(await screen.findByText(/across 218 countries/)).toBeInTheDocument();
    expect(text()).toContain(`${word} the IPCC’s best estimate of 0.45 °C`);
  });

  it('boundaries: touching the AR6 range counts as overlapping', () => {
    expect(compareToAr6([0.63, 0.7])).toBe('in line with');
    expect(compareToAr6([0.2, 0.27])).toBe('in line with');
    expect(compareToAr6(null)).toBeNull();
  });
});

describe('AboutProject — a missing figure removes its clause', () => {
  it('without the overview: no country count and no Expanded count, but the rest stays', async () => {
    vi.mocked(api.overview).mockRejectedValue(new Error('down'));
    mount();
    expect(await screen.findByText(/who emitted the stock;/)).toBeInTheDocument();
    expect(text()).toContain('compare emission forecasts to 2043, and what three pathways');
    expect(text()).not.toMatch(/countries[,;]|NaN|undefined|\b0 countries/);
  });

  it('without the forecast: no end year', async () => {
    vi.mocked(api.forecast).mockRejectedValue(new Error('down'));
    mount();
    expect(await screen.findByText(/across 218 countries/)).toBeInTheDocument();
    expect(text()).toContain('compare emission forecasts for 40 countries');
    expect(text()).not.toMatch(/to 2043/);
  });

  it('without scenarios: no pathways clause', async () => {
    vi.mocked(api.scenarioTimeseries).mockResolvedValue(scenarios(0));
    mount();
    expect(await screen.findByText(/across 218 countries/)).toBeInTheDocument();
    expect(text()).toContain('forecasts to 2043 for 40 countries;');
    expect(text()).not.toMatch(/pathways would imply/);
  });

  it('without the headline fit: the whole finding paragraph goes', async () => {
    mount(null);
    expect(await screen.findByText(/across 218 countries/)).toBeInTheDocument();
    expect(text()).not.toMatch(/records, warming|has tracked/);
    expect(text()).toContain('With it you can:');
  });

  it('without a range: the slope stays, the comparison clause goes; without the year count: the "Across N years" lead goes', async () => {
    mount(fit({ ci95_hac: null, n_years: undefined, start: undefined, end: undefined }));
    expect(await screen.findByText(/across 218 countries/)).toBeInTheDocument();
    expect(text()).toContain('Warming has tracked the total CO₂ emitted: about 0.52 °C for every 1,000 billion tonnes.');
    expect(text()).not.toMatch(/IPCC’s best estimate/);
  });

  it('a slope in another unit is not quoted as per 1,000 billion tonnes', () => {
    expect(headlineFacts(fit({ unit: '°C per GtC' })).slope).toBeNull();
    expect(headlineFacts(fit({ slope: 0 })).slope).toBeNull();
  });

  it('shows no figure at all while the requests are pending', () => {
    vi.mocked(api.overview).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.scenarioTimeseries).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.forecast).mockReturnValue(new Promise(() => {}));
    mount();
    expect(text()).not.toMatch(/218|2043|three pathways/);
  });
});

describe('countWord', () => {
  it('words for 1–10, numerals above, null for nothing usable', () => {
    expect([countWord(3), countWord(11), countWord(0), countWord(undefined), countWord(2.5)]).toEqual(['three', '11', null, null, null]);
  });
});

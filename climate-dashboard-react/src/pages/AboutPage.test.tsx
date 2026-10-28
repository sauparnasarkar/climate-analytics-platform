import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { CountriesResponse } from '../api/types';
import { CONCENTRATION, HEADLINE_PAIR, META, TEMPERATURE, TEMPERATURE_MEAN5Y } from '../test/climateFixtures';
import { READING_MEASURE } from '../lib/readingMeasure';
import AboutPage from './AboutPage';

vi.mock('../api/client', () => ({
  api: { listCountries: vi.fn(), correlationMeta: vi.fn(), correlationEmissionsTemperature: vi.fn(), correlationTemperature: vi.fn(), correlationConcentration: vi.fn() },
}));
const scrollSpy = vi.hoisted(() => vi.fn());
vi.mock('@syena/ds', async (orig) => ({ ...(await orig<typeof import('@syena/ds')>()), scrollToJumpTarget: (id: string) => scrollSpy(id) }));

const COUNTRIES: CountriesResponse = {
  featured: ['China', 'United States', 'India'],
  expanded: ['China', 'United States', 'India', 'Vietnam'],
};

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
  vi.mocked(api.correlationMeta).mockResolvedValue(META);
  vi.mocked(api.correlationEmissionsTemperature).mockResolvedValue(HEADLINE_PAIR);
  vi.mocked(api.correlationTemperature).mockImplementation(async (o) => (o?.view === 'mean5y' ? TEMPERATURE_MEAN5Y : TEMPERATURE));
  vi.mocked(api.correlationConcentration).mockResolvedValue(CONCENTRATION);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

const mount = (hash = '') => render(<MemoryRouter initialEntries={[`/about${hash}`]}><AboutPage /></MemoryRouter>);

describe('AboutPage — Methods & data', () => {
  it('has the seven anchored sections, in order, each reachable from the jump row', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 2, name: 'Data sources' })).toBeInTheDocument();
    const ids = [...document.querySelectorAll('.methods-page section[id]')].map((s) => s.id);
    expect(ids).toEqual(['project', 'sources', 'baselines', 'forecasting', 'correlation', 'scenarios', 'limits']);
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(ids.map((id) => `#${id}`));
  });

  it('shows the platform-wide sources table from /meta, without Climate Watch and with landing-page links', async () => {
    mount();
    const table = await screen.findByRole('table', { name: /Every source the platform uses/ });
    expect(within(table).getByRole('link', { name: /^OWID CO₂ data \(GitHub\)/ })).toHaveAttribute('href', 'https://github.com/owid/co2-data');
    expect(screen.queryByText(/Climate Watch/)).not.toBeInTheDocument();
    expect(api.correlationMeta).toHaveBeenCalledTimes(1);
  });

  it('explains the two cumulative totals with their start years read from the API', async () => {
    mount();
    expect(await screen.findByText(/fossil and industry CO₂ since 1750.*since 1850/)).toBeInTheDocument();
  });

  it('a #baselines deep link waits for the sources section to finish growing (the splice card follows the concentration request), then jumps once', async () => {
    window.history.replaceState(null, '', '/about#baselines');
    let answer!: (r: typeof CONCENTRATION) => void;
    vi.mocked(api.correlationConcentration).mockReturnValue(new Promise((r) => { answer = r; }));
    mount('#baselines');
    await screen.findByRole('table', { name: /Every source the platform uses/ });
    await new Promise((r) => setTimeout(r, 50));
    expect(scrollSpy).not.toHaveBeenCalled();
    await act(async () => answer(CONCENTRATION));
    await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith('baselines'));
  });

  it('a #baselines deep link does not wait for the temperature requests, which do not change the sources section', async () => {
    window.history.replaceState(null, '', '/about#baselines');
    vi.mocked(api.correlationTemperature).mockReturnValue(new Promise(() => {}));
    mount('#baselines');
    await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith('baselines'));
  });

  it('no longer says the platform is filtered to sovereign nations from 1990', async () => {
    mount();
    await screen.findByRole('heading', { level: 2, name: 'Data sources' });
    expect(screen.queryByText(/filtered to sovereign nations from 1990 onwards/)).not.toBeInTheDocument();
  });

  it('hosts the baselines table, the temperature offset and the seven-step derivation', async () => {
    mount();
    expect(await screen.findByRole('table', { name: 'Baselines by view' })).toBeInTheDocument();
    expect(screen.getByText(/computed from the Berkeley Earth record itself/)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: 'How this number was derived' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^0\d/ })).toHaveLength(7);
  });

  it('states the guardrails once, in the last section', async () => {
    mount();
    const limits = (await screen.findByRole('heading', { level: 2, name: 'What this platform does not do' })).closest('section')!;
    expect(within(limits).getByText(/not a climate model/)).toBeInTheDocument();
    expect(within(limits).getByText(/no warming is attributed to a country/)).toBeInTheDocument();
    expect(within(limits).getByText(/illustrative translations of the pathways, not projections/)).toBeInTheDocument();
    expect(screen.getAllByText(/not a climate model/)).toHaveLength(2); // here, and the correlation section's own introduction
  });

  it('shows the country count and featured list once listCountries resolves, and a placeholder before', async () => {
    vi.mocked(api.listCountries).mockReturnValue(new Promise(() => {}));
    mount();
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    cleanup();
    vi.mocked(api.listCountries).mockResolvedValue(COUNTRIES);
    mount();
    expect(await screen.findByText(/Expanded: 4 countries/)).toBeInTheDocument();
    expect(screen.getByText(/defaults to these Featured countries: China, United States, India\./)).toBeInTheDocument();
  });

  it('renders the error message inline in the forecasting table when listCountries fails', async () => {
    vi.mocked(api.listCountries).mockRejectedValue(new Error('Failed to load data.'));
    mount();
    expect(await screen.findByText('Failed to load data.')).toBeInTheDocument();
  });

  it('keeps the sources section standing, with one message, when /meta fails', async () => {
    vi.mocked(api.correlationMeta).mockRejectedValue(new Error('x'));
    mount();
    expect(await screen.findByText('The sources, licences and data vintages could not be loaded right now.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Baselines by view' })).toBeInTheDocument();
  });

  it('has no presentation section or link, and no programme-framing words', async () => {
    const { container } = mount();
    await screen.findByRole('heading', { level: 2, name: 'Data sources' });
    expect(screen.queryByRole('link', { name: /presentation/i })).not.toBeInTheDocument();
    // Built from pieces so this file does not itself contain the words it checks for.
    const framing = new RegExp([['in', 'ternship'], ['men', 'tor']].map((p) => p.join('')).join('|'), 'i');
    const deck = new RegExp([['ppt', 'x'], ['office', 'apps']].map((p) => p.join('')).join('|'), 'i');
    expect(container.textContent).not.toMatch(framing);
    expect(container.innerHTML).not.toMatch(deck);
  });

  it('keeps body text to one reading width, the same as the derivation\'s step text, however wide the page', async () => {
    mount();
    const intro = (await screen.findByText(/The data pipeline and machine-learning models began as a 7-week data science project/)) as HTMLElement;
    expect(intro.style.maxWidth).toBe(READING_MEASURE);
    expect(READING_MEASURE).toBe('100ch');
  });
});

import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { ApiError } from '../api/types';
import type { WorldMapTimeSeries } from '../api/types';
import { ALL_GAS_PAIR, COMPOSITION, CONCENTRATION, COUNTRY_SNAPSHOT, META, PAIR, TEMPERATURE, TEMPERATURE_MEAN5Y } from '../test/climateFixtures';
import { shareResponse } from '../test/shareFixtures';
import { SCENARIO_TEMPERATURE } from '../test/scenarioFixtures';
import ClimateCorrelationPage from './ClimateCorrelationPage';

const scrollSpy = vi.hoisted(() => vi.fn());
vi.mock('../api/client', () => ({
  api: { correlationEmissionsTemperature: vi.fn(), correlationTemperature: vi.fn(), correlationConcentration: vi.fn(), worldMapSeries: vi.fn(), correlationGhgComposition: vi.fn(), correlationCountryShare: vi.fn(), correlationScenarioTemperature: vi.fn(), correlationMeta: vi.fn() },
}));
vi.mock('@syena/ds', async (orig) => ({
  ...(await orig<typeof import('@syena/ds')>()),
  scrollToJumpTarget: (id: string) => scrollSpy(id),
  Chart: (p: { ariaLabel?: string }) => <div data-testid="chart" aria-label={p.ariaLabel} />,
}));

const WORLD: WorldMapTimeSeries = { iso_codes: ['CHN', 'USA'], countries: ['China', 'United States'], years: [2023, 2024], values: [[30000, 5000], [32000, 5398]], value_range: [5000, 32000] };

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.mocked(api.correlationEmissionsTemperature).mockImplementation(async (o) => (o?.source === 'primap_ghg' ? ALL_GAS_PAIR : o?.variant === 'fossil' ? ({ ...PAIR, fit: { ...PAIR.fit, slope: 0.797 } } as never) : PAIR));
  vi.mocked(api.correlationTemperature).mockImplementation(async (o) => (o?.view === 'mean5y' ? TEMPERATURE_MEAN5Y : TEMPERATURE));
  vi.mocked(api.correlationConcentration).mockResolvedValue(CONCENTRATION);
  vi.mocked(api.worldMapSeries).mockResolvedValue(WORLD);
  vi.mocked(api.correlationGhgComposition).mockResolvedValue(COMPOSITION);
  vi.mocked(api.correlationScenarioTemperature).mockResolvedValue(SCENARIO_TEMPERATURE);
  vi.mocked(api.correlationMeta).mockResolvedValue(META);
  vi.mocked(api.correlationCountryShare).mockImplementation(async (o) => (o?.allCountries ? COUNTRY_SNAPSHOT : shareResponse([['USA', 'United States', [[1850, 4, 1], [2024, 24.1, 1]]]])));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

const mount = (hash = '') => render(<MemoryRouter initialEntries={[`/climate-correlation${hash}`]}><ClimateCorrelationPage /></MemoryRouter>);

describe('ClimateCorrelationPage — causal chain and headline relationship', () => {
  it('keeps the anchor row on one scrolling line on a phone (its links sit inside the scrolling part of a single-line row)', async () => {
    mount();
    const nav = await screen.findByRole('navigation', { name: 'On this page' });
    const row = nav.closest('[style*="position: sticky"]') as HTMLElement;
    expect(row.querySelector('.area2-anchor-line > .area2-anchor-scroll nav')).toBe(nav);
    expect(row.querySelector('style')!.textContent).toMatch(/\.area2-anchor-scroll nav ul \{ flex-wrap: nowrap !important/);
  });

  it('shows the intro, a sticky anchor row, the four-step chain and the headline relationship from the API', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: 'Climate Correlation' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Causal chain' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Global relationship' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['#causal-chain', '#global-relationship', '#recent-all-gas', '#gas-composition', '#method']);
    expect((nav.closest('[style*="position: sticky"]') as HTMLElement)).not.toBeNull();
    expect(within(document.querySelector('.module-chain') as HTMLElement).getAllByRole('listitem')[0]).toHaveTextContent('37,398 MtCO₂ in 2024'); // world total from the series, not typed in
    expect(screen.getByText('Fossil + cement only')).toBeInTheDocument();
    expect(api.correlationEmissionsTemperature).toHaveBeenCalledWith({ variant: 'fossil' });
    expect(document.getElementById('causal-chain')!.compareDocumentPosition(document.getElementById('global-relationship')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still shows the relationship, without the fossil comparison, when only that request fails; and the chain without its emissions figure', async () => {
    vi.mocked(api.correlationEmissionsTemperature).mockImplementation(async (o) => {
      if (o?.variant === 'fossil') throw new ApiError(503, 'x');
      return PAIR;
    });
    vi.mocked(api.worldMapSeries).mockRejectedValue(new ApiError(503, 'x'));
    mount();
    expect(await screen.findByRole('heading', { level: 2, name: 'Global relationship' })).toBeInTheDocument();
    expect(screen.queryByText('Fossil + cement only')).not.toBeInTheDocument();
    expect(within(document.querySelector('.module-chain') as HTMLElement).getAllByRole('listitem')[0].textContent).not.toMatch(/MtCO₂/);
  });

  it('shows the recent all-gas view after the headline, fetched as the PRIMAP source, and the headline caption points to it', async () => {
    mount();
    const gas = await screen.findByRole('heading', { level: 3, name: /^Recent all-gas relationship/ });
    expect(api.correlationEmissionsTemperature).toHaveBeenCalledWith({ source: 'primap_ghg' });
    expect(document.getElementById('global-relationship')!.compareDocumentPosition(gas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/separate chart below and is not called TCRE/)).toBeInTheDocument();
  });

  it('leaves the all-gas view out, and the caption sentence about it, when its request fails; the headline is unaffected', async () => {
    vi.mocked(api.correlationEmissionsTemperature).mockImplementation(async (o) => {
      if (o?.source === 'primap_ghg') throw new ApiError(503, 'x');
      return o?.variant === 'fossil' ? ({ ...PAIR, fit: { ...PAIR.fit, slope: 0.797 } } as never) : PAIR;
    });
    mount();
    expect(await screen.findByRole('heading', { level: 2, name: 'Global relationship' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: /Recent all-gas/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/separate chart below/)).not.toBeInTheDocument();
  });

  it('shows gas composition after the all-gas view, fetching composition from 1970, and says how it differs from the per-decade view', async () => {
    mount();
    const gas = await screen.findByRole('heading', { level: 3, name: /^Gas composition, 1970 onward/ });
    expect(api.correlationGhgComposition).toHaveBeenCalledWith({ startYear: 1970 });
    expect(document.getElementById('recent-all-gas')!.compareDocumentPosition(gas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/This is the global mix from PRIMAP-hist/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Country view by decade →' })).toHaveAttribute('href', '/historical#ghg-by-decade');
  });

  it('leaves out gas composition alone when its request fails, and the rest of the page still stands', async () => {
    vi.mocked(api.correlationGhgComposition).mockRejectedValue(new ApiError(503, 'x'));
    mount();
    expect(await screen.findByRole('heading', { level: 3, name: /^Recent all-gas relationship/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Gas composition/ })).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(nav).queryByRole('link', { name: 'Gas composition' })).not.toBeInTheDocument();
  });

  it('does not lose the chain and relationship when only the optional 5-year-mean request fails', async () => {
    vi.mocked(api.correlationTemperature).mockImplementation(async (o) => {
      if (o?.view === 'mean5y') throw new ApiError(503, 'x');
      return TEMPERATURE;
    });
    mount();
    expect(await screen.findByRole('heading', { level: 2, name: 'Global relationship' })).toBeInTheDocument();
    expect(screen.queryByText(/climate data is unavailable/)).not.toBeInTheDocument();
  });

  it('uses the latest year that has data when the final map row is all null, never a zero total', async () => {
    vi.mocked(api.worldMapSeries).mockResolvedValue({ ...WORLD, years: [2023, 2024, 2025], values: [...WORLD.values, [null, null]] });
    mount();
    await screen.findByRole('heading', { level: 2, name: 'Causal chain' });
    const first = within(document.querySelector('.module-chain') as HTMLElement).getAllByRole('listitem')[0];
    expect(first).toHaveTextContent('37,398 MtCO₂ in 2024');
    expect(first.textContent).not.toMatch(/\b0 MtCO₂/);
  });

  it('says the climate data is unavailable once, and omits the chain and relationship, when the headline request fails -- the independent sections still stand', async () => {
    vi.mocked(api.correlationEmissionsTemperature).mockImplementation(async (o) => {
      if (o?.source === 'primap_ghg') return ALL_GAS_PAIR;
      throw new ApiError(503, 'x');
    });
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/climate data is unavailable right now/);
    expect(screen.queryByRole('heading', { level: 2, name: 'Causal chain' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    // all-gas and composition do not depend on the headline signal
    expect(await screen.findByRole('heading', { level: 3, name: /^Recent all-gas relationship/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /^Gas composition/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Global relationship' })).toBeInTheDocument(); // a parent heading for the orphaned sections
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['#recent-all-gas', '#gas-composition', '#method']); // the chain and relationship links are gone; the independent sections' remain
  });

  it('ends with a short method note that links to Methods & data, and no longer carries the methodology, the sources or the derivation', async () => {
    mount();
    await screen.findByRole('heading', { level: 3, name: /^Gas composition/ });
    const link = screen.getByRole('link', { name: 'Method →' });
    expect(link).toHaveAttribute('href', '/about#correlation');
    expect(screen.queryByRole('heading', { name: 'Methodology & sources' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'How this number was derived' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Sources' })).not.toBeInTheDocument();
    expect(document.getElementById('methodology')).toBeNull();
    expect(api.correlationMeta).not.toHaveBeenCalled();
  });

  it('asks for the temperature series once each (annual and 5-year mean), and no longer draws a country view or the scenarios', async () => {
    mount();
    await screen.findByRole('heading', { level: 2, name: 'Causal chain' });
    expect(screen.queryByRole('heading', { name: 'Country view' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Implied temperature by scenario/ })).not.toBeInTheDocument();
    expect(api.correlationScenarioTemperature).not.toHaveBeenCalled();
    expect(api.correlationCountryShare).not.toHaveBeenCalled();
    const calls = vi.mocked(api.correlationTemperature).mock.calls.map((c) => c[0]?.view ?? 'annual');
    expect(calls.sort()).toEqual(['annual', 'mean5y']);
  });

  it('keeps gas composition when only the fossil comparison fails', async () => {
    vi.mocked(api.correlationEmissionsTemperature).mockImplementation(async (o) => {
      if (o?.variant === 'fossil') throw new ApiError(503, 'x');
      return o?.source === 'primap_ghg' ? ALL_GAS_PAIR : PAIR;
    });
    mount();
    expect(await screen.findByRole('heading', { level: 3, name: /^Gas composition/ })).toBeInTheDocument();
  });

  it('a #global-relationship deep link jumps once the section exists, after the anchor row has been measured', async () => {
    window.history.replaceState(null, '', '/climate-correlation#global-relationship');
    mount('#global-relationship');
    await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith('global-relationship'));
    expect(document.getElementById('global-relationship')).not.toBeNull();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('a #method deep link waits for the fossil comparison and the world total, which change the height above the note, then jumps once', async () => {
    window.history.replaceState(null, '', '/climate-correlation#method');
    let fossil!: (r: typeof PAIR) => void;
    vi.mocked(api.correlationEmissionsTemperature).mockImplementation((o) => (o?.variant === 'fossil' ? new Promise((r) => { fossil = r as never; }) : Promise.resolve(o?.source === 'primap_ghg' ? ALL_GAS_PAIR : PAIR)) as never);
    mount('#method');
    await screen.findByRole('heading', { level: 3, name: /^Gas composition/ });
    await new Promise((r) => setTimeout(r, 50));
    expect(scrollSpy).not.toHaveBeenCalled();
    await act(async () => fossil(PAIR));
    await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalledWith('method'));
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('offsets jump targets by the measured height of the sticky row', async () => {
    // The shell's pinned bar (68px) sits outside the canvas; the page's own pinned row (90px) inside it.
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: this.dataset.testid === 'shell-bar' ? 68 : this.style.position === 'sticky' ? 90 : 0 } as DOMRect;
    });
    render(
      <MemoryRouter initialEntries={['/climate-correlation']}>
        <div data-testid="shell-bar" data-syn-sticky="top" style={{ position: 'sticky' }} />
        <div id="content"><ClimateCorrelationPage /></div>
      </MemoryRouter>,
    );
    await screen.findByRole('navigation', { name: 'On this page' });
    await vi.waitFor(() => expect(document.querySelector('.climate-module style')?.textContent).toMatch(/scroll-margin-top: 168px/));
    rect.mockRestore();
    await act(async () => {});
  });
});

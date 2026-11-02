import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { ApiError } from '../../api/types';
import type { CorrelationCountryShareResponse } from '../../api/correlationTypes';
import { StockStories } from './StockStories';

vi.mock('../../api/client', () => ({ api: { correlationCountryShare: vi.fn() } }));

type R = [string, number, number, number | null, number | null];
const ranking = (rows: R[]) => ({ cumulative_from: 1750, rows: rows.map(([country, cumulative_mt, share_pct, annual_mt, annual_share_pct], i) => ({ rank: i + 1, country, name: `${country} land`, cumulative_mt, share_pct, annual_mt, annual_share_pct })), series: [] }) as unknown as CorrelationCountryShareResponse;
const LATEST = ranking([['USA', 435000, 23.5, 4900, 12.7], ['CHN', 285000, 15.4, 12300, 31.8], ['IND', 66000, 3.6, 3200, 8.3], ['DEU', 95000, 5.1, 600, 1.6]]);
const BASELINE = ranking([['USA', 248000, 28, 5100, 22], ['CHN', 43000, 6, 2400, 10], ['IND', 11000, 1, 600, 3], ['DEU', 80000, 9, 1000, 4]]);
const SERIES = (countries: string[]) => ({ series: countries.map((country) => ({ country, points: [{ year: 1950, cumulative_mt: 5000 }, { year: 1990, cumulative_mt: 100000 }, { year: 2024, cumulative_mt: 300000 }] })) }) as unknown as CorrelationCountryShareResponse;

function mockApi(latest: CorrelationCountryShareResponse | Error = LATEST, baseline: CorrelationCountryShareResponse | Error = BASELINE) {
  vi.mocked(api.correlationCountryShare).mockImplementation(async (o) => {
    if (o?.countries) return SERIES(o.countries);
    const r = o?.year === 2024 ? latest : baseline;
    if (r instanceof Error) throw r;
    return r;
  });
}
afterEach(() => vi.clearAllMocks());

describe('StockStories', () => {
  it('renders the heading, legend, four cards and footer from the rankings', async () => {
    mockApi();
    render(<StockStories latestYear={2024} baselineYear={1990} />);
    expect(await screen.findByRole('heading', { name: 'The stock keeps growing' })).toBeInTheDocument();
    expect(screen.getByText(/Four countries, four paths since 1990\./)).toBeInTheDocument();
    expect(screen.getByText('Share of all CO₂ since 1750')).toBeInTheDocument();
    expect(screen.getByText('Share of 2024 emissions')).toBeInTheDocument();
    const cards = screen.getAllByRole('article');
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['USA land', 'CHN land', 'IND land', 'DEU land']);
    expect(within(cards[0]).getByText('Built the stock')).toBeInTheDocument();
    expect(within(cards[0]).getByText('23.5%')).toBeInTheDocument();
    expect(within(cards[0]).getByText('12.7%')).toBeInTheDocument();
    expect(within(cards[0]).getByText('+75%')).toBeInTheDocument();
    expect(within(cards[0]).getByText(/yearly emissions −4%/)).toBeInTheDocument();
    expect(within(cards[1]).getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('Fossil-fuel and industry CO₂, cumulative since 1750 (OWID / Global Carbon Project). Shares of the world total, 2024.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How the ranking changed since 1990 ↓' })).toHaveAttribute('href', '#race-heading');
  });

  it('draws each curve from the real series, marking the baseline and ending on the latest Gt', async () => {
    mockApi();
    render(<StockStories latestYear={2024} baselineYear={1990} />);
    const curve = await screen.findAllByRole('img', { name: /cumulative CO₂, 1950 to 2024: 300 Gt at the end/ });
    expect(curve).toHaveLength(4);
    expect(screen.getAllByText('2024 · 300 Gt')).toHaveLength(4);
    expect(vi.mocked(api.correlationCountryShare)).toHaveBeenCalledWith({ countries: ['USA', 'CHN', 'IND', 'DEU'], startYear: 1950 });
  });

  it('keeps a card but leaves off its key figure when the baseline ranking is unavailable', async () => {
    mockApi(LATEST, new ApiError(503, 'unavailable'));
    render(<StockStories latestYear={2024} baselineYear={1990} />);
    const cards = await screen.findAllByRole('article');
    expect(cards.length).toBeGreaterThan(0);
    expect(within(cards[0]).getByText('23.5%')).toBeInTheDocument();
    expect(within(cards[0]).queryByText(/growth of its stock/)).not.toBeInTheDocument();
  });

  it('keeps the cards when only the curves fail', async () => {
    vi.mocked(api.correlationCountryShare).mockImplementation(async (o) => {
      if (o?.countries) throw new ApiError(503, 'unavailable');
      return o?.year === 2024 ? LATEST : BASELINE;
    });
    render(<StockStories latestYear={2024} baselineYear={1990} />);
    expect(await screen.findAllByRole('article')).toHaveLength(4);
    expect(screen.queryByRole('img', { name: /cumulative CO₂, 1950/ })).not.toBeInTheDocument();
  });

  it('renders nothing when the latest ranking is unavailable', async () => {
    mockApi(new ApiError(503, 'unavailable'));
    const { container } = render(<StockStories latestYear={2024} baselineYear={1990} />);
    await vi.waitFor(() => expect(api.correlationCountryShare).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });
});

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildComposition } from '../../lib/gasComposition';
import { COMPOSITION } from '../../test/climateFixtures';
import { GasComposition } from './GasComposition';

vi.mock('@syena/ds', async (orig) => ({
  ...(await orig<typeof import('@syena/ds')>()),
  Chart: (p: { ariaLabel?: string; stackedAreaMode?: string; series: Array<{ name: string; kind?: string; color?: string; y: Array<number | null> }> }) => (
    <div data-testid="chart" aria-label={p.ariaLabel} data-stacked={p.stackedAreaMode} data-series={JSON.stringify(p.series.map((s) => [s.name, s.kind, s.color]))} />
  ),
}));

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const dense = () => {
  const c = JSON.parse(JSON.stringify(COMPOSITION));
  const base = c.years[2];
  c.years = [2021, 2022, 2023, 2024].map((year, i) => ({ ...base, year, values: base.values.map((v: { mtco2e: number }) => ({ ...v, mtco2e: v.mtco2e * (1 + i / 10) })) }));
  return buildComposition(c)!;
};

// The slider is a native range input: the browser answers an arrow key with a change event one step away, which is what these send.
const step = (slider: HTMLElement, by: number) => fireEvent.change(slider, { target: { value: String(Number((slider as HTMLInputElement).value) + by) } });

describe('GasComposition', () => {
  it('draws a 100%-stacked area with one coloured series per gas, and the latest year\'s split with its table', () => {
    render(<MemoryRouter><GasComposition composition={buildComposition(COMPOSITION)!} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 3, name: 'Gas composition, 1970 onward' })).toBeInTheDocument();
    const chart = screen.getByTestId('chart');
    expect(chart).toHaveAttribute('data-stacked', 'percent');
    expect(JSON.parse(chart.getAttribute('data-series')!).map((s: string[]) => [s[0], s[1]])).toEqual([['CO₂', 'area'], ['CH₄', 'area'], ['N₂O', 'area'], ['Fluorinated gases', 'area']]);
    expect(screen.getByText('Greenhouse gases by share, 2024')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /^CO₂/ });
    expect(within(row).getByText('75.1%')).toBeInTheDocument();
    expect(within(row).getByText('37,974')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Gas split: CO₂ 75\.1%/ })).toBeInTheDocument();
  });

  it('the baseline chip gives the source data range (requirements §2.5), not a source name', () => {
    render(<MemoryRouter><GasComposition composition={buildComposition(COMPOSITION)!} /></MemoryRouter>);
    expect(screen.getByText('Baseline none · shares of each year · 1970–2024')).toBeInTheDocument();
  });

  it('discloses how far the four gases sit from PRIMAP-hist\'s own national total, for the year shown', () => {
    render(<MemoryRouter><GasComposition composition={buildComposition(COMPOSITION)!} /></MemoryRouter>);
    expect(screen.getByText(/Together they sit 0\.05% above PRIMAP-hist's own national total for 2024 \(largest gap in any year 0\.21%, held to within 1%\)/)).toBeInTheDocument();
  });

  it('states the API\'s basis and the incomplete year it left out, with the caveats behind a disclosure and no licences', () => {
    render(<MemoryRouter><GasComposition composition={buildComposition(COMPOSITION)!} /></MemoryRouter>);
    expect(screen.getByText(/AR5 100-year global-warming potentials/)).toBeInTheDocument();
    expect(screen.getByText(/Incomplete trailing year left out: 2025/)).toBeInTheDocument();
    expect(screen.getAllByText(/2025/)).toHaveLength(1); // stated once, not again in the disclosure
    const details = screen.getByText('What this covers, and what it leaves out').closest('details') as HTMLElement;
    expect(within(details).getByText(/excludes deforestation/)).toBeInTheDocument();
    expect(within(details).queryByText(/licence/i)).not.toBeInTheDocument();
  });

  it('the keyboard can cross a missing year: a step lands on the next available year in the direction of travel', () => {
    const c = JSON.parse(JSON.stringify(COMPOSITION));
    const base = c.years[2];
    c.years = [2020, 2021, 2023, 2024].map((year) => ({ ...base, year })); // 2022 has no full split
    render(<MemoryRouter><GasComposition composition={buildComposition(c)!} /></MemoryRouter>);
    const slider = screen.getByRole('slider');
    step(slider, -1);
    expect(screen.getByText('Greenhouse gases by share, 2023')).toBeInTheDocument();
    step(slider, -1); // 2022 is missing: it must go on to 2021, not stay on 2023
    expect(screen.getByText('Greenhouse gases by share, 2021')).toBeInTheDocument();
    step(slider, 1);
    expect(screen.getByText('Greenhouse gases by share, 2023')).toBeInTheDocument();
  });

  it('the gas split bar announces only the four gases, with no phantom remainder category', () => {
    render(<MemoryRouter><GasComposition composition={buildComposition(COMPOSITION)!} /></MemoryRouter>);
    const bar = screen.getByRole('img', { name: /^Gas split:/ });
    expect(bar.getAttribute('aria-label')).toMatch(/CO₂ 75\.1%, CH₄ 16\.7%, N₂O 5\.4%, Fluorinated gases 2\.8%$/);
    expect(bar.getAttribute('aria-label')).not.toMatch(/Rest of world/);
    expect(bar.children).toHaveLength(4);
  });

  it('moves the split with the year slider, onto the nearest year that has data', () => {
    render(<MemoryRouter><GasComposition composition={dense()} /></MemoryRouter>);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('max', '2024');
    step(slider, -1);
    expect(screen.getByText('Greenhouse gases by share, 2023')).toBeInTheDocument();
  });

  it('says which source it is and why it differs from the per-decade view, linking to it; an answer embedded elsewhere carries no link', () => {
    const { unmount } = render(<MemoryRouter><GasComposition composition={buildComposition(COMPOSITION)!} /></MemoryRouter>);
    expect(screen.getByText(/This is the global mix from PRIMAP-hist, since \d{4}\. Historical Trends shows a per-decade mix for the countries you select, from OWID; the two differ in scope and method\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Country view by decade →' })).toHaveAttribute('href', '/historical#ghg-by-decade');
    unmount();
    render(<MemoryRouter><GasComposition composition={buildComposition(COMPOSITION)!} embedded /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Country view by decade →' })).not.toBeInTheDocument();
  });

  it('puts that line on the page surface, after the chart card, since the card\'s panel stays dark and the link colour is for the page', () => {
    render(<MemoryRouter><GasComposition composition={buildComposition(COMPOSITION)!} /></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Country view by decade →' });
    const inCard = screen.getByText('What this covers, and what it leaves out'); // the last thing inside the card
    expect(inCard.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.closest('details')).toBeNull();
  });
});

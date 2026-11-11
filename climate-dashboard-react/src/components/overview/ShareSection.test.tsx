import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { ApiError } from '../../api/types';
import { shareResponse } from '../../test/shareFixtures';
import { ShareSection } from './ShareSection';

vi.mock('../../api/client', () => ({ api: { correlationCountryShare: vi.fn() } }));

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
}

const RESP = shareResponse([
  ['CHN', 'China', [[2022, 14, 30], [2023, 15, 31], [2024, 16, 32]]],
  ['USA', 'United States', [[2022, 24.5, 13.5], [2023, 24.2, 13.2], [2024, 24, 13]]],
]);

beforeEach(() => {
  mockReducedMotion(false);
  vi.mocked(api.correlationCountryShare).mockResolvedValue(RESP);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

const mount = (countries = ['CHN', 'USA'], year = 2024, pagePlaying = false) => render(<ShareSection countries={countries} year={year} pagePlaying={pagePlaying} />);
const tableCell = (row: string, col: number) => within(screen.getByRole('row', { name: new RegExp(`^${row}`) })).getAllByRole('cell')[col].textContent;

describe('ShareSection', () => {
  it('asks for the selected countries from 1970 and shows stock and flow at the latest year, with Rest of world as the remainder', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 2, name: /^Who emitted the stock, and who emits now/ })).toBeInTheDocument();
    expect(api.correlationCountryShare).toHaveBeenCalledWith({ source: 'owid_co2', gasScope: 'co2', countries: ['CHN', 'USA'], startYear: 1970 });
    expect(await screen.findByText('Share by country, 2024')).toBeInTheDocument();
    expect(tableCell('United States', 0)).toBe('24.0%');
    expect(tableCell('United States', 1)).toBe('13.0%');
    expect(tableCell('China', 0)).toBe('16.0%');
    expect(tableCell('Rest of world', 0)).toBe('60.0%');
    expect(tableCell('Rest of world', 1)).toBe('55.0%');
    expect(screen.getByRole('img', { name: /^The stock: United States 24.0%, China 16.0%, Rest of world 60.0%$/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^The flow: United States 13.0%, China 32.0%, Rest of world 55.0%$/ })).toBeInTheDocument();
    expect(screen.getByText('Cumulative 1750–2024')).toBeInTheDocument();
    expect(screen.getByText(/no warming is attributed to a country/)).toBeInTheDocument();
  });

  it('shows the page year (badge, readout and bars) and has no slider of its own', async () => {
    mount(['CHN', 'USA'], 2023);
    expect(await screen.findByText('Share by country, 2023')).toBeInTheDocument();
    // the year is in the card's title and in the readout beside Replay (the header badge the section once carried is gone)
    expect(screen.getByText('page year')).toBeInTheDocument();
    expect(screen.getByText('page year').nextElementSibling).toHaveTextContent('2023');
    expect(tableCell('China', 0)).toBe('15.0%');
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.getByText('Cumulative 1750–2023')).toBeInTheDocument();
  });

  it('follows a changed page year', async () => {
    const { rerender } = mount(['CHN', 'USA'], 2024);
    await screen.findByText('Share by country, 2024');
    rerender(<ShareSection countries={['CHN', 'USA']} year={2022} pagePlaying={false} />);
    expect(screen.getByText('Share by country, 2022')).toBeInTheDocument();
  });

  it('Replay animates from the first year to the page year at 250 ms a year, marked temporary, then returns to the page year', async () => {
    vi.useFakeTimers();
    mount(['CHN', 'USA'], 2024);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    fireEvent.click(screen.getByRole('button', { name: '▶ Replay 2022 → 2024' }));
    expect(screen.getByText('Share by country, 2022')).toBeInTheDocument();
    expect(screen.getByText('replaying · temporary')).toBeInTheDocument();
    expect(tableCell('China', 0)).toBe('14.0%');
    expect(screen.getByRole('button', { name: '■ Stop replay' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(screen.getByText('Share by country, 2023')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(screen.getByText('Share by country, 2024')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(screen.queryByText('replaying · temporary')).not.toBeInTheDocument();
    expect(screen.getByText('page year')).toBeInTheDocument();
    expect(screen.getByText('Share by country, 2024')).toBeInTheDocument();
    // segment order stays fixed throughout
    const rows = screen.getAllByRole('row').map((r) => r.textContent ?? '');
    expect(rows.findIndex((t) => t.startsWith('United States'))).toBeLessThan(rows.findIndex((t) => t.startsWith('China')));
  });

  it('Stop replay returns to the page year at once', async () => {
    mount(['CHN', 'USA'], 2024);
    await screen.findByText('Share by country, 2024');
    fireEvent.click(screen.getByRole('button', { name: '▶ Replay 2022 → 2024' }));
    expect(screen.getByText('Share by country, 2022')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '■ Stop replay' }));
    expect(screen.getByText('Share by country, 2024')).toBeInTheDocument();
    expect(screen.getByText('page year')).toBeInTheDocument();
  });

  it('a replay is cancelled when the page year changes or the page\'s own Play starts, and nothing else is touched', async () => {
    const { rerender } = mount(['CHN', 'USA'], 2024);
    await screen.findByText('Share by country, 2024');
    fireEvent.click(screen.getByRole('button', { name: '▶ Replay 2022 → 2024' }));
    expect(screen.getByText('replaying · temporary')).toBeInTheDocument();
    rerender(<ShareSection countries={['CHN', 'USA']} year={2023} pagePlaying={false} />);
    expect(screen.queryByText('replaying · temporary')).not.toBeInTheDocument();
    expect(screen.getByText('Share by country, 2023')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '▶ Replay 2022 → 2023' }));
    expect(screen.getByText('replaying · temporary')).toBeInTheDocument();
    rerender(<ShareSection countries={['CHN', 'USA']} year={2023} pagePlaying />);
    expect(screen.queryByText('replaying · temporary')).not.toBeInTheDocument();
  });

  it('has nothing to replay when the page year is the first year', async () => {
    mount(['CHN', 'USA'], 2022);
    await screen.findByText('Share by country, 2022');
    expect(screen.getByRole('button', { name: '▶ Replay 2022 → 2022' })).toBeDisabled();
  });

  it('refetches with the chosen measure\'s source and gas scope', async () => {
    mount();
    await screen.findByText('Share by country, 2024');
    fireEvent.click(screen.getByRole('radio', { name: 'All GHGs · PRIMAP-hist' }));
    await screen.findByText('Share by country, 2024');
    expect(api.correlationCountryShare).toHaveBeenLastCalledWith({ source: 'primap_hist', gasScope: 'total_ghg', countries: ['CHN', 'USA'], startYear: 1970 });
    fireEvent.click(screen.getByRole('radio', { name: 'CO₂ · PRIMAP-hist' }));
    await screen.findByText('Share by country, 2024');
    expect(api.correlationCountryShare).toHaveBeenLastCalledWith({ source: 'primap_hist', gasScope: 'co2', countries: ['CHN', 'USA'], startYear: 1970 });
  });

  it('asks for a selection instead of requesting anything when no country is selected', () => {
    mount([]);
    expect(screen.getByText('Select countries in the picker below to compare their shares.')).toBeInTheDocument();
    expect(api.correlationCountryShare).not.toHaveBeenCalled();
    expect(document.getElementById('share')).not.toBeNull(); // still a real jump target
  });

  it('omits the flow bar and column, with a note, when the annual shares are not published yet', async () => {
    vi.mocked(api.correlationCountryShare).mockResolvedValue(shareResponse([['USA', 'United States', [[2023, 24.2, null], [2024, 24, null]]]]));
    mount(['USA']);
    expect(await screen.findByText(/annual \(flow\) shares are not published yet/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^The flow/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Flow' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^The stock/ })).toBeInTheDocument();
  });

  it('draws the table only, with a warning, when a published share is negative', async () => {
    vi.mocked(api.correlationCountryShare).mockResolvedValue(shareResponse([
      ['USA', 'United States', [[2023, 24, 13], [2024, 23, -1]]], ['CHN', 'China', [[2023, 15, 30], [2024, 16, 10]]],
    ]));
    mount();
    expect(await screen.findByText(/negative \(a recorded data deviation\)/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^The (stock|flow)/ })).not.toBeInTheDocument();
    expect(await screen.findByText('Share by country, 2024')).toBeInTheDocument();
    expect(tableCell('United States', 1)).toBe('-1.0%');
  });

  it('names a country with no data in the measure and leaves it out rather than showing 0.0%', async () => {
    vi.mocked(api.correlationCountryShare).mockResolvedValue({
      ...shareResponse([['USA', 'United States', [[2023, 24, 13], [2024, 23, 12]]], ['TWN', 'Taiwan', []]]),
      notes: ['no PRIMAP-hist rows for TWN'],
    });
    mount(['USA', 'TWN']);
    expect(await screen.findByText(/No data in this measure for Taiwan; it is left out\. no PRIMAP-hist rows for TWN/)).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /^Taiwan/ })).not.toBeInTheDocument();
  });

  it('hides the previous response while a new measure loads, never presenting old data as the new', async () => {
    mount();
    await screen.findByText('Share by country, 2024');
    let resolve!: (r: typeof RESP) => void;
    vi.mocked(api.correlationCountryShare).mockReturnValue(new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByRole('radio', { name: 'All GHGs · PRIMAP-hist' }));
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Share by country, 2024')).not.toBeInTheDocument();
    await act(async () => resolve(RESP));
    expect(await screen.findByText('Share by country, 2024')).toBeInTheDocument();
  });

  it('describes the measure neutrally, not as CO₂', async () => {
    mount();
    expect(await screen.findByText(/everything emitted so far, by the measure chosen below/)).toBeInTheDocument();
    expect(screen.queryByText(/all CO₂ emitted/)).not.toBeInTheDocument();
  });

  it('shows the API\'s own message when the request fails', async () => {
    vi.mocked(api.correlationCountryShare).mockRejectedValue(new ApiError(404, 'unknown country code(s): XYZ'));
    mount(['XYZ']);
    expect(await screen.findByText(/unknown country code\(s\): XYZ/)).toBeInTheDocument();
  });

  it('tweens the segments, except under reduced motion', async () => {
    mount();
    const flex = () => (screen.getByRole('img', { name: /^The stock/ }).firstElementChild as HTMLElement).style.transition;
    await screen.findByText('Share by country, 2024');
    expect(flex()).toContain('250ms');
    cleanup();
    mockReducedMotion(true);
    mount();
    await screen.findByText('Share by country, 2024');
    expect(flex()).toBe('none');
  });
});

describe('ShareBar read-out (SPEC.md §5.36)', () => {
  // GBR's flow is 0.8%: under 3%, so it has no inline label and only the read-out names it.
  const WITH_GBR = shareResponse([
    ['CHN', 'China', [[2022, 14, 30], [2023, 15, 31], [2024, 16, 32]]],
    ['USA', 'United States', [[2022, 24.5, 13.5], [2023, 24.2, 13.2], [2024, 24, 13]]],
    ['GBR', 'United Kingdom', [[2022, 4.6, 0.9], [2023, 4.5, 0.8], [2024, 4.4, 0.8]]],
  ]);
  const bar = (name: 'stock' | 'flow') => screen.getByRole('img', { name: new RegExp(`^The ${name}:`) });
  const seg = (name: 'stock' | 'flow', code: string) => bar(name).querySelector(`[data-code="${code}"]`) as HTMLElement;
  const row = (name: 'stock' | 'flow') => bar(name).closest('.share-bar-row') as HTMLElement;
  const live = (name: 'stock' | 'flow') => row(name).querySelector('[aria-live="polite"]') as HTMLElement;
  const ready = async (resp = WITH_GBR, countries = ['CHN', 'USA', 'GBR']) => {
    vi.mocked(api.correlationCountryShare).mockResolvedValue(resp);
    const r = mount(countries);
    await screen.findByText('Share by country, 2024');
    return r;
  };

  it('names an unlabelled sliver with its country, share and what it is of, outlined, and Rest of world too', async () => {
    await ready();
    expect(seg('flow', 'GBR').textContent).toBe('');
    fireEvent.click(seg('flow', 'GBR'));
    expect(within(row('flow')).getByText('United Kingdom · 0.8% of 2024 CO₂ emissions')).toBeInTheDocument();
    expect(seg('flow', 'GBR').style.outline).toContain('2px solid');
    fireEvent.click(seg('stock', 'rest'));
    expect(within(row('stock')).getByText('Rest of world · 55.6% of cumulative CO₂ since 1750')).toBeInTheDocument();
  });

  it('shows on mouse hover and clears when the mouse leaves, unless pinned; hover is never announced', async () => {
    await ready();
    fireEvent.pointerEnter(seg('flow', 'CHN'), { pointerType: 'mouse' });
    expect(within(row('flow')).getByText('China · 32.0% of 2024 CO₂ emissions')).toBeInTheDocument();
    expect(live('flow').textContent).toBe('');
    expect(within(row('flow')).queryByRole('button', { name: 'Next country' })).toBeNull(); // stepping only once pinned
    fireEvent.pointerLeave(bar('flow'), { pointerType: 'mouse' });
    expect(within(row('flow')).getByText('Hover or click a segment to see its share')).toBeInTheDocument();
  });

  it('dismisses a pinned read-out by tapping it again, tapping outside, Escape, or the clear button', async () => {
    await ready();
    const hint = () => within(row('flow')).queryByText('Hover or click a segment to see its share');
    fireEvent.click(seg('flow', 'GBR'));
    fireEvent.click(seg('flow', 'GBR'));
    expect(hint()).toBeInTheDocument();
    fireEvent.click(seg('flow', 'GBR'));
    fireEvent.pointerDown(document.body);
    expect(hint()).toBeInTheDocument();
    fireEvent.click(seg('flow', 'GBR'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(hint()).toBeInTheDocument();
    fireEvent.click(seg('flow', 'GBR'));
    fireEvent.click(within(row('flow')).getByRole('button', { name: 'Clear selection' }));
    expect(hint()).toBeInTheDocument();
  });

  it('steps with ‹ › in bar order to Rest of world, stops at both ends, and announces each step politely', async () => {
    await ready();
    // bar order is by stock: United States, China, United Kingdom, Rest of world
    fireEvent.click(seg('flow', 'USA'));
    const prev = within(row('flow')).getByRole('button', { name: 'Previous country' });
    const next = within(row('flow')).getByRole('button', { name: 'Next country' });
    expect(prev).toBeDisabled();
    fireEvent.click(next);
    fireEvent.click(next);
    expect(within(row('flow')).getAllByText('United Kingdom · 0.8% of 2024 CO₂ emissions')).toHaveLength(2); // shown, and in the live region
    expect(live('flow').textContent).toBe('United Kingdom · 0.8% of 2024 CO₂ emissions');
    fireEvent.click(next);
    expect(live('flow').textContent).toBe('Rest of world · 54.2% of 2024 CO₂ emissions');
    expect(next).toBeDisabled(); // no wrap to the first segment
  });

  it('takes its phrase from the measure', async () => {
    await ready();
    fireEvent.click(screen.getByRole('radio', { name: 'All GHGs · PRIMAP-hist' }));
    await screen.findByText('Share by country, 2024');
    fireEvent.click(seg('flow', 'CHN'));
    expect(within(row('flow')).getByText('China · 32.0% of 2024 greenhouse-gas emissions')).toBeInTheDocument();
    fireEvent.click(seg('stock', 'CHN'));
    expect(within(row('stock')).getByText('China · 16.0% of cumulative greenhouse-gas emissions since 1750')).toBeInTheDocument();
  });

  it('gives the touch hint by input type (pointer: coarse), not by width', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    await ready();
    expect(within(row('flow')).getByText('Tap a segment to see its share, then use ‹ › to step')).toBeInTheDocument();
  });

  it('follows the live value through a replay, and closes when the selected country leaves the bar', async () => {
    vi.useFakeTimers();
    vi.mocked(api.correlationCountryShare).mockResolvedValue(WITH_GBR);
    const { rerender } = mount(['CHN', 'USA', 'GBR']);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    fireEvent.click(seg('stock', 'CHN'));
    // Replay is in the same section: pressing it keeps the pinned read-out open
    fireEvent.pointerDown(screen.getByRole('button', { name: '▶ Replay 2022 → 2024' }));
    fireEvent.click(screen.getByRole('button', { name: '▶ Replay 2022 → 2024' }));
    expect(within(row('stock')).getByText('China · 14.0% of cumulative CO₂ since 1750')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(within(row('stock')).getByText('China · 15.0% of cumulative CO₂ since 1750')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    vi.mocked(api.correlationCountryShare).mockResolvedValue(shareResponse([['USA', 'United States', [[2024, 24, 13]]]]));
    rerender(<ShareSection countries={['USA']} year={2024} pagePlaying={false} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(within(row('stock')).queryByText(/^China ·/)).toBeNull();
    expect(within(row('stock')).getByText('Hover or click a segment to see its share')).toBeInTheDocument();
  });
});

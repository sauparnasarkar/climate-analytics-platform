import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldMapTimeSeries } from '../../api/types';
import { RankRace } from './RankRace';

// Cumulative CO₂ in Mt (the Overview's Cumulative map builds the same numbers), shown in Gt.
const MAP: WorldMapTimeSeries = {
  iso_codes: ['AAA', 'BBB', 'CCC'],
  countries: ['Alpha', 'Beta', 'Gamma'],
  years: [2000, 2001, 2002],
  // Beta overtakes Alpha in 2002.
  values: [[100000, 50000, 10000], [100000, 90000, 10000], [100000, 300000, 10000]],
  value_range: [10000, 300000],
};
const WORLD = [160000, 200000, 410000];

let reduced = false;
let mqlListeners: Array<(e: { matches: boolean }) => void> = [];
let ioCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  ioCallback = null;
  mqlListeners = [];
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduced && q === '(prefers-reduced-motion: reduce)', media: q,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { mqlListeners.push(cb); },
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { mqlListeners = mqlListeners.filter((l) => l !== cb); },
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null,
  }));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) { ioCallback = cb; }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const mount = () => render(<MemoryRouter><RankRace series={MAP} worldTotals={WORLD} cumulativeFrom={1750} /></MemoryRouter>);
const rankingWithShares = () => within(screen.getByRole('list', { name: /largest cumulative emitters in/i })).getAllByRole('listitem').map((li) => li.textContent);
// order and value only: the existing race tests are about the ranking, not the shares (those have their own tests below)
const ranking = () => rankingWithShares().map((t) => t!.replace(/ GtCO₂( \(.*\))?$/, ''));

describe('RankRace', () => {
  it('starts on the final year, in real rank order, with the share of the world total', () => {
    mount();
    expect(ranking()).toEqual(['Beta: 300', 'Alpha: 100', 'Gamma: 10']);
    expect(screen.getByRole('heading', { name: '10 countries, 100% of all CO₂ emitted since 1750' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replay 2000 → 2002' })).toBeInTheDocument();
  });

  it('autoplays once when scrolled into view: restarts at the first year, re-ranks, stops at the end', () => {
    mount();
    act(() => ioCallback!([{ isIntersecting: true }]));
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 50', 'Gamma: 10']); // 2000
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(550); });
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 90', 'Gamma: 10']); // 2001
    act(() => { vi.advanceTimersByTime(550); });
    expect(ranking()).toEqual(['Beta: 300', 'Alpha: 100', 'Gamma: 10']); // 2002: Beta overtakes
    act(() => { vi.advanceTimersByTime(550); });
    expect(screen.getByRole('button', { name: 'Replay 2000 → 2002' })).toBeInTheDocument();
    // A second intersection never restarts it on its own.
    act(() => ioCallback!([{ isIntersecting: true }]));
    expect(screen.getByRole('button', { name: /Replay/ })).toBeInTheDocument();
  });

  it('Pause stops the clock and Replay restarts from the first year', () => {
    mount();
    act(() => ioCallback!([{ isIntersecting: true }]));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 50', 'Gamma: 10']); // frozen at 2000
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => { vi.advanceTimersByTime(550); });
    expect(ranking()[1]).toBe('Beta: 90');
  });

  it('under reduced motion: no autoplay, but Play works (user-initiated) and a year slider is offered too', () => {
    reduced = true;
    mount();
    expect(ioCallback).toBeNull(); // never even observes, so nothing autoplays
    expect(ranking()).toEqual(['Beta: 300', 'Alpha: 100', 'Gamma: 10']);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ranking()).toEqual(['Beta: 300', 'Alpha: 100', 'Gamma: 10']); // static until asked

    // The button is present and enabled; pressing it plays from the first year, one step per tick.
    const play = screen.getByRole('button', { name: 'Replay 2000 → 2002' });
    expect(play).toBeEnabled();
    fireEvent.click(play);
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 50', 'Gamma: 10']); // 2000
    act(() => { vi.advanceTimersByTime(550); });
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 90', 'Gamma: 10']); // 2001

    // The slider still scrubs (a native range input: the browser's Home key is a change to its first value), and scrubbing pauses playback.
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2000' } });
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 50', 'Gamma: 10']); // stayed at 2000
  });

  it('stops autoplay and snaps to the final year if reduced motion turns on mid-race', () => {
    mount();
    act(() => ioCallback!([{ isIntersecting: true }]));
    act(() => { vi.advanceTimersByTime(550); });
    expect(ranking()[1]).toBe('Beta: 90'); // 2001, still racing
    reduced = true;
    act(() => { mqlListeners.forEach((l) => l({ matches: true })); });
    expect(ranking()).toEqual(['Beta: 300', 'Alpha: 100', 'Gamma: 10']); // snapped to 2002
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ranking()).toEqual(['Beta: 300', 'Alpha: 100', 'Gamma: 10']); // and stays put
    expect(screen.getByRole('button', { name: 'Replay 2000 → 2002' })).toBeEnabled(); // Play remains available
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('gives the reduced-motion slider real years (min/max/value), not row indices', () => {
    reduced = true;
    mount();
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '2000');
    expect(slider).toHaveAttribute('max', '2002');
    expect(slider).toHaveValue('2002');
    expect(slider).toHaveAttribute('aria-valuetext', '2002'); // read out as a year
    fireEvent.change(slider, { target: { value: '2001' } }); // what the browser does on an arrow key
    expect(slider).toHaveValue('2001');
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 90', 'Gamma: 10']); // 2001's ranking
  });

  describe('the share of the world total on each bar', () => {
    it("gives each country's share of that year's World total, one decimal, in the list and beside the bar", () => {
      mount();
      // 2002: World 410 (the three countries are 410 here), so Beta 300 -> 73.2%, Alpha 100 -> 24.4%, Gamma 10 -> 2.4%
      expect(rankingWithShares()).toEqual(['Beta: 300 GtCO₂ (73.2%)', 'Alpha: 100 GtCO₂ (24.4%)', 'Gamma: 10 GtCO₂ (2.4%)']);
      const chart = screen.getByRole('group', { name: /ranking race, 2002/i });
      expect(within(chart).getByText('73.2%')).toBeInTheDocument();
      expect(within(chart).getByText('24.4%')).toBeInTheDocument();
      expect(within(chart).getByText(/share of the world total \(international aviation and shipping included\)/)).toBeInTheDocument();
    });

    it('is of the World total, which can exceed the countries shown: the bars then sum to less than the heading', () => {
      render(<MemoryRouter><RankRace series={MAP} worldTotals={[160000, 200000, 512500]} cumulativeFrom={1750} /></MemoryRouter>);
      // the same three countries against a World of 512.5 (410 plus international transport and the rest): 300/512.5 = 58.5%
      expect(rankingWithShares()[0]).toBe('Beta: 300 GtCO₂ (58.5%)');
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('10 countries, 80% of all CO₂ emitted since 1750');
    });

    it('shows no share, on the bars or in the heading, when the World total is unavailable', () => {
      render(<MemoryRouter><RankRace series={MAP} worldTotals={[]} cumulativeFrom={1750} /></MemoryRouter>);
      expect(rankingWithShares()).toEqual(['Beta: 300 GtCO₂', 'Alpha: 100 GtCO₂', 'Gamma: 10 GtCO₂']);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/^10 countries$/);
      expect(screen.queryByText(/World total:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/share of the world total/)).not.toBeInTheDocument();
      render(<MemoryRouter><RankRace series={MAP} worldTotals={[NaN, NaN, NaN]} cumulativeFrom={1750} /></MemoryRouter>);
      expect(screen.queryAllByText(/%/)).toHaveLength(0);
    });
  });

  describe('the cumulative basis', () => {
    it('says what is counted and from when (the API\'s year), the world total in Gt, and links to the Overview\'s cumulative share', () => {
      mount();
      expect(screen.getByText(/Fossil fuels and industry, GtCO₂ emitted since 1750 to 2002\. World total: 410 GtCO₂\./)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Cumulative share on the Overview →' })).toHaveAttribute('href', '/overview#share');
      expect(screen.getByText(/Cumulative GtCO₂, and each country’s share of the world total/)).toBeInTheDocument();
      expect(screen.getByText(/bar length on a fixed 0–300 scale/)).toBeInTheDocument();
    });

    it('does not name a start year the API did not give', () => {
      render(<MemoryRouter><RankRace series={MAP} worldTotals={WORLD} cumulativeFrom={null} /></MemoryRouter>);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('10 countries, 100% of all CO₂ emitted since records began');
      expect(screen.queryByText(/since 1750/)).not.toBeInTheDocument();
    });

    it('tells the story of the race from the data: who leads, who overtakes', () => {
      mount();
      // Alpha leads in 2000 and 2001 and Beta in 2002, so nobody leads throughout; Beta was 2nd in 2000 and Alpha slips to 2nd.
      expect(screen.getByText(/Warming follows the total emitted, not one year’s output\. Beta leads in 2002, up from 2nd in 2000; Alpha slips back\./)).toBeInTheDocument();
    });
  });
});

import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SynMotionProvider, type MotionChoice } from '@syena/ds';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldMapTimeSeries } from '../api/types';
import { RankRace } from '../components/landing/RankRace';
import { CAROUSEL_DWELL_MS, useCarousel } from '../hooks/useCarousel';
import { useYearAnimation } from '../hooks/useYearAnimation';

// What the visitor's Motion setting does to the autoplay on Home. The device here asks for NO reduced motion, so anything that
// stops is stopped by the setting alone, through the design system's motion provider.

const MAP: WorldMapTimeSeries = {
  iso_codes: ['AAA', 'BBB', 'CCC'],
  countries: ['Alpha', 'Beta', 'Gamma'],
  years: [2000, 2001, 2002],
  values: [[100000, 50000, 10000], [100000, 90000, 10000], [100000, 300000, 10000]],
  value_range: [10000, 300000],
};
const WORLD = [160000, 200000, 410000];

let ioCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  ioCallback = null;
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) { ioCallback = cb; }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const withMotion = (choice: MotionChoice) => ({ children }: { children: ReactNode }) => <SynMotionProvider choice={choice}>{children}</SynMotionProvider>;
const ranking = () => within(screen.getByRole('list', { name: /largest cumulative emitters in/i })).getAllByRole('listitem').map((li) => li.textContent!.replace(/ GtCO₂( \(.*\))?$/, ''));
const mountRace = (choice: MotionChoice) => render(<MemoryRouter><SynMotionProvider choice={choice}><RankRace series={MAP} worldTotals={WORLD} cumulativeFrom={1750} /></SynMotionProvider></MemoryRouter>);

describe('Motion: Reduce', () => {
  it('RankRace shows the final year and never observes the page to autoplay; Play still starts it', () => {
    mountRace('reduce');
    expect(ioCallback).toBeNull();
    expect(ranking()).toEqual(['Beta: 300', 'Alpha: 100', 'Gamma: 10']);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ranking()).toEqual(['Beta: 300', 'Alpha: 100', 'Gamma: 10']);
    fireEvent.click(screen.getByRole('button', { name: 'Replay 2000 → 2002' }));
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 50', 'Gamma: 10']);
    act(() => { vi.advanceTimersByTime(550); });
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 90', 'Gamma: 10']);
  });

  it('with System (and a device that does not ask), the race autoplays when scrolled into view', () => {
    mountRace('system');
    act(() => ioCallback!([{ isIntersecting: true }]));
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 50', 'Gamma: 10']);
  });

  it('the Home globe\'s year animation starts on the latest year with no autoplay; Play still plays', () => {
    const { result } = renderHook(() => useYearAnimation({ minYear: 1990, maxYear: 2024, intervalMs: 500 }), { wrapper: withMotion('reduce') });
    expect(result.current.currentYear).toBe(2024);
    expect(result.current.isPlaying).toBe(false);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.currentYear).toBe(2024);
    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.currentYear).toBe(1990);
  });

  it('the hero carousel starts paused and never advances on its own; Play still rotates it', () => {
    const { result } = renderHook(() => useCarousel({ count: 2 }), { wrapper: withMotion('reduce') });
    expect(result.current.autoplay).toBe(false);
    act(() => { vi.advanceTimersByTime(CAROUSEL_DWELL_MS * 3); });
    expect(result.current.index).toBe(0);
    act(() => result.current.play());
    act(() => { vi.advanceTimersByTime(CAROUSEL_DWELL_MS); });
    expect(result.current.index).toBe(1);
  });
});

describe('Motion: Full', () => {
  it('rotates the carousel and plays the year animation even where the device asks for reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }));
    const carousel = renderHook(() => useCarousel({ count: 2 }), { wrapper: withMotion('full') });
    expect(carousel.result.current.autoplay).toBe(true);
    act(() => { vi.advanceTimersByTime(CAROUSEL_DWELL_MS); });
    expect(carousel.result.current.index).toBe(1);
    const years = renderHook(() => useYearAnimation({ minYear: 1990, maxYear: 2024, intervalMs: 500 }), { wrapper: withMotion('full') });
    expect(years.result.current.isPlaying).toBe(true);
  });
});

describe('Motion: switching to Reduce while something is autoplaying', () => {
  // The same mounted tree, its choice changed from outside, as the Settings menu does.
  let choice: MotionChoice = 'system';
  const Wrapper = ({ children }: { children: ReactNode }) => <SynMotionProvider choice={choice}>{children}</SynMotionProvider>;
  beforeEach(() => { choice = 'system'; });

  const raceTree = () => <MemoryRouter><Wrapper><RankRace series={MAP} worldTotals={WORLD} cumulativeFrom={1750} /></Wrapper></MemoryRouter>;

  it('the race stops and jumps to the final year when nobody started it', () => {
    const { rerender } = render(raceTree());
    act(() => ioCallback!([{ isIntersecting: true }])); // autoplay begins at 2000
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 50', 'Gamma: 10']);
    choice = 'reduce';
    rerender(raceTree());
    expect(ranking()).toEqual(['Beta: 300', 'Alpha: 100', 'Gamma: 10']);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(ranking()).toEqual(['Beta: 300', 'Alpha: 100', 'Gamma: 10']);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('the race stops where it is when the visitor pressed Play', () => {
    const { rerender } = render(raceTree());
    act(() => ioCallback!([{ isIntersecting: true }]));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => { vi.advanceTimersByTime(550); });
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 90', 'Gamma: 10']); // 2001
    choice = 'reduce';
    rerender(raceTree());
    act(() => { vi.advanceTimersByTime(3000); });
    expect(ranking()).toEqual(['Alpha: 100', 'Beta: 90', 'Gamma: 10']);
  });

  it('the year animation (the Home globe) stops and jumps to the latest year when nobody started it', () => {
    const { result, rerender } = renderHook(() => useYearAnimation({ minYear: 1990, maxYear: 2024, intervalMs: 500 }), { wrapper: Wrapper });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.currentYear).toBe(1995);
    choice = 'reduce';
    rerender();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentYear).toBe(2024);
  });

  it('the year animation stops where it is after the visitor pressed Play or moved the year', () => {
    const played = renderHook(() => useYearAnimation({ minYear: 1990, maxYear: 2024, intervalMs: 500 }), { wrapper: Wrapper });
    act(() => played.result.current.pause());
    act(() => played.result.current.play());
    act(() => { vi.advanceTimersByTime(500); });
    expect(played.result.current.currentYear).toBe(1995);
    const moved = renderHook(() => useYearAnimation({ minYear: 1990, maxYear: 2024, intervalMs: 500 }), { wrapper: Wrapper });
    act(() => moved.result.current.seek(2005));
    choice = 'reduce';
    played.rerender(); moved.rerender();
    expect(played.result.current).toMatchObject({ isPlaying: false, currentYear: 1995 });
    expect(moved.result.current).toMatchObject({ isPlaying: false, currentYear: 2005 });
  });
});

describe('Motion: switching away from Reduce again', () => {
  let choice: MotionChoice = 'system';
  const Wrapper = ({ children }: { children: ReactNode }) => <SynMotionProvider choice={choice}>{children}</SynMotionProvider>;
  beforeEach(() => { choice = 'system'; });

  it('the carousel Reduce paused rotates again on Full and on System', () => {
    for (const back of ['full', 'system'] as const) {
      choice = 'system';
      const { result, rerender, unmount } = renderHook(() => useCarousel({ count: 3 }), { wrapper: Wrapper });
      expect(result.current.autoplay).toBe(true);
      choice = 'reduce'; rerender();
      expect(result.current.autoplay).toBe(false);
      choice = back; rerender();
      expect(result.current.autoplay).toBe(true);
      act(() => { vi.advanceTimersByTime(CAROUSEL_DWELL_MS); });
      expect(result.current.index).toBe(1);
      unmount();
    }
  });

  it('a carousel that opened under Reduce starts rotating when Reduce is switched off', () => {
    choice = 'reduce';
    const { result, rerender } = renderHook(() => useCarousel({ count: 3 }), { wrapper: Wrapper });
    expect(result.current.autoplay).toBe(false);
    choice = 'full'; rerender();
    expect(result.current.autoplay).toBe(true);
  });

  it('a carousel the visitor paused, or started under Reduce, is not touched by the setting', () => {
    const paused = renderHook(() => useCarousel({ count: 3 }), { wrapper: Wrapper });
    act(() => paused.result.current.pause());
    choice = 'reduce'; paused.rerender();
    choice = 'full'; paused.rerender();
    expect(paused.result.current.autoplay).toBe(false); // they paused it
    choice = 'reduce';
    const played = renderHook(() => useCarousel({ count: 3 }), { wrapper: Wrapper });
    act(() => played.result.current.play());
    choice = 'system'; played.rerender();
    expect(played.result.current.autoplay).toBe(true); // they started it, and System leaves it going
  });

  it('a carousel the visitor paused and then played stays theirs through later changes of the setting', () => {
    const { result, rerender } = renderHook(() => useCarousel({ count: 3 }), { wrapper: Wrapper });
    act(() => result.current.pause());
    act(() => result.current.play());
    choice = 'reduce'; rerender();
    expect(result.current.autoplay).toBe(false);
    choice = 'full'; rerender();
    expect(result.current.autoplay).toBe(false); // they took charge of it; the setting does not restart it
  });

  it('the globe that is not showing when Reduce ends is restored when it is shown', () => {
    let shown = true;
    const { result, rerender } = renderHook(() => useYearAnimation({ minYear: 1990, maxYear: 2024, intervalMs: 500, enabled: shown }), { wrapper: Wrapper });
    act(() => { vi.advanceTimersByTime(500); });
    choice = 'reduce'; rerender();
    expect(result.current).toMatchObject({ isPlaying: false, currentYear: 2024 });
    shown = false; rerender();
    choice = 'full'; rerender();
    expect(result.current).toMatchObject({ isPlaying: false, currentYear: 2024 }); // still hidden: nothing yet
    shown = true; rerender();
    expect(result.current).toMatchObject({ isPlaying: true, currentYear: 1990 });
  });

  it('the globe\'s year animation that Reduce stopped plays again from the first stop on Full; one the visitor drove stays', () => {
    const auto = renderHook(() => useYearAnimation({ minYear: 1990, maxYear: 2024, intervalMs: 500 }), { wrapper: Wrapper });
    act(() => { vi.advanceTimersByTime(500); });
    choice = 'reduce'; auto.rerender();
    expect(auto.result.current).toMatchObject({ isPlaying: false, currentYear: 2024 });
    choice = 'full'; auto.rerender();
    expect(auto.result.current).toMatchObject({ isPlaying: true, currentYear: 1990 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(auto.result.current.currentYear).toBe(1995);
    auto.unmount();

    choice = 'system';
    const driven = renderHook(() => useYearAnimation({ minYear: 1990, maxYear: 2024, intervalMs: 500 }), { wrapper: Wrapper });
    act(() => driven.result.current.seek(2005));
    choice = 'reduce'; driven.rerender();
    choice = 'full'; driven.rerender();
    expect(driven.result.current).toMatchObject({ isPlaying: false, currentYear: 2005 });
  });
});


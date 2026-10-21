import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { LandingLayout } from './LandingLayout';

const realMatchMedia = window.matchMedia;
// Restore only matchMedia: vi.unstubAllGlobals would also drop the shared ResizeObserver stub the other tests rely on.
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia; });

/** The design system's own narrow-width query (below its compact breakpoint): a max-width one, which is not the tablet query the layout adds. */
const isCompactQuery = (q: string) => /^\(max-width: \d+px\)$/.test(q) && q !== '(max-width: 1100px)';

/** matchMedia where only the listed queries match. */
function stubMedia(matching: (q: string) => boolean) {
  window.matchMedia = ((q: string) => ({ matches: matching(q), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
}

const mount = () => render(
  <MemoryRouter><Routes><Route element={<LandingLayout theme="night" setTheme={() => {}} />}><Route path="/" element={<p>page</p>} /></Route></Routes></MemoryRouter>,
);

describe('LandingLayout header', () => {
  it('survives the phone being rotated from narrow to wide (the hook count must not change)', () => {
    const listeners = new Map<string, (e: { matches: boolean }) => void>();
    const state = { narrow: true };
    window.matchMedia = ((q: string) => ({
      get matches() { return isCompactQuery(q) ? state.narrow : false; },
      media: q,
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.set(q, l),
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    mount();
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
    state.narrow = false;
    const compactQuery = [...listeners.keys()].find(isCompactQuery);
    expect(compactQuery).toBeDefined();
    expect(() => act(() => listeners.get(compactQuery!)?.({ matches: false }))).not.toThrow();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('writes the short name beside the logo and keeps the full name as the link\'s accessible name and tooltip', () => {
    stubMedia(() => false);
    mount();
    const home = screen.getByRole('link', { name: 'Climate Analytics Platform' });
    expect(home).toHaveAttribute('title', 'Climate Analytics Platform');
    expect(home).toHaveTextContent(/^🌍\s*Climate Analytics$/);
  });

  it('on a desktop-sized screen shows the link row in the header, not a Menu button', () => {
    stubMedia(() => false);
    mount();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /menu/i })).not.toBeInTheDocument();
  });

  it('on a narrow phone (portrait) shows the Menu button instead of the link row', () => {
    stubMedia(isCompactQuery);
    mount();
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument(); // the menu's own nav only exists once opened
  });

  it('on a phone turned sideways (wider than 768 px but short) shows the same Menu button, so the links do not wrap to three rows', () => {
    stubMedia((q) => q === '(orientation: landscape) and (max-height: 500px)');
    mount();
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  });

  it('on a tablet (up to 1100 px, any pointer) shows the Menu button', () => {
    stubMedia((q) => q.includes('(max-width: 1100px)'));
    mount();
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  });

  it('on a touch screen up to 1440 px (iPad Pro landscape) shows the Menu button', () => {
    stubMedia((q) => q.includes('(max-width: 1440px) and (pointer: coarse)'));
    mount();
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
  });

  it('on a 1440 px window with a mouse (no coarse pointer, wider than 1100 px) keeps the desktop link row', () => {
    stubMedia((q) => q === '(max-width: 1440px)');
    mount();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /menu/i })).not.toBeInTheDocument();
  });
});

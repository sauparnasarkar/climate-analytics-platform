import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PageChrome } from './PageChrome';
import { afterEach, describe, expect, it } from 'vitest';
import { recordResponse, resetSavedData } from '../lib/savedCopy';
import { AppProviders } from '../test/AppProviders';
import { DashboardLayout } from './DashboardLayout';

afterEach(() => { cleanup(); resetSavedData(); });

function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }

const mount = (path = '/overview') => render(
  <AppProviders><MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/overview" element={<Where />} />
        <Route path="/" element={<Where />} />
        <Route path="/ask" element={<Where />} />
        <Route path="/about" element={<Where />} />
      </Route>
    </Routes>
  </MemoryRouter></AppProviders>,
);

describe('DashboardLayout rail brand', () => {
  it('writes the product name in the rail', () => {
    mount();
    const rail = screen.getByRole('navigation', { name: 'Primary' });
    expect(rail.querySelector('a[href="/"] span')).toHaveTextContent(/^Degrees of Carbon$/);
  });

  it('names the product and links to Home, and a plain click moves within the app', () => {
    mount();
    const brand = screen.getByRole('link', { name: /Degrees of Carbon/ });
    expect(brand).toHaveAttribute('href', '/');
    fireEvent.click(brand);
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });

  it('keeps the Home link named with the product name once the rail is collapsed', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(screen.getByRole('link', { name: 'Degrees of Carbon' })).toHaveAttribute('href', '/');
  });

  it('keeps a modified click for the browser (new tab)', () => {
    mount();
    fireEvent.click(screen.getByRole('link', { name: /Degrees of Carbon/ }), { ctrlKey: true });
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
  });
});

describe('DashboardLayout saved-data notice', () => {
  // The notice forgets a page's data when the route changes, so a response is noted after the page has mounted, as a page's own request would be.
  it('shows the notice above the page when a response came from the saved copy, and not on the Ask page', () => {
    mount('/overview');
    act(() => recordResponse('/api/overview', '2026-01-14T09:00:00.000Z'));
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(/Showing saved data from 14 January/);
    cleanup();
    resetSavedData();
    mount('/ask');
    act(() => recordResponse('/api/correlation', '2026-01-14T09:00:00.000Z'));
    expect(screen.queryByText(/Showing saved data/)).toBeNull();
  });
});

describe('DashboardLayout page description on a phone', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => { window.matchMedia = realMatchMedia; });
  /** matchMedia where only the compact (drawer) query matches, or none do. */
  const phone = (compact: boolean) => { window.matchMedia = ((q: string) => ({ matches: compact && /max-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia; };
  const PURPOSE = 'Where emissions are and how they moved.';
  const mountPage = (chrome: { title: string; purpose?: string; ownsPurpose?: boolean }) => render(
    <AppProviders><MemoryRouter initialEntries={['/overview']}>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/overview" element={<><PageChrome {...chrome} /><p>first section</p></>} />
        </Route>
      </Routes>
    </MemoryRouter></AppProviders>,
  );

  it('on a phone, writes the description as the first item of the page content, once, and not inside anything pinned', () => {
    phone(true);
    mountPage({ title: 'Overview', purpose: PURPOSE });
    const main = document.getElementById('content') as HTMLElement;
    const copies = screen.getAllByText(PURPOSE);
    expect(copies).toHaveLength(1);
    expect(main.firstElementChild).toBe(copies[0]);
    expect(copies[0].closest('[data-syn-sticky]')).toBeNull();
  });

  it('on a desktop shell the page content does not carry it (the analysis bar does)', () => {
    phone(false);
    mountPage({ title: 'Overview', purpose: PURPOSE });
    const main = document.getElementById('content') as HTMLElement;
    expect(within(main).queryByText(PURPOSE)).toBeNull();
    expect(screen.getAllByText(PURPOSE)).toHaveLength(1);
  });

  it('writes nothing for a page with no description, or one that writes its own', () => {
    phone(true);
    mountPage({ title: 'Overview' });
    expect(document.getElementById('content')?.firstElementChild).toHaveTextContent('first section');
    cleanup();
    mountPage({ title: 'About', purpose: PURPOSE, ownsPurpose: true });
    expect(screen.queryByText(PURPOSE)).toBeNull();
  });
});

describe('DashboardLayout source strip', () => {
  it('ends with a link to Methods & data (not a disclosure), and a plain click moves within the app', () => {
    mount();
    const strip = screen.getByRole('complementary', { name: 'Sources and methodology' });
    const link = within(strip).getByRole('link', { name: 'Methods & data' });
    expect(link).toHaveAttribute('href', '/about');
    expect(within(strip).queryByRole('button', { name: 'Methodology' })).not.toBeInTheDocument();
    fireEvent.click(link);
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/about$/);
  });

  it('keeps a modified click on the strip link for the browser (new tab)', () => {
    mount();
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Sources and methodology' })).getByRole('link', { name: 'Methods & data' }), { ctrlKey: true });
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/overview$/);
  });
});

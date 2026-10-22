import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { recordResponse, resetSavedData } from '../lib/savedCopy';
import { DashboardLayout } from './DashboardLayout';

afterEach(() => { cleanup(); resetSavedData(); });

function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }

const mount = (path = '/overview') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<DashboardLayout theme="night" setTheme={() => {}} />}>
        <Route path="/overview" element={<Where />} />
        <Route path="/" element={<Where />} />
        <Route path="/ask" element={<Where />} />
      </Route>
    </Routes>
  </MemoryRouter>,
);

describe('DashboardLayout rail brand', () => {
  it('writes the short product name in the rail and keeps the full name for the page title', () => {
    mount();
    const rail = screen.getByRole('navigation', { name: 'Primary' });
    expect(rail.querySelector('a[href="/"] span')).toHaveTextContent(/^Climate Analytics$/);
    expect(document.querySelector('h1, [role="banner"]')?.textContent ?? '').not.toMatch(/^Climate Analytics$/);
  });

  it('names the product and links to Home, and a plain click moves within the app', () => {
    mount();
    const brand = screen.getByRole('link', { name: /Climate Analytics Platform/ });
    expect(brand).toHaveAttribute('href', '/');
    fireEvent.click(brand);
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });

  it('names the Home link with the full product name once the rail is collapsed, though the rail writes the short one', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(screen.getByRole('link', { name: 'Climate Analytics Platform' })).toHaveAttribute('href', '/');
  });

  it('keeps a modified click for the browser (new tab)', () => {
    mount();
    fireEvent.click(screen.getByRole('link', { name: /Climate Analytics Platform/ }), { ctrlKey: true });
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

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DashboardLayout } from './DashboardLayout';

afterEach(cleanup);

function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }

const mount = () => render(
  <MemoryRouter initialEntries={['/overview']}>
    <Routes>
      <Route element={<DashboardLayout theme="night" setTheme={() => {}} />}>
        <Route path="/overview" element={<Where />} />
        <Route path="/" element={<Where />} />
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

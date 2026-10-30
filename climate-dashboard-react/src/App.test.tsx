import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from './App';

// The landing page's data never resolves here: routing tests only need its static shell (headline, CTA).
vi.mock('./api/client', () => ({ api: { overview: () => new Promise(() => {}), worldMapSeries: () => new Promise(() => {}), correlationCountryShare: () => new Promise(() => {}) } }));

// Page bodies are covered by their own suites -- this file only tests routing and the two layouts.
vi.mock('./pages/OverviewPage', () => ({ default: () => <div>Overview page stub</div> }));
vi.mock('./pages/HistoricalTrendsPage', () => ({ default: () => <div>Historical page stub</div> }));
vi.mock('./pages/CountryProfilePage', () => ({ default: () => <div>Country profile stub</div> }));
vi.mock('./pages/ForecastsPage', () => ({ default: () => <div>Forecasts stub</div> }));
vi.mock('./pages/ScenarioComparisonPage', () => ({ default: () => <div>Scenarios stub</div> }));
vi.mock('./pages/DataExplorerPage', () => ({ default: () => <div>Data explorer stub</div> }));
vi.mock('./pages/AboutPage', () => ({ default: () => <div>About page stub</div> }));
vi.mock('./pages/AdminPage', () => ({ default: () => <div>Admin page stub</div> }));
vi.mock('./pages/AgentPage', () => ({ AgentPage: () => <div>Agent page stub</div> }));

// jsdom has no matchMedia; the design system's useIsMobile/useReducedMotion call it during render.
// Desktop viewport by default (only the design system's narrow-width query flips with `mobile`); never reduced-motion.
let mobile = false;
beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mobile && /^\(max-width: \d+px\)$/.test(query) && query !== '(max-width: 1100px)', media: query, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null,
  }));
});
afterEach(() => { mobile = false; });

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('App routing', () => {
  it('renders the landing page at "/" with the top-nav layout, not the dashboard sidebar', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: /where the world’s co₂ comes from/i })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    // Every dashboard page is reachable from the landing nav, with the app's exact labels.
    for (const label of ['Overview', 'Historical Trends', 'Country Profile', 'Climate Correlation', 'Forecasts', 'Scenario Comparison']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/overview');
    expect(screen.queryByText('Overview page stub')).not.toBeInTheDocument();
    expect(document.title).toBe('Degrees of Carbon: how emissions add up to warming');
    // Data Explorer and Methods & data sit in the footer, not the top nav, so the nav fits one line (Area 2 design).
    expect(within(nav).queryByRole('link', { name: 'Data Explorer' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Methods & data' })).not.toBeInTheDocument();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('Degrees of Carbon · A Syena project · Sauparna Sarkar')).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'Data Explorer' })).toHaveAttribute('href', '/data-explorer');
    expect(within(footer).getByRole('link', { name: 'Methods & data' })).toHaveAttribute('href', '/about');
  });

  it('moved the Overview from "/" to "/overview", inside the dashboard shell', () => {
    renderAt('/overview');
    expect(screen.getByText('Overview page stub')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /where the world’s co₂/i })).not.toBeInTheDocument();
    expect(document.title).toBe('Overview — Degrees of Carbon');
  });

  it('has a Home rail item that returns to "/" and an Overview item that opens "/overview"', () => {
    renderAt('/historical');
    // The rail's items are links in the primary navigation, wired through onItemClick.
    const rail = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(rail).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/overview');
    expect(within(rail).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    fireEvent.click(within(rail).getByRole('link', { name: 'Overview' }));
    expect(screen.getByText('Overview page stub')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Home' }));
    expect(screen.getByRole('heading', { level: 1, name: /where the world’s co₂ comes from/i })).toBeInTheDocument();
  });

  it.each([
    ['/historical', 'Historical page stub'],
    ['/country-profile', 'Country profile stub'],
    ['/forecasts', 'Forecasts stub'],
    ['/scenarios', 'Scenarios stub'],
    ['/data-explorer', 'Data explorer stub'],
    ['/about', 'About page stub'],
    ['/ask', 'Agent page stub'],
    ['/admin', 'Admin page stub'],
  ])('still serves %s under the dashboard shell', (path, text) => {
    renderAt(path);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('redirects an unknown path to the landing page', () => {
    renderAt('/no-such-page');
    expect(screen.getByRole('heading', { level: 1, name: /where the world’s co₂/i })).toBeInTheDocument();
  });

  it('renders the landing CTA as one link, not a button nested inside a link', () => {
    renderAt('/');
    const cta = screen.getByRole('link', { name: 'Explore the data' });
    expect(cta).toHaveAttribute('href', '/overview');
    expect(within(cta).queryByRole('button')).not.toBeInTheDocument();
    expect(cta.closest('a')?.querySelector('button')).toBeNull();
  });
});

describe('Landing layout on a phone', () => {
  it('hides the inline nav behind a Menu button that discloses nav, theme toggle and Ask the Agent', () => {
    mobile = true;
    renderAt('/');
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    for (const label of ['Overview', 'Historical Trends', 'Country Profile', 'Data Explorer', 'Forecasts', 'Scenario Comparison', 'Methods & data']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Ask the Agent' })).toHaveAttribute('href', '/ask');
    expect(within(nav).getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
  });

  it('closes on Escape and on following a link', () => {
    mobile = true;
    renderAt('/');
    const menu = screen.getByRole('button', { name: 'Menu' });

    fireEvent.click(menu);
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
    expect(menu).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menu);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Methods & data' }));
    // Navigated to a dashboard page, which is a different layout entirely (its phone header has its own
    // "Menu" button, but the landing dropdown is gone).
    expect(screen.getByText('About page stub')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  });
});

describe('Dashboard shell actions', () => {
  it('desktop: Settings and Ask the Agent sit together in the rail; the settings are in a popover, not inline', () => {
    renderAt('/about');
    const rail = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(rail).getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(rail).getByRole('button', { name: 'Ask the Agent' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument(); // the phone top bar is not drawn on a wide screen
    expect(screen.queryByRole('radio', { name: 'Dark' })).not.toBeInTheDocument(); // closed until opened
    fireEvent.click(within(rail).getByRole('button', { name: 'Settings' }));
    expect(screen.getAllByRole('radio', { name: 'Dark' })).toHaveLength(1); // exactly one set of settings
  });

  it('marks Ask the Agent as the current page on /ask', () => {
    renderAt('/ask');
    expect(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'Ask the Agent' })).toHaveAttribute('aria-current', 'page');
  });

  it('phone: the top bar has a navigation button; the rail, with Ask and the toggle, lives in the drawer it opens', () => {
    mobile = true;
    renderAt('/about');
    const bar = screen.getByRole('banner');
    const open = within(bar).getByRole('button', { name: 'Open navigation' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(within(bar).queryByRole('button', { name: 'Ask the Agent' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    expect(within(drawer).getByRole('button', { name: 'Ask the Agent' })).toBeInTheDocument();
    expect(within(drawer).getAllByRole('radio', { name: 'Dark' })).toHaveLength(1); // exactly one toggle live, in the drawer
    expect(within(drawer).getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'Methods & data' })).toHaveAttribute('aria-current', 'page');
  });

  it('phone: choosing a page in the drawer closes it and navigates', () => {
    mobile = true;
    renderAt('/about');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Overview' }));
    expect(screen.getByText('Overview page stub')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('phone: Ask the Agent inside the drawer also closes it on navigation', () => {
    mobile = true;
    renderAt('/about');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ask the Agent' }));
    expect(screen.getByText('Agent page stub')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Area 2 foundation', () => {
  it('routes /climate-correlation to the Climate Correlation page inside the dashboard shell', () => {
    renderAt('/climate-correlation');
    expect(screen.getByRole('heading', { level: 1, name: /^climate correlation$/i })).toBeInTheDocument();
    expect(document.title).toBe('Climate Correlation — Degrees of Carbon');
    expect(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: /Climate Correlation/ })).toHaveAttribute('href', '/climate-correlation');
  });

  it('shows the product name in the dashboard rail and footer, and on a phone\'s top bar', () => {
    renderAt('/historical');
    const brand = within(screen.getByRole('navigation', { name: 'Primary' })).getByText('Degrees of Carbon', { selector: 'span' });
    expect(brand.closest('a')).toHaveAttribute('href', '/');
    expect(within(screen.getByRole('contentinfo')).getByText('Degrees of Carbon · A Syena project · Sauparna Sarkar')).toBeInTheDocument();
    cleanup();
    mobile = true;
    renderAt('/historical');
    expect(within(screen.getByRole('banner')).getAllByText('Degrees of Carbon').length).toBeGreaterThan(0);
  });
});

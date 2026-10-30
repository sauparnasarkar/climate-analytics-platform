import { Navigate, Route, Routes } from 'react-router-dom';

import { SynThemeProvider } from '@syena/ds';
import { DefaultCountriesProvider } from './lib/DefaultCountriesProvider';
import { MotionChoiceProvider } from './lib/MotionChoiceProvider';
import { THEME_STORAGE_KEY } from './lib/theme';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LandingLayout } from './layouts/LandingLayout';
import LandingPage from './pages/LandingPage';
import OverviewPage from './pages/OverviewPage';
import HistoricalTrendsPage from './pages/HistoricalTrendsPage';
import CountryProfilePage from './pages/CountryProfilePage';
import ForecastsPage from './pages/ForecastsPage';
import ScenarioComparisonPage from './pages/ScenarioComparisonPage';
import DataExplorerPage from './pages/DataExplorerPage';
import AboutPage from './pages/AboutPage';
import AdminPage from './pages/AdminPage';
import { AgentPage } from './pages/AgentPage';
import { AskThreadProvider } from './agent/AskThreadProvider';
import ClimateCorrelationPage from './pages/ClimateCorrelationPage';

function App() {
  return (
    <SynThemeProvider defaultChoice="system" storageKey={THEME_STORAGE_KEY}>
    <MotionChoiceProvider>
    <DefaultCountriesProvider>
      {/* Above every layout, so the Ask page's thread outlives navigating to any other page (including Home) and back. */}
      <AskThreadProvider>
      <Routes>
        {/* The landing page (SPEC.md §5.25) has its own layout -- top nav, no sidebar. */}
        <Route element={<LandingLayout />}>
          <Route path="/" element={<LandingPage />} />
        </Route>
        {/* Everything else shares the dashboard shell. The Overview moved from '/' to '/overview'. */}
        <Route element={<DashboardLayout />}>
          <Route path="/overview" element={<OverviewPage />} />
          {/* Deliberately not '/agent' -- that path prefix is already claimed by the SSE proxy
              entry to services/agent's own backend (vite.config.ts's agentProxyEntry, matching
              the production Cloudflare route labs.syena.io/app-prefix/agent).
              Vite's dev proxy matches by path prefix, so a page route literally named '/agent'
              would itself get proxied to the backend instead of rendering the SPA -- confirmed
              live (ECONNREFUSED against the not-yet-running agent process the moment this page
              route was visited in dev). */}
          <Route path="/ask" element={<AgentPage />} />
          <Route path="/historical" element={<HistoricalTrendsPage />} />
          <Route path="/country-profile" element={<CountryProfilePage />} />
          <Route path="/forecasts" element={<ForecastsPage />} />
          <Route path="/scenarios" element={<ScenarioComparisonPage />} />
          <Route path="/data-explorer" element={<DataExplorerPage />} />
          <Route path="/climate-correlation" element={<ClimateCorrelationPage />} />
          <Route path="/about" element={<AboutPage />} />
          {/* Unlisted -- absent from NAV_ITEMS and SidebarNav.persistentAction, deliberately
              reachable by URL only (root ARCHITECTURE.md §8's admin capability, gated at the
              Cloudflare edge, not here). Same "route with no nav-surface presence" precedent
              '/ask' already sets, just with no persistentAction wiring at all. */}
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AskThreadProvider>
    </DefaultCountriesProvider>
    </MotionChoiceProvider>
    </SynThemeProvider>
  );
}

export default App;

import type { IconName } from '@syena/ds';

/** A destination in the navigation: the id doubles as the shell's current-item id. */
export interface AppNavItem {
  id: string;
  label: string;
  icon: IconName;
  path: string;
  group?: 'Exploration' | 'Projection';
  /** A short word shown after the label. */
  badge?: string;
}

// `group` is omitted for About, which is meta-content pinned to the sidebar's existing
// footerItems slot rather than clustered with either group.
// The conversational agent is not a NAV_ITEMS entry: it is the rail's one persistent action (see DashboardLayout). The '/ask' route is unchanged.
export const NAV_ITEMS: AppNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'overview', path: '/overview', group: 'Exploration' },
  { id: 'historical', label: 'Historical Trends', icon: 'historical', path: '/historical', group: 'Exploration' },
  { id: 'country-profile', label: 'Country Profile', icon: 'country', path: '/country-profile', group: 'Exploration' },
  { id: 'data-explorer', label: 'Data Explorer', icon: 'explorer', path: '/data-explorer', group: 'Exploration' },
  // Area 2. The NEW badge is the design's tag for a recently added page.
  { id: 'climate-correlation', label: 'Climate Correlation', icon: 'correlation', path: '/climate-correlation', group: 'Exploration', badge: 'NEW' },
  { id: 'forecasts', label: 'Forecasts', icon: 'forecasts', path: '/forecasts', group: 'Projection' },
  { id: 'scenarios', label: 'Scenario Comparison', icon: 'scenarios', path: '/scenarios', group: 'Projection' },
  { id: 'about', label: 'About', icon: 'info', path: '/about' },
];

// The landing page (SPEC.md §5.25) lives at '/'. Deliberately not in NAV_ITEMS: it has
// no group, isn't a dashboard page, and the sidebar renders it as its own unlabeled cluster above
// the Exploration group rather than beside About in the footer.
export const HOME_ITEM: AppNavItem = { id: 'home', label: 'Home', icon: 'home', path: '/' };

// One product name everywhere.
export const PRODUCT_NAME = 'Climate Analytics Platform';
// The rail's name is shorter so it fits one line beside the mark; page titles keep the full name.
export const RAIL_PRODUCT_NAME = 'Climate Analytics';
export const APP_TITLE = PRODUCT_NAME;
export const LANDING_TITLE = PRODUCT_NAME;
export const FOOTER_COPYRIGHT = `${PRODUCT_NAME} · Sauparna Sarkar`;

// The landing top nav fits one line at 1280px by leaving these two to the footer and (below 768px)
// the menu, which still lists every page (Area 2 design, L1 SPEC NOTES "Nav").
export const LANDING_NAV_FOOTER_IDS = ['data-explorer', 'about'] as const;

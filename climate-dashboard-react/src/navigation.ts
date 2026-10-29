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
  { id: 'climate-correlation', label: 'Climate Correlation', icon: 'correlation', path: '/climate-correlation', group: 'Exploration' },
  { id: 'historical', label: 'Historical Trends', icon: 'historical', path: '/historical', group: 'Exploration' },
  { id: 'country-profile', label: 'Country Profile', icon: 'country', path: '/country-profile', group: 'Exploration' },
  { id: 'data-explorer', label: 'Data Explorer', icon: 'explorer', path: '/data-explorer', group: 'Exploration' },
  { id: 'forecasts', label: 'Forecasts', icon: 'forecasts', path: '/forecasts', group: 'Projection' },
  { id: 'scenarios', label: 'Scenario Comparison', icon: 'scenarios', path: '/scenarios', group: 'Projection' },
  { id: 'about', label: 'Methods & data', icon: 'info', path: '/about' },
];

// The landing page (SPEC.md §5.25) lives at '/'. Deliberately not in NAV_ITEMS: it has
// no group, isn't a dashboard page, and the sidebar renders it as its own unlabeled cluster above
// the Exploration group rather than beside About in the footer.
export const HOME_ITEM: AppNavItem = { id: 'home', label: 'Home', icon: 'home', path: '/' };

// One product name everywhere, rail included.
export const PRODUCT_NAME = 'Degrees of Carbon';
/** The Home chain heading and the page title; not in the rail. */
export const TAGLINE = 'How emissions add up to warming.';
/** The Home chain section's heading: the tagline without its full stop. */
export const TAGLINE_HEADING = TAGLINE.replace(/\.$/, '');
/** The production origin: every page's canonical link points here, whichever host served it (the preview too), so only one origin is indexed. */
export const CANONICAL_ORIGIN = 'https://degreesofcarbon.syena.io';
export const RAIL_PRODUCT_NAME = PRODUCT_NAME;
export const APP_TITLE = PRODUCT_NAME;
/** The Home page's browser title: the name, then the tagline without its full stop. */
export const LANDING_TITLE = `${PRODUCT_NAME}: ${TAGLINE.charAt(0).toLowerCase()}${TAGLINE.slice(1, -1)}`;
export const FOOTER_COPYRIGHT = `${PRODUCT_NAME} · A Syena project · Sauparna Sarkar`;

// The landing top nav fits one line at 1280px by leaving these two to the footer and (below 768px)
// the menu, which still lists every page (Area 2 design, L1 SPEC NOTES "Nav").
export const LANDING_NAV_FOOTER_IDS = ['data-explorer', 'about'] as const;

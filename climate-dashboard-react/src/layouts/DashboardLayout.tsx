import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnalysisBar, AppShell, BackToTop, Button, Footer, Rail, SourceStrip, Text, TopBar, useIsMobile, useShell, type NavGroup, type NavItem } from '@syena/ds';

import { PagePurpose } from '../components/PagePurpose';
import { SavedDataNotice } from '../components/SavedDataNotice';
import { SettingsMenu } from '../components/settings/SettingsMenu';
import { SettingsPanel } from '../components/settings/SettingsPanel';
import { useKeepPlaceOnResize } from '../hooks/useKeepPlaceOnResize';
import { useRouteAnnouncements } from '../hooks/useRouteAnnouncements';
import { FOOTER_COPYRIGHT, HOME_ITEM, NAV_ITEMS, PRODUCT_NAME, RAIL_PRODUCT_NAME, type AppNavItem } from '../navigation';
import { PageChromeContext, type PageChromeState } from './PageChrome';

const PRODUCT_MARK = { src: '/app-icon.svg', name: PRODUCT_NAME };
const ALL_ITEMS: AppNavItem[] = [HOME_ITEM, ...NAV_ITEMS];
/** The Methods & data page: where the source strip's link leads. */
const METHODS_ITEM = NAV_ITEMS.find((item) => item.id === 'about')!;

const toNavItem = ({ id, label, icon, path, badge }: AppNavItem): NavItem => ({ id, label, icon, href: path, badge });

const GROUPS: NavGroup[] = [
  { id: 'home', label: '', items: [toNavItem(HOME_ITEM)] },
  ...(['Exploration', 'Projection'] as const).map((label) => ({ id: label.toLowerCase(), label, items: NAV_ITEMS.filter((item) => item.group === label).map(toNavItem) })),
];
const FOOTER_ITEMS: NavItem[] = NAV_ITEMS.filter((item) => !item.group).map(toNavItem);

/** The rail's Ask action. In the phone drawer it closes the drawer as the rail's own links do, so the page it opens is not left under it. */
function AskAgentButton({ collapsed, active, onAsk }: { collapsed: boolean; active: boolean; onAsk: () => void }) {
  const shell = useShell();
  const ask = () => { onAsk(); shell?.setNavigationOpen(false); };
  return collapsed ? (
    <Button variant="secondary" icon="sparkle" aria-label="Ask the Agent" aria-current={active ? 'page' : undefined} onClick={ask} />
  ) : (
    <Button variant="secondary" icon="sparkle" aria-current={active ? 'page' : undefined} onClick={ask}>Ask the Agent</Button>
  );
}

/** The dashboard shell (rail, analysis bar, source strip, footer, back-to-top) around every page under it; the landing page at '/' uses
 * LandingLayout instead. Each page names itself and draws its page-wide filters through PageChrome. Settings (theme, motion) live in App's providers, so both layouts share them. */
export function DashboardLayout() {
  // The drawer, where the settings sections sit inline instead of in a popover.
  const drawer = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement | null>(null);
  // The shell owns <main id="content">; the route announcement moves focus there.
  useEffect(() => { mainRef.current = document.getElementById('content'); });
  useRouteAnnouncements(mainRef);
  useKeepPlaceOnResize(location.pathname);

  const [chrome, setChrome] = useState<PageChromeState | null>(null);
  const [hasFilters, setHasFilters] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const context = useMemo(() => ({ set: setChrome, setHasFilters, slot }), [slot]);

  const current = ALL_ITEMS.find((item) => item.path === location.pathname)?.id;
  // A plain click moves within the app; a modified click (new tab, new window) keeps the link's own behaviour.
  const goTo = (path: string, event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(path);
  };
  const onItemClick = (item: NavItem, event: MouseEvent) => {
    const target = ALL_ITEMS.find((candidate) => candidate.id === item.id);
    if (target) goTo(target.path, event);
  };

  const title = chrome?.title ?? PRODUCT_NAME;
  const askActive = location.pathname === '/ask';

  return (
    <PageChromeContext.Provider value={context}>
      <AppShell
        rail={
          <Rail
            logo={PRODUCT_MARK}
            productName={RAIL_PRODUCT_NAME}
            brandHref={HOME_ITEM.path}
            onBrandClick={(event) => goTo(HOME_ITEM.path, event)}
            groups={GROUPS}
            footerItems={FOOTER_ITEMS}
            current={current}
            onItemClick={onItemClick}
            actions={(collapsed) => <AskAgentButton collapsed={collapsed} active={askActive} onAsk={() => navigate('/ask')} />}
            utilities={(collapsed) => (drawer
              ? <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><Text as="h2" type="title-sm">Settings</Text><SettingsPanel /></div>
              : <SettingsMenu labelled={!collapsed} side="right" align="end" />)}
            utilitiesScroll
          />
        }
        topBar={<TopBar logo={PRODUCT_MARK} productName={RAIL_PRODUCT_NAME} title={title} summary={chrome?.summary} showControls={hasFilters} />}
        analysisBar={
          <AnalysisBar title={title} purpose={chrome?.purpose}>
            {hasFilters ? <div ref={setSlot} style={{ display: 'contents' }} /> : null}
          </AnalysisBar>
        }
        // The strip's control leads to Methods & data, where the sources and methods are written out in full, so it is a link there (not the empty-panel disclosure it was).
        strip={<SourceStrip summary="Sources: Our World in Data, Berkeley Earth, NOAA, PRIMAP-hist" compactSummary="Sources" detailsLabel={METHODS_ITEM.label} detailsHref={METHODS_ITEM.path} onDetailsClick={(event) => goTo(METHODS_ITEM.path, event)} />}
        footer={<Footer copyright={FOOTER_COPYRIGHT} links={[]} />}
      >
        <PagePurpose purpose={chrome?.ownsPurpose ? undefined : chrome?.purpose} />
        <SavedDataNotice />
        <Outlet />
        <BackToTop targetId="content" avoidSelector="footer" />
      </AppShell>
    </PageChromeContext.Provider>
  );
}

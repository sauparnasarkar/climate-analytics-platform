import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** What a page tells the shell about itself: the heading, one line of purpose, and a summary of its selection for the phone top bar. */
export interface PageChromeState {
  title: string;
  purpose?: string;
  /** The page writes its description itself in the compact layout (or has its own introduction), so the shell does not add one. */
  ownsPurpose?: boolean;
  summary?: string;
}

export interface PageChromeContextValue {
  set: (state: PageChromeState | null) => void;
  /** Tells the shell whether the page has page-wide filters, so a phone shows the controls button only when there is something to open. */
  setHasFilters: (has: boolean) => void;
  /** Where the page-wide filters are drawn: the analysis bar, or the controls sheet on a phone. */
  slot: HTMLElement | null;
}

export const PageChromeContext = createContext<PageChromeContextValue | null>(null);

/** The page-wide filters. Inside the dashboard shell they are drawn in the analysis bar (the controls sheet on a phone) while their state stays in the page; outside a shell, in place. */
export function PageFilters({ children }: { children: ReactNode }) {
  const chrome = useContext(PageChromeContext);
  const setHasFilters = chrome?.setHasFilters;
  useLayoutEffect(() => {
    setHasFilters?.(true);
    return () => setHasFilters?.(false);
  }, [setHasFilters]);
  if (!chrome) return <>{children}</>;
  return chrome.slot ? createPortal(children, chrome.slot) : null;
}

/** A page's heading and, optionally, its page-wide filters. Outside a shell it draws the heading in place, so a page can be rendered on its own. */
export function PageChrome({ title, purpose, ownsPurpose, summary, filters }: { title: string; purpose?: string; ownsPurpose?: boolean; summary?: string; filters?: ReactNode }) {
  const chrome = useContext(PageChromeContext);
  const set = chrome?.set;
  useLayoutEffect(() => {
    set?.({ title, purpose, ownsPurpose, summary });
    return () => set?.(null);
  }, [set, title, purpose, ownsPurpose, summary]);
  return (
    <>
      {chrome ? null : (
        <>
          <h1>{title}</h1>
          {purpose ? <p>{purpose}</p> : null}
        </>
      )}
      {filters != null && filters !== false ? <PageFilters>{filters}</PageFilters> : null}
    </>
  );
}

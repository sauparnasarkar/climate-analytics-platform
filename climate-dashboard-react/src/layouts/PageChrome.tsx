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
  /** Registers one set of page-wide filters and returns the function that withdraws it. The shell counts registrations, so a page may hold several (a stable block of filters
   * and a keyed block that remounts on a selection change): the slot and the phone's controls button stay for as long as any is registered, and only go when the last withdraws.
   * It must be stable across renders, so the effect that registers does not run again each time. */
  registerFilters: () => () => void;
  /** Where the page-wide filters are drawn: the analysis bar, or the controls sheet on a phone. */
  slot: HTMLElement | null;
}

export const PageChromeContext = createContext<PageChromeContextValue | null>(null);

/** The page-wide filters. Inside the dashboard shell they are drawn in the analysis bar (the controls sheet on a phone) while their state stays in the page; outside a shell, in place.
 * A page may render more than one: each draws into the same slot, in the order they mounted. */
export function PageFilters({ children }: { children: ReactNode }) {
  const chrome = useContext(PageChromeContext);
  const registerFilters = chrome?.registerFilters;
  useLayoutEffect(() => registerFilters?.(), [registerFilters]);
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

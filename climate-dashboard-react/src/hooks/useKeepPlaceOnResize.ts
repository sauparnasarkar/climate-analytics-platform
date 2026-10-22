import { useEffect } from 'react';

/** Slack (px) so a section whose top is just under the pinned rows still counts as reached (the scroll spy uses the same). */
const REACHED_SLACK_PX = 4;
/** Resizing is over when no resize event has come for this long (a rotation sends a burst of them). */
const SETTLE_MS = 150;

interface Place {
  id: string;
  /** How far below the section's top the pinned rows' bottom edge is. */
  offset: number;
}

/** The bottom edge of the bars pinned to the top of the page; the same measure a jump link lands below. */
function pinnedBottom() {
  return Math.max(0, ...[...document.querySelectorAll('[data-syn-sticky="top"]')].map((el) => el.getBoundingClientRect().bottom));
}

/** The sections the page's jump links point to, in link order; links to ids with no element yet (data still loading) are skipped. */
function jumpTargets(): HTMLElement[] {
  const ids = [...document.querySelectorAll('[data-syn-sticky="top"] a[href^="#"]')].map((a) => a.getAttribute('href')!.slice(1));
  return [...new Set(ids)].map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
}

/** The section the reader is in (the last one whose top has passed under the pinned rows) and how far into it, or null above the first. */
function placeNow(): Place | null {
  const pinned = pinnedBottom();
  let place: Place | null = null;
  for (const el of jumpTargets()) {
    const top = el.getBoundingClientRect().top;
    if (top <= pinned + REACHED_SLACK_PX) place = { id: el.id, offset: pinned - top };
  }
  return place;
}

/**
 * Keeps the reader where they were when the page's width changes (rotating a phone, resizing a window). The layout re-flows at a
 * new width, so the same scroll offset lands in another section; this puts the section the reader was in back under the pinned rows,
 * the same distance into it. Only a change of width counts: a phone browser showing or hiding its address bar changes the height alone.
 * Pages without jump links, and a reader above the first section, are left alone. `pathname` resets the remembered place on a route change.
 */
export function useKeepPlaceOnResize(pathname: string) {
  useEffect(() => {
    let width = window.innerWidth;
    let place = placeNow();
    let frame = 0;
    let restoreFrame = 0;
    let timer = 0;

    // While the width is changing the browser may already have moved the scroll offset and told us so; that place is not the reader's.
    const remember = () => { frame = 0; if (window.innerWidth === width) place = placeNow(); };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(remember); };

    const restore = () => {
      const saved = place;
      width = window.innerWidth;
      restoreFrame = window.requestAnimationFrame(() => {
        const target = saved ? document.getElementById(saved.id) : null;
        if (saved && target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - pinnedBottom() + saved.offset, behavior: 'instant' });
        place = placeNow();
      });
    };
    const onResize = () => {
      if (window.innerWidth === width) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(restore, SETTLE_MS);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
      if (frame) window.cancelAnimationFrame(frame);
      if (restoreFrame) window.cancelAnimationFrame(restoreFrame);
    };
  }, [pathname]);
}

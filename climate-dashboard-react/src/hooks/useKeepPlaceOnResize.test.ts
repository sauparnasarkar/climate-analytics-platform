import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeepPlaceOnResize } from './useKeepPlaceOnResize';

const PINNED = 100; // bottom of the sticky bar and row
// Where each section starts in the document, per layout: rotating re-flows the page, so the same section starts elsewhere.
const STARTS = { narrow: { a: 300, b: 1000, c: 2200 }, wide: { a: 260, b: 700, c: 1500 } } as const;
let layout: keyof typeof STARTS;
let scrollY: number;
let innerWidth: number;
const scrollTo = vi.fn((arg: ScrollToOptions) => { scrollY = arg.top ?? scrollY; });

function addPage({ unpinnedBar = false } = {}) {
  const row = document.createElement('div');
  row.dataset.synSticky = 'top';
  row.style.position = 'sticky';
  row.style.top = '56px'; // pinned below the 56px bar, so its bottom edge is PINNED
  if (unpinnedBar) {
    // The shell's bar on a short screen: it scrolls away with the page, so it is no part of what is pinned.
    const bar = document.createElement('section');
    bar.dataset.synSticky = 'top';
    bar.style.position = 'static';
    bar.getBoundingClientRect = () => ({ top: 0, bottom: 300, left: 0, right: 0, width: 0, height: 300, x: 0, y: 0, toJSON: () => ({}) });
    document.body.appendChild(bar);
  }
  row.getBoundingClientRect = () => ({ top: 56, bottom: PINNED, left: 0, right: 0, width: 0, height: 44, x: 0, y: 56, toJSON: () => ({}) });
  for (const id of Object.keys(STARTS.narrow)) {
    const link = document.createElement('a');
    link.href = `#${id}`;
    row.appendChild(link);
    const section = document.createElement('section');
    section.id = id;
    section.getBoundingClientRect = () => { const top = STARTS[layout][id as 'a'] - scrollY; return { top, bottom: top + 500, left: 0, right: 0, width: 0, height: 500, x: 0, y: top, toJSON: () => ({}) }; };
    document.body.appendChild(section);
  }
  document.body.appendChild(row);
}

const scroll = () => act(() => { window.dispatchEvent(new Event('scroll')); vi.advanceTimersByTime(50); });
/** What rotating does: the viewport width changes, the page re-flows, the browser may move the scroll offset, then the resize event arrives. */
function rotate(width: number, to: keyof typeof STARTS, browserScrollY?: number) {
  innerWidth = width;
  layout = to;
  if (browserScrollY !== undefined) scrollY = browserScrollY;
}
const resize = () => act(() => { window.dispatchEvent(new Event('resize')); vi.advanceTimersByTime(400); });

beforeEach(() => {
  vi.useFakeTimers();
  layout = 'narrow';
  scrollY = 0;
  innerWidth = 390;
  scrollTo.mockClear();
  Object.defineProperty(window, 'scrollY', { get: () => scrollY, configurable: true });
  Object.defineProperty(window, 'innerWidth', { get: () => innerWidth, configurable: true });
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  addPage();
});
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe('useKeepPlaceOnResize', () => {
  it('measures only what is pinned: a bar that scrolls away with the page is not counted', () => {
    document.body.innerHTML = '';
    addPage({ unpinnedBar: true });
    renderHook(() => useKeepPlaceOnResize('/overview'));
    scrollY = 800; // section b starts 200px down: below the pinned row (100px), so the reader is still in section a, 600px in
    scroll();
    rotate(844, 'wide');
    resize();
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 260 - PINNED + 600 }));
  });

  it('after the width changes, puts the reader back in the same place in the same section', () => {
    renderHook(() => useKeepPlaceOnResize('/overview'));
    scrollY = 1000 - PINNED + 150; // 150px into section b
    scroll();
    rotate(844, 'wide');
    resize();
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 700 - PINNED + 150 }));
  });

  it('keeps the place the reader had before the re-flow even when the browser has already moved the scroll offset and a scroll event followed', () => {
    renderHook(() => useKeepPlaceOnResize('/overview'));
    scrollY = 1000 - PINNED + 150;
    scroll();
    rotate(844, 'wide', 0); // the browser clamped to the top
    scroll(); // ...and told us so, before the resize event
    resize();
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 700 - PINNED + 150 }));
  });

  it('does nothing when only the height changes (a phone browser showing or hiding its address bar)', () => {
    renderHook(() => useKeepPlaceOnResize('/overview'));
    scrollY = 1000 - PINNED + 150;
    scroll();
    resize();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does nothing when the reader is above the first section', () => {
    renderHook(() => useKeepPlaceOnResize('/overview'));
    scrollY = 0; // section a starts at 300, below the pinned rows
    scroll();
    rotate(844, 'wide');
    resize();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does not carry a place from the previous page over to the next one', () => {
    const { rerender } = renderHook(({ path }) => useKeepPlaceOnResize(path), { initialProps: { path: '/overview' } });
    scrollY = 1000 - PINNED + 150;
    scroll();
    scrollY = 0; // the new page opens at the top; no scroll event is sent
    rerender({ path: '/historical' });
    rotate(844, 'wide');
    resize();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('works again after a restore: a second rotation returns to the section it started from', () => {
    renderHook(() => useKeepPlaceOnResize('/overview'));
    scrollY = 1000 - PINNED + 150;
    scroll();
    rotate(844, 'wide');
    resize();
    rotate(390, 'narrow');
    resize();
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 1000 - PINNED + 150 }));
  });
});

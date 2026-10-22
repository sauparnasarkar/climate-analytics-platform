import { useEffect, useState } from 'react';
import { useShell } from '@syena/ds';

/**
 * The height in px of the shell's bar pinned to the top of the page (the analysis bar, or the top bar on a phone), kept current as the bar
 * changes size or the shell swaps one for the other. Anything pinned beneath it uses this as its `top`. 0 where there is no shell, and
 * while the bar is not pinned (on a short screen it scrolls away with the page, so what is beneath it pins at the top).
 */
export function useStickyBarHeight(): number {
  const [height, setHeight] = useState(0);
  // The bar is replaced (not resized) when the shell switches between wide and compact.
  const compact = useShell()?.compact;
  useEffect(() => {
    let observed: Element | null = null;
    const bars = new ResizeObserver(() => measure());
    function measure() {
      // The shell's own bar, not another pinned row (those are inside the canvas).
      const bar = [...document.querySelectorAll('[data-syn-sticky="top"]')].find((el) => !el.closest('#content')) ?? null;
      if (bar !== observed) {
        if (observed) bars.unobserve(observed);
        observed = bar;
        if (bar) bars.observe(bar);
      }
      const pinned = bar !== null && ['sticky', 'fixed'].includes(getComputedStyle(bar).position);
      setHeight(bar && pinned ? Math.ceil(bar.getBoundingClientRect().height) : 0);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => { bars.disconnect(); window.removeEventListener('resize', measure); };
  }, [compact]);
  return height;
}

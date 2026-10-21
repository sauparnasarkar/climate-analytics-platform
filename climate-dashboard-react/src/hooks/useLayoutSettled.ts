import { useEffect, useState } from 'react';

/**
 * True once the page's height has stopped changing for `quietMs` after `active` turns true (or after `maxMs` regardless). A jump to a target low on a page
 * measured before the tables and charts above it have drawn lands short of where the target ends up; this tells a page when the layout has stopped moving.
 */
export function useLayoutSettled(active: boolean, quietMs = 300, maxMs = 4000): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const start = performance.now();
    let lastHeight = document.documentElement.scrollHeight;
    let lastChange = start;
    let frame = 0;
    const check = () => {
      const now = performance.now();
      const height = document.documentElement.scrollHeight;
      if (height !== lastHeight) { lastHeight = height; lastChange = now; }
      if (now - lastChange >= quietMs || now - start >= maxMs) { setSettled(true); return; }
      frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [active, quietMs, maxMs]);
  return settled;
}

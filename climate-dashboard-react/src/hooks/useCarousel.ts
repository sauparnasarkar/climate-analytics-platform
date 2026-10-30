import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@syena/ds';

/** Seconds a banner stays up before auto-rotating. */
export const CAROUSEL_DWELL_MS = 10000;

export interface UseCarouselOptions {
  count: number;
  dwellMs?: number;
  /** Whether it rotates on its own at the start (default true); Play still starts it. */
  autoplay?: boolean;
  /** Whether rotation is allowed right now (default true), read on every render: while false nothing rotates, and the Play/Pause choice is kept for when it turns true (for example a window turned from upright to sideways). */
  enabled?: boolean;
  /** While true the slide stays up, whatever the dwell (for example while the slide's own animation plays through). The dwell starts afresh when it turns false. */
  hold?: boolean;
}

export type CarouselDirection = 'forward' | 'back';

export interface UseCarouselResult {
  index: number;
  /** The slide just left, or null before the first move. With `direction` it tells the view which way to slide. */
  previous: number | null;
  /** The way the last move went: Next and auto-rotate are always forward (also when wrapping from the last slide to the first);
   * Previous is back; jumping to a slide by tab goes forward to a later one and back to an earlier one. */
  direction: CarouselDirection;
  /** Whether auto-rotate is on: the Play/Pause button's state, and nothing else. */
  autoplay: boolean;
  goTo: (i: number) => void;
  next: () => void;
  prev: () => void;
  pause: () => void;
  play: () => void;
}

interface Nav {
  index: number;
  previous: number | null;
  direction: CarouselDirection;
}

/**
 * Carousel auto-rotate controlled by one thing: the Play/Pause button.
 * It rotates every `dwellMs` while on; Pause stops it and Play starts it. Moving to a slide by hand (arrows, tabs, ←/→) does
 * not change that state -- the dwell simply starts afresh on the slide you chose. The pointer, focus and the browser tab have no
 * effect. Under `prefers-reduced-motion` it starts paused (an explicit Play is a request for movement).
 */
export function useCarousel({ count, dwellMs = CAROUSEL_DWELL_MS, autoplay: autoplayAtStart = true, enabled = true, hold = false }: UseCarouselOptions): UseCarouselResult {
  const reducedMotion = useReducedMotion();
  const [nav, setNav] = useState<Nav>({ index: 0, previous: null, direction: 'forward' });
  const [paused, setPaused] = useState(reducedMotion || !autoplayAtStart);

  // Paused by reduced motion rather than by the visitor: when reduced motion goes away (the Motion setting moved to Full or System, or the
  // device's preference changed) the rotation resumes. Once the visitor has pressed Play or Pause it is theirs, and nothing here touches it.
  const stoppedByMotion = useRef(reducedMotion && autoplayAtStart);
  useEffect(() => {
    if (reducedMotion) {
      setPaused((was) => { if (!was) stoppedByMotion.current = true; return true; });
    } else if (stoppedByMotion.current) {
      stoppedByMotion.current = false;
      setPaused(false);
    }
  }, [reducedMotion]);

  const wrap = useCallback((i: number) => ((i % count) + count) % count, [count]);
  const move = useCallback((to: number, direction: CarouselDirection) => {
    setNav((n) => (n.index === to ? n : { index: to, previous: n.index, direction }));
  }, []);

  const running = !paused && enabled && !hold && count > 1;
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => move(wrap(nav.index + 1), 'forward'), dwellMs);
    return () => clearTimeout(id);
  }, [running, nav.index, dwellMs, move, wrap]);

  const goTo = useCallback((i: number) => {
    const to = wrap(i);
    move(to, to > nav.index ? 'forward' : 'back');
  }, [move, wrap, nav.index]);
  const next = useCallback(() => move(wrap(nav.index + 1), 'forward'), [move, wrap, nav.index]);
  const prev = useCallback(() => move(wrap(nav.index - 1), 'back'), [move, wrap, nav.index]);
  const pause = useCallback(() => { stoppedByMotion.current = false; setPaused(true); }, []);
  const play = useCallback(() => { stoppedByMotion.current = false; setPaused(false); }, []);

  return { index: nav.index, previous: nav.previous, direction: nav.direction, autoplay: !paused && enabled, goTo, next, prev, pause, play };
}

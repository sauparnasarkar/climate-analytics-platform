import { useRef, type PointerEvent } from 'react';

/** How far a finger must travel sideways, in px, to count as a swipe. */
export const SWIPE_MIN_PX = 48;
/** The longest a swipe may take, in ms: a slower drag is someone reading, selecting or pointing. */
export const SWIPE_MAX_MS = 700;
/** Sideways travel must beat vertical travel by this factor, so scrolling the page never reads as a swipe. */
export const SWIPE_AXIS_RATIO = 1.5;

/** Things that already use a sideways drag or a tap of their own (the globe, a slider, a control, a link, a table): a swipe that starts on one is left to it. */
const OWN_GESTURE = 'canvas, input, select, textarea, button, a[href], [role="slider"], table';

export interface UseSwipeOptions {
  /** Called with 'left' when the finger moved left (the next item) and 'right' when it moved right (the previous). */
  onSwipe: (direction: 'left' | 'right') => void;
  /** Whether swiping is on right now, read on every gesture. */
  enabled?: boolean;
}

interface Start {
  id: number;
  x: number;
  y: number;
  at: number;
}

/** Pointer handlers that turn a quick sideways touch into `onSwipe`. Touch and pen only; a mouse drag is not a swipe. Put `touch-action: pan-y pinch-zoom` on the element so the page still scrolls up and down and zooms and the browser leaves the sideways move to this. */
export function useSwipe({ onSwipe, enabled = true }: UseSwipeOptions) {
  const start = useRef<Start | null>(null);
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      // A second finger (a pinch) ends the gesture rather than starting another.
      if (!e.isPrimary) { start.current = null; return; }
      if (!enabled || e.pointerType === 'mouse') return;
      if ((e.target as Element).closest?.(OWN_GESTURE)) return;
      start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp };
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      start.current = null;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!enabled || e.timeStamp - s.at > SWIPE_MAX_MS) return;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return;
      onSwipe(dx < 0 ? 'left' : 'right');
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}

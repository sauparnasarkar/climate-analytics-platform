import { useEffect, useId, useLayoutEffect, useState, type ReactNode } from 'react';
import { Icon, useReducedMotion } from '@syena/ds';
import { useCarousel } from '../../hooks/useCarousel';
import { useMediaQuery } from '../../hooks/useMediaQuery';

// The landing's top-of-fold carousel (Area 2, requirements §2.1): two banners,
// auto-rotate controlled only by an always-visible Pause/Play button; slides slide in and out sideways (no motion under reduced-motion settings).

export interface CarouselSlide {
  id: string;
  /** Short name, used in the tab and the slide's accessible label */
  label: string;
  /** `active` is false while the slide is hidden, so it can hold back its own animation. `hold(true)` keeps the carousel on this slide (for example while its animation plays) until `hold(false)`. */
  render: (active: boolean, hold: (holding: boolean) => void) => ReactNode;
}

export const CAROUSEL_STYLES = `
.hero-carousel { display: flex; flex-direction: column; }
.hero-carousel__slides { display: grid; overflow: hidden; }
/* Slides slide sideways. The one coming in and the one going out are animated by keyframes (not parked positions), so the
   direction follows the move itself: forward -- Next, auto-rotate, also from the last slide round to the first -- brings the new
   slide in from the right and sends the old one out to the left; back reverses it. */
.hero-carousel__slide { grid-area: 1 / 1; align-self: start; min-width: 0; opacity: 0; visibility: hidden; pointer-events: none; }
.hero-carousel__slide[data-motion="rest"] { opacity: 1; visibility: visible; pointer-events: auto; }
.hero-carousel__slide[data-motion="enter-forward"] { visibility: visible; pointer-events: auto; animation: hero-slide-in-from-right 500ms cubic-bezier(.4, 0, .2, 1) both; }
.hero-carousel__slide[data-motion="enter-back"] { visibility: visible; pointer-events: auto; animation: hero-slide-in-from-left 500ms cubic-bezier(.4, 0, .2, 1) both; }
.hero-carousel__slide[data-motion="exit-forward"] { animation: hero-slide-out-to-left 500ms cubic-bezier(.4, 0, .2, 1) both; }
.hero-carousel__slide[data-motion="exit-back"] { animation: hero-slide-out-to-right 500ms cubic-bezier(.4, 0, .2, 1) both; }
@keyframes hero-slide-in-from-right { from { transform: translateX(100%); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes hero-slide-in-from-left { from { transform: translateX(-100%); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes hero-slide-out-to-left { from { transform: none; opacity: 1; visibility: visible; } to { transform: translateX(-100%); opacity: 0; visibility: hidden; } }
@keyframes hero-slide-out-to-right { from { transform: none; opacity: 1; visibility: visible; } to { transform: translateX(100%); opacity: 0; visibility: hidden; } }
/* No movement under reduced motion: the slide that is leaving is simply gone and the new one is there. */
.hero-carousel--static .hero-carousel__slide { animation: none !important; }
.hero-carousel--static .hero-carousel__slide[data-motion^="enter"] { opacity: 1; }
.hero-carousel--static .hero-carousel__slide[data-motion^="exit"] { visibility: hidden; opacity: 0; }
.hero-carousel__controls { order: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 var(--landing-pad-x); padding: 10px 0 12px; --carousel-line: var(--syn-color-border-emphasis); --carousel-line: color-mix(in srgb, var(--syn-color-text-muted) 55%, transparent); border-top: 1px solid var(--carousel-line); } /* one visible line for the controls row, its buttons and the tab row's rule (same colour as the KPI row, ClimateSignalBanner): the divider tokens vanish on the tinted light background */
.hero-carousel__btn { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; height: 36px; padding: 0 12px; border-radius: 4px; cursor: pointer; font: inherit; font-size: 14px; color: inherit; background: transparent; border: 1px solid var(--carousel-line, currentColor); }
.hero-carousel__btn[aria-current="true"] { background: var(--syn-color-surface-raised); font-weight: 600; }
.hero-carousel__hint { margin-left: auto; font-size: 13px; color: var(--syn-color-text-muted); }
/* With page anchors the row's right side is the anchors; the rotation hint stays for screen readers only. */
.hero-carousel__hint--quiet { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.hero-carousel__anchors { margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 22px; font-size: 14px; }
.hero-carousel__anchors-title { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--syn-color-text-muted); }
.hero-carousel__anchors a { color: inherit; font-weight: 500; text-decoration: none; }
.hero-carousel__anchors a:hover { text-decoration: underline; }
.hero-carousel__count { display: none; }
/* A laptop, desktop or tablet turned sideways (any pointer): the hero is at least --hero-h tall (set by the landing: the viewport less the header, the row and a peek of the next section, within a band) and grows only if the taller banner needs more, so the next section shows above the fold -- and both banners fill it, so the row does not move between banners. */
@media (min-width: 1101px) {
  .hero-carousel__slides { min-height: var(--hero-h); }
  .hero-carousel__slide { align-self: stretch; }
}
/* A finger on the same bar (an iPad turned sideways): the buttons grow to a 44 px target instead of the bar changing into something else. */
@media (min-width: 1101px) and (pointer: coarse) {
  .hero-carousel__btn { min-width: 44px; height: 44px; }
}
/* A tablet turned sideways or a narrow laptop window: the page links stay on the one line beside the tabs. */
@media (min-width: 1101px) and (max-width: 1320px) {
  .hero-carousel__anchors { flex-wrap: nowrap; gap: 4px 16px; font-size: 13px; }
  .hero-carousel__anchors-title { display: none; }
}
/* Stacked layouts (a tablet upright, a phone): the controls are a row of tabs under the header, one per banner, 44 px tall -- above the banner, so they cover nothing and the second banner can be found. Previous/Next, the count, the hint and the page links are dropped (the tabs do their job). */
@media (max-width: 1100px) {
  .hero-carousel__hint, .hero-carousel__anchors, .hero-carousel__btn--prev, .hero-carousel__btn--next { display: none; }
  /* The slides are stacked in one grid cell, so the tallest would set the height: only the showing (and, during the move, the leaving) slide takes room. */
  .hero-carousel__slide[data-motion="hidden"] { display: none; }
  .hero-carousel__controls { order: 0; flex-wrap: nowrap; gap: 4px; padding: 8px 0 0; border-top: 0; border-bottom: 1px solid var(--carousel-line); }
  .hero-carousel__btn { min-width: 44px; height: 44px; }
  .hero-carousel__btn--dot { order: 1; flex: 1 1 0; min-width: 0; padding: 0 4px; gap: 6px; border: 0; border-bottom: 3px solid transparent; border-radius: 0; margin-bottom: -1px; background: none; font-size: 14px; line-height: 1.15; text-align: center; }
  .hero-carousel__btn--dot[aria-current="true"] { background: none; border-bottom-color: var(--syn-color-accent-fill); }
  .hero-carousel__btn--dot .hero-carousel__num { margin-right: 0 !important; color: var(--syn-color-text-muted); }
  .hero-carousel__btn--playpause { order: 2; padding: 0 12px; }
}
/* A phone: the tab row, then a hero at least --hero-h-phone tall (the first banner's picture fills what its text leaves; the globe's banner needs more), then the next section's top. Auto-rotate is off on a touch screen, so the Play/Pause button is there only while the banners are rotating. */
@media (max-width: 640px) {
  .hero-carousel__slides { min-height: var(--hero-h-phone); }
  .hero-carousel__slide { align-self: stretch; }
  .hero-carousel:not(.hero-carousel--auto) .hero-carousel__btn--playpause { display: none; }
}
`;

export interface PageAnchor {
  href: string;
  label: string;
}

export function HeroCarousel({ slides, ariaLabel = 'Featured', anchors = [] }: { slides: CarouselSlide[]; ariaLabel?: string; anchors?: PageAnchor[] }) {
  // A touch screen does not rotate on its own (the tabs are the way to the other banner); a pointer that can hover does.
  const touch = useMediaQuery('(pointer: coarse)');
  const [holding, setHolding] = useState(false);
  const c = useCarousel({ count: slides.length, autoplay: !touch, hold: holding });
  const reducedMotion = useReducedMotion();
  const uid = useId();
  // The first slide is simply there; after a move, the new one enters and the old one leaves, each in the move's direction.
  // The leaving slide only needs its state while its exit runs; after that it is plainly hidden (on a phone that frees its room).
  // `settled` is reset before paint on every move, so the leaving slide never shows a frame of "hidden" before its exit starts.
  const [settled, setSettled] = useState(false);
  useLayoutEffect(() => setSettled(false), [c.index]);
  useEffect(() => {
    if (c.previous === null) return;
    const t = window.setTimeout(() => setSettled(true), 520);
    return () => window.clearTimeout(t);
  }, [c.index, c.previous]);
  // Under reduced motion there is no exit to wait for, so the previous slide is settled at once (no delayed height change on a phone).
  const leaving = settled || reducedMotion ? null : c.previous;
  const motionOf = (i: number) => (i === c.index ? (c.previous === null ? 'rest' : `enter-${c.direction}`) : i === leaving ? `exit-${c.direction}` : 'hidden');

  return (
    <section
      className={`hero-carousel${reducedMotion ? ' hero-carousel--static' : ''}${c.autoplay ? ' hero-carousel--auto' : ''}`}
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        // ←/→ switch slides only from the carousel's own controls (or the region itself). A key pressed inside a slide --
        // the hero's Year slider, say -- keeps its own meaning, and an event something else already handled is left alone.
        if (e.defaultPrevented) return;
        const target = e.target as HTMLElement;
        if (target !== e.currentTarget && !target.closest('.hero-carousel__controls')) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); c.next(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); c.prev(); }
      }}
    >
      {/* First in the DOM (so first in tab order) but drawn below the slides (CSS `order`): the pause control
          must be reachable before the moving content. */}
      <div className="hero-carousel__controls">
        <button type="button" className="hero-carousel__btn hero-carousel__btn--playpause" onClick={c.autoplay ? c.pause : c.play} aria-label={c.autoplay ? 'Pause slides: automatic rotation' : 'Play slides: automatic rotation'}>
          {c.autoplay ? 'Pause slides' : 'Play slides'}
        </button>
        <button type="button" className="hero-carousel__btn hero-carousel__btn--prev" onClick={c.prev} aria-label="Previous slide"><Icon name="previous" size="small" /></button>
        {slides.map((s, i) => (
          <button key={s.id} type="button" className="hero-carousel__btn hero-carousel__btn--dot" aria-current={i === c.index} aria-controls={`${uid}-${s.id}`} onClick={() => c.goTo(i)}>
            <span className="hero-carousel__num" style={{ fontFamily: 'var(--syn-family-figure)', fontSize: 11, marginRight: 8 }}>{String(i + 1).padStart(2, '0')}</span>
            <span className="hero-carousel__label">{s.label}</span>
          </button>
        ))}
        <button type="button" className="hero-carousel__btn hero-carousel__btn--next" onClick={c.next} aria-label="Next slide"><Icon name="next" size="small" /></button>
        <span className="hero-carousel__count" aria-hidden="true">{c.index + 1} of {slides.length}</span>
        <span className={`hero-carousel__hint${anchors.length ? ' hero-carousel__hint--quiet' : ''}`}>{c.autoplay ? 'Auto-rotating · use Pause to stop' : 'Auto-rotate off · ← → to switch'}</span>
        {anchors.length > 0 && (
          <nav className="hero-carousel__anchors" aria-label="On this page">
            <span className="hero-carousel__anchors-title"><Icon name="down" size="small" />On this page</span>
            {anchors.map((a) => <a key={a.href} href={a.href}>{a.label}</a>)}
          </nav>
        )}
      </div>
      <div className="hero-carousel__slides" aria-live={c.autoplay ? 'off' : 'polite'}>
        {slides.map((s, i) => (
          <div key={s.id} id={`${uid}-${s.id}`} className="hero-carousel__slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}: ${s.label}`} data-active={i === c.index} data-motion={motionOf(i)}
            // Hidden slides are also removed from the accessibility tree and made inert (CSS `visibility` alone would do the
            // same in a browser; this states it explicitly so focus and assistive tech can never reach a slide that isn't showing).
            aria-hidden={i !== c.index} inert={i !== c.index}>
            {s.render(i === c.index, setHolding)}
          </div>
        ))}
      </div>
    </section>
  );
}

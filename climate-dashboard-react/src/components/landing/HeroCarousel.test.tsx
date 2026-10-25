import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAROUSEL_STYLES, HeroCarousel } from './HeroCarousel';

const SLIDES = [
  { id: 'a', label: 'Climate signal', render: () => <p>First banner</p> },
  { id: 'b', label: 'Emissions', render: () => <p>Second banner</p> },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q: string) => ({ matches: q === '(min-width: 1101px)', media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const mount = () => render(<><style>{CAROUSEL_STYLES}</style><HeroCarousel slides={SLIDES} /></>);
const slideEl = (n: number) => document.querySelectorAll('.hero-carousel__slide')[n] as HTMLElement;

describe('HeroCarousel controls', () => {
  it('keeps the Pause/Play button first in tab order, ahead of the moving content and the other controls', () => {
    mount();
    const controls = document.querySelector('.hero-carousel__controls')!;
    expect(controls.firstElementChild).toBe(screen.getByRole('button', { name: /automatic rotation/i }));
    expect(controls.compareDocumentPosition(document.querySelector('.hero-carousel__slides')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('names the Pause/Play button with the word it shows, in both states (label in name)', () => {
    mount();
    const button = document.querySelector('.hero-carousel__btn--playpause') as HTMLElement;
    expect(button).toHaveTextContent('Pause slides');
    expect(button).toHaveAccessibleName(/^Pause slides/);
    fireEvent.click(button);
    expect(button).toHaveTextContent('Play slides');
    expect(button).toHaveAccessibleName(/^Play slides/);
  });

  it('has a dot per banner that keeps its name for assistive technology, marks the current one, and shows a "1 of 2" count (not announced twice)', () => {
    mount();
    const dots = Array.from(document.querySelectorAll('.hero-carousel__btn--dot'));
    expect(dots).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Climate signal/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /Emissions/ })).toHaveAttribute('aria-current', 'false');
    const count = document.querySelector('.hero-carousel__count')!;
    expect(count).toHaveTextContent('1 of 2');
    expect(count).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(count).toHaveTextContent('2 of 2');
  });

  it('on a stacked layout the controls are a row of tabs under the header, above the banner, not a floating pill', () => {
    const css = CAROUSEL_STYLES;
    expect(css).not.toMatch(/position: sticky/);
    expect(css).not.toMatch(/border-radius: 999px/);
    const stacked = css.slice(css.indexOf('@media (max-width: 1100px)'));
    expect(stacked).toMatch(/\.hero-carousel__controls \{ order: 0;/);
    expect(stacked).toMatch(/min-width: 44px; height: 44px/);
    expect(stacked).toMatch(/\.hero-carousel__slide\[data-motion="hidden"\] \{ display: none; \}/);
    // every tab keeps a 44 px target, and the current one is marked by a rule under it
    expect(stacked).toMatch(/\.hero-carousel__btn--dot\[aria-current="true"\] \{[^}]*border-bottom-color/);
  });

  it('chooses the desktop layout by width, whatever the pointer: no fine-pointer condition on the hero height; finger-sized buttons on a touch screen', () => {
    expect(CAROUSEL_STYLES).toMatch(/@media \(min-width: 1101px\) \{\s*\.hero-carousel__slides \{ min-height: var\(--hero-h\)/);
    expect(CAROUSEL_STYLES).not.toMatch(/\(pointer: fine\)/);
    expect(CAROUSEL_STYLES).toMatch(/@media \(min-width: 1101px\) and \(pointer: coarse\) \{\s*\.hero-carousel__btn \{ min-width: 44px; height: 44px/);
  });

  it('stops rotating when the window goes from wide to upright without a remount', () => {
    let wide = true;
    const listeners = new Set<() => void>();
    window.matchMedia = ((q: string) => ({ get matches() { return wide && q === '(min-width: 1101px)'; }, media: q, addEventListener: (_: string, l: () => void) => listeners.add(l), removeEventListener: (_: string, l: () => void) => listeners.delete(l) })) as unknown as typeof window.matchMedia;
    mount();
    expect(document.querySelector('.hero-carousel')).toHaveClass('hero-carousel--auto');
    wide = false;
    act(() => { listeners.forEach((l) => l()); });
    expect(document.querySelector('.hero-carousel')).not.toHaveClass('hero-carousel--auto');
    act(() => { vi.advanceTimersByTime(12000); });
    expect(slideEl(0)).toHaveAttribute('data-motion', 'rest');
  });

  it('rotates on its own only in the wide layout (where Play slides is), whatever the pointer; not on a tablet upright or a phone', () => {
    const at = (wide: boolean) => { window.matchMedia = ((q: string) => ({ matches: wide && q === '(min-width: 1101px)', media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia; };
    at(false);
    const { unmount } = mount();
    expect(document.querySelector('.hero-carousel')).not.toHaveClass('hero-carousel--auto');
    act(() => { vi.advanceTimersByTime(12000); });
    expect(slideEl(0)).toHaveAttribute('data-motion', 'rest');
    expect(CAROUSEL_STYLES).toMatch(/@media \(max-width: 1100px\) \{[^@]*\.hero-carousel__btn--playpause \{ display: none; \}/);
    unmount();
    at(true);
    mount(); // a touch screen as wide as an iPad turned sideways
    expect(document.querySelector('.hero-carousel')).toHaveClass('hero-carousel--auto');
  });
});

describe('HeroCarousel leaving slide', () => {
  it('under reduced motion the previous slide is hidden at once, with no 520 ms wait', () => {
    window.matchMedia = ((q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(slideEl(0)).toHaveAttribute('data-motion', 'hidden');
    expect(slideEl(1)).toHaveAttribute('data-motion', 'enter-forward');
  });


  it('keeps the leaving slide in its exit state while it moves out, then marks it plainly hidden', () => {
    mount();
    expect(slideEl(1)).toHaveAttribute('data-motion', 'hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(slideEl(0)).toHaveAttribute('data-motion', 'exit-forward');
    expect(slideEl(1)).toHaveAttribute('data-motion', 'enter-forward');
    act(() => { vi.advanceTimersByTime(600); });
    expect(slideEl(0)).toHaveAttribute('data-motion', 'hidden');
    expect(slideEl(1)).toHaveAttribute('data-motion', 'enter-forward');
  });

  it('does it again on a later move back to a slide it has already shown', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.click(screen.getByRole('button', { name: 'Previous slide' }));
    expect(slideEl(1)).toHaveAttribute('data-motion', 'exit-back');
    act(() => { vi.advanceTimersByTime(600); });
    expect(slideEl(1)).toHaveAttribute('data-motion', 'hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(slideEl(0)).toHaveAttribute('data-motion', 'exit-forward'); // not left "hidden" by the earlier settle
    expect(within(slideEl(1)).getByText('Second banner')).toBeInTheDocument();
  });
});

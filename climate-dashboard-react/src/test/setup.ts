import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement ResizeObserver at all — the design system's DataTable uses it
// (scroll-hint sizing), so any test rendering DataTable would otherwise throw
// "ResizeObserver is not defined" as soon as its effect runs.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// Assigned, not vi.stubGlobal: a test's vi.unstubAllGlobals() (for its own matchMedia stub) would otherwise remove this too.
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom has no matchMedia: the design system's hooks (compact layout, reduced motion, theme) read it. Tests that need
// a particular answer replace it for themselves.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }),
  });
}

// jsdom has no FontFaceSet: the design system's DataTable waits on it before it measures its columns.
if (!document.fonts) {
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => Promise.resolve([]), ready: Promise.resolve() } });
}

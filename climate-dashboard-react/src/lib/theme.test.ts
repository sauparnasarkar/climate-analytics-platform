import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, readStoredTheme, storeTheme, systemTheme } from './theme';

describe('stored theme', () => {
  beforeEach(() => localStorage.clear());

  it('is the design system\'s own theme name, and none (null) when nothing is stored', () => {
    expect(readStoredTheme()).toBeNull();
    localStorage.setItem(THEME_STORAGE_KEY, 'tidewater');
    expect(readStoredTheme()).toBe('tidewater');
  });

  it('ignores any stored value that is not one of the two themes', () => {
    for (const v of ['', 'dark', 'light', 'system', 'Night']) {
      localStorage.setItem(THEME_STORAGE_KEY, v);
      expect(readStoredTheme()).toBeNull();
    }
  });

  it('stores the choice under the app\'s key', () => {
    storeTheme('tidewater');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('tidewater');
    expect(THEME_STORAGE_KEY).toBe('climate-analytics-theme');
  });

  it('carries on when storage is blocked', () => {
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readStoredTheme()).toBeNull();
    expect(() => storeTheme('tidewater')).not.toThrow();
    blocked.mockRestore();
    set.mockRestore();
  });
});

describe('systemTheme', () => {
  const stub = (dark: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(prefers-color-scheme: dark)' && dark, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
  it('is Dark (night) where the device asks for dark, Light (tidewater) where it does not', () => {
    stub(true); expect(systemTheme()).toBe('night');
    stub(false); expect(systemTheme()).toBe('tidewater');
    vi.unstubAllGlobals();
  });
  it('is Dark where the browser cannot say', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(systemTheme()).toBe('night');
    vi.unstubAllGlobals();
  });
});

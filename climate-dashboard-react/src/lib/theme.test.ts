import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, readStoredTheme, storeTheme } from './theme';

describe('stored theme', () => {
  beforeEach(() => localStorage.clear());

  it('is the design system\'s own theme name, and Dark (night) when nothing is stored', () => {
    expect(readStoredTheme()).toBe('night');
    localStorage.setItem(THEME_STORAGE_KEY, 'tidewater');
    expect(readStoredTheme()).toBe('tidewater');
  });

  it('ignores any stored value that is not one of the two themes', () => {
    for (const v of ['', 'dark', 'light', 'system', 'Night']) {
      localStorage.setItem(THEME_STORAGE_KEY, v);
      expect(readStoredTheme()).toBe('night');
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
    expect(readStoredTheme()).toBe('night');
    expect(() => storeTheme('tidewater')).not.toThrow();
    blocked.mockRestore();
    set.mockRestore();
  });
});

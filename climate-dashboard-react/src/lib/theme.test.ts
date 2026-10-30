import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_THEME_STORAGE_KEY, THEME_CHOICES, THEME_STORAGE_KEY, clearStoredTheme, migrateLegacyTheme } from './theme';

describe('theme choices', () => {
  it('are System, Light, Dark in that order, on the design system\'s own names', () => {
    expect(THEME_CHOICES).toEqual([
      { value: 'system', label: 'System' },
      { value: 'tidewater', label: 'Light' },
      { value: 'night', label: 'Dark' },
    ]);
  });
  it('are stored under the renamed key', () => {
    expect(THEME_STORAGE_KEY).toBe('degrees-of-carbon-theme');
    expect(LEGACY_THEME_STORAGE_KEY).toBe('climate-analytics-theme');
  });
});

describe('migrateLegacyTheme', () => {
  beforeEach(() => localStorage.clear());

  it('copies a choice made under the old key to the new one and deletes the old', () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, 'tidewater');
    migrateLegacyTheme();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('tidewater');
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });

  it('does nothing when there is no old key, so a System visitor stays on System', () => {
    migrateLegacyTheme();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('keeps a choice already made under the new key, and still deletes the old key', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'night');
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, 'tidewater');
    migrateLegacyTheme();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('night');
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });

  it('drops an old value that is not a theme instead of carrying it over', () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, 'purple');
    migrateLegacyTheme();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });

  it('carries on when storage is blocked', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => migrateLegacyTheme()).not.toThrow();
    expect(() => clearStoredTheme()).not.toThrow();
    get.mockRestore(); remove.mockRestore();
  });
});

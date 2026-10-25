import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from './theme';
import { useAppTheme } from './useAppTheme';

// A device whose preference can change while the page is open.
function device(dark: boolean) {
  const listeners = new Set<() => void>();
  let isDark = dark;
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => ({
    get matches() { return q === '(prefers-color-scheme: dark)' && isDark; },
    media: q,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return { set: (next: boolean) => { isDark = next; listeners.forEach((l) => l()); }, restore: () => { window.matchMedia = original; } };
}

describe('useAppTheme', () => {
  let d: ReturnType<typeof device>;
  beforeEach(() => localStorage.clear());
  afterEach(() => d?.restore());

  it('starts on the device\'s own theme: Dark on a dark device, Light on a light one, and stores nothing', () => {
    d = device(true);
    expect(renderHook(() => useAppTheme()).result.current[0]).toBe('night');
    d.restore(); d = device(false);
    expect(renderHook(() => useAppTheme()).result.current[0]).toBe('tidewater');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('follows the device while the page is open, until the toggle is used', () => {
    d = device(false);
    const { result } = renderHook(() => useAppTheme());
    expect(result.current[0]).toBe('tidewater');
    act(() => d.set(true));
    expect(result.current[0]).toBe('night');
    act(() => d.set(false));
    expect(result.current[0]).toBe('tidewater');
  });

  it('a choice with the toggle is stored and from then on wins over the device', () => {
    d = device(true);
    const { result } = renderHook(() => useAppTheme());
    act(() => result.current[1]('tidewater'));
    expect(result.current[0]).toBe('tidewater');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('tidewater');
    act(() => d.set(false)); act(() => d.set(true));
    expect(result.current[0]).toBe('tidewater');
  });

  it('a stored choice from an earlier visit wins over the device on first paint', () => {
    d = device(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'tidewater');
    expect(renderHook(() => useAppTheme()).result.current[0]).toBe('tidewater');
  });

  it('works where storage is blocked: the device\'s theme, and the toggle lasts for the session', () => {
    d = device(true);
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useAppTheme());
    expect(result.current[0]).toBe('night');
    act(() => result.current[1]('tidewater'));
    expect(result.current[0]).toBe('tidewater');
    get.mockRestore(); set.mockRestore();
  });
});

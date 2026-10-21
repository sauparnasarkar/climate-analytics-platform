import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutSettled } from './useLayoutSettled';

let height = 1000;
beforeEach(() => {
  vi.useFakeTimers();
  height = 1000;
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() => height);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('useLayoutSettled', () => {
  it('is false until the page height has been still for the quiet time, and stays false while the height keeps changing', () => {
    const { result } = renderHook(() => useLayoutSettled(true, 300, 4000));
    expect(result.current).toBe(false);
    for (let i = 0; i < 8; i += 1) { act(() => { height += 100; vi.advanceTimersByTime(100); }); } // growing every 100 ms
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(150); }); // still for about 250 ms (the last step's own 100 ms included): not yet 300
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe(true);
  });

  it('gives up waiting after the longest time for a page that never stops moving', () => {
    const { result } = renderHook(() => useLayoutSettled(true, 300, 1000));
    for (let i = 0; i < 9; i += 1) { act(() => { height += 10; vi.advanceTimersByTime(100); }); }
    expect(result.current).toBe(false);
    act(() => { height += 10; vi.advanceTimersByTime(200); });
    expect(result.current).toBe(true);
  });

  it('does not start counting until it is active', () => {
    const { result, rerender } = renderHook(({ on }) => useLayoutSettled(on, 300, 4000), { initialProps: { on: false } });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(false);
    rerender({ on: true });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe(true);
  });
});

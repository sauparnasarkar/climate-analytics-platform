import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useStickyBarHeight } from './useStickyBarHeight';

function addBar(position: string, height: number) {
  const bar = document.createElement('section');
  bar.dataset.synSticky = 'top';
  bar.style.position = position;
  bar.getBoundingClientRect = () => ({ height, top: 0, bottom: height, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(bar);
  return bar;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('useStickyBarHeight', () => {
  it("is the height of the shell's bar while the bar is pinned", () => {
    addBar('sticky', 195);
    const { result } = renderHook(() => useStickyBarHeight());
    expect(result.current).toBe(195);
  });

  it('is 0 while the bar is not pinned (on a short screen it scrolls away with the page), so a row pinned beneath it sits at the top', () => {
    addBar('static', 195);
    const { result } = renderHook(() => useStickyBarHeight());
    expect(result.current).toBe(0);
  });

  it('follows the bar as it becomes pinned or stops being pinned (the screen changes size)', () => {
    const bar = addBar('sticky', 195);
    const { result } = renderHook(() => useStickyBarHeight());
    expect(result.current).toBe(195);
    bar.style.position = 'static';
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(result.current).toBe(0);
    bar.style.position = 'sticky';
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(result.current).toBe(195);
  });

  it('does not count a pinned row inside the page content as the shell bar', () => {
    const content = document.createElement('div');
    content.id = 'content';
    document.body.appendChild(content);
    const row = addBar('sticky', 47);
    content.appendChild(row);
    const { result } = renderHook(() => useStickyBarHeight());
    expect(result.current).toBe(0);
  });
});

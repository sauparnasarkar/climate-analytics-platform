import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { announceNewVersion, announceStalePage, forgetNewVersion, resetUpdateState, useNewVersion } from './updateState';
import { applyUpdateIfIdle, trackUpdate } from './updates';

afterEach(() => { resetUpdateState(); vi.useRealTimers(); });

describe('the offer to reload', () => {
  it('goes away when the waiting worker is gone, as before', () => {
    const { result } = renderHook(() => useNewVersion());
    act(() => announceNewVersion());
    expect(result.current).toBeGreaterThan(0);
    act(() => forgetNewVersion());
    expect(result.current).toBe(0);
  });

  it('stays when the page was left on old scripts after a worker took over, whatever clears the waiting state', () => {
    const { result } = renderHook(() => useNewVersion());
    act(() => announceStalePage());
    act(() => forgetNewVersion());
    expect(result.current).toBeGreaterThan(0);
  });

  it('survives the whole sequence: a worker waits, someone types, the fallback passes, the worker activates later; no automatic reload and the offer remains', () => {
    vi.useFakeTimers();
    const listeners: Record<string, Array<() => void>> = {};
    const on = (type: string, fn: () => void) => { (listeners[type] ||= []).push(fn); };
    const fire = (type: string) => (listeners[type] || []).forEach((fn) => fn());
    const worker = { postMessage: vi.fn(), addEventListener: vi.fn() } as unknown as ServiceWorker;
    const registration = { waiting: worker as ServiceWorker | null, installing: null, addEventListener: on, removeEventListener: vi.fn() } as unknown as ServiceWorkerRegistration;
    const container = { controller: {} as ServiceWorker, addEventListener: on, removeEventListener: vi.fn() } as unknown as ServiceWorkerContainer;
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    const reload = vi.fn();
    let touched = false;
    const { result } = renderHook(() => useNewVersion());
    trackUpdate(registration, container, {
      onWaiting: () => { if (!applyUpdateIfIdle({ registration, container, interacted: () => touched, ageMs: () => 100, storage, reload, onDeferred: announceStalePage })) announceNewVersion(); },
      onClear: forgetNewVersion,
    });
    expect(result.current).toBe(0); // taking over was asked for; nothing is offered yet
    touched = true; // typing starts
    act(() => { vi.advanceTimersByTime(3000); }); // the fallback wait passes without a controller change
    expect(reload).not.toHaveBeenCalled();
    expect(result.current).toBeGreaterThan(0); // the offer is up
    // The worker activates at last: nothing waits any more, and the controller changes.
    (registration as { waiting: ServiceWorker | null }).waiting = null;
    act(() => { fire('controllerchange'); });
    expect(reload).not.toHaveBeenCalled();
    expect(result.current).toBeGreaterThan(0); // the offer survives
  });
});

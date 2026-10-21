import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadWhenActivated, trackUpdate, watchForUpdates } from './updates';

const registration = () => ({ update: vi.fn().mockResolvedValue(undefined) }) as unknown as ServiceWorkerRegistration & { update: ReturnType<typeof vi.fn> };

describe('watchForUpdates', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not look at once (the browser has just fetched the worker), only on a timer', () => {
    const reg = registration();
    const stop = watchForUpdates(reg, { intervalMs: 1000 });
    expect(reg.update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(reg.update).toHaveBeenCalledTimes(3);
    stop();
  });

  it('looks again when the tab comes back to the front, not when it goes away', () => {
    const reg = registration();
    const stop = watchForUpdates(reg, { intervalMs: 60_000 });
    reg.update.mockClear();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reg.update).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reg.update).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops looking once stopped, and a failed look (offline) is not an error', async () => {
    const reg = registration();
    reg.update.mockRejectedValue(new Error('offline'));
    const stop = watchForUpdates(reg, { intervalMs: 1000 });
    await Promise.resolve();
    stop();
    reg.update.mockClear();
    vi.advanceTimersByTime(5000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reg.update).not.toHaveBeenCalled();
  });
});


class FakeWorker extends EventTarget {
  state = 'installed';
  postMessage = vi.fn();
}
// A browser profile's registration and the container that says whether this page is controlled.
function lab({ controlled }: { controlled: boolean }) {
  const container = Object.assign(new EventTarget(), { controller: controlled ? new FakeWorker() : null });
  const registration = Object.assign(new EventTarget(), { active: new FakeWorker(), waiting: null as FakeWorker | null, installing: null as FakeWorker | null });
  const events = { waiting: vi.fn(), clear: vi.fn() };
  const stop = trackUpdate(registration as unknown as ServiceWorkerRegistration, container as unknown as ServiceWorkerContainer, { onWaiting: events.waiting, onClear: events.clear });
  // A new worker is found, installs and, with a controlled page, waits.
  const deploy = () => {
    const worker = new FakeWorker();
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    registration.installing = null;
    if (controlled) registration.waiting = worker; // with no controlled page the browser activates it at once instead of keeping it waiting
    else registration.active = worker;
    worker.dispatchEvent(new Event('statechange'));
    return worker;
  };
  return { container, registration, events, stop, deploy };
}

describe('trackUpdate', () => {
  it('stays quiet for a profile that has an activated registration and no controller, however many workers install', () => {
    const { events, deploy, stop } = lab({ controlled: false });
    deploy();
    deploy();
    expect(events.waiting).not.toHaveBeenCalled();
    stop();
  });

  it('stays quiet while a worker waits but this page is not controlled by one', () => {
    const { events, registration } = lab({ controlled: false });
    registration.waiting = new FakeWorker();
    registration.dispatchEvent(new Event('updatefound'));
    expect(events.waiting).not.toHaveBeenCalled();
  });

  it('announces a waiting worker once the page is controlled, and clears when it is no longer waiting', () => {
    const { events, registration, deploy } = lab({ controlled: true });
    const worker = deploy();
    expect(events.waiting).toHaveBeenCalledTimes(1);
    registration.waiting = null; // it activated
    worker.dispatchEvent(new Event('statechange'));
    expect(events.clear).toHaveBeenCalledTimes(1);
  });

  it('announces a worker that is already waiting when the page starts to track', () => {
    const container = Object.assign(new EventTarget(), { controller: new FakeWorker() });
    const registration = Object.assign(new EventTarget(), { waiting: new FakeWorker(), installing: null });
    const onWaiting = vi.fn();
    trackUpdate(registration as unknown as ServiceWorkerRegistration, container as unknown as ServiceWorkerContainer, { onWaiting, onClear: vi.fn() });
    expect(onWaiting).toHaveBeenCalledTimes(1);
  });

  it('clears when the controller changes and nothing is waiting any more', () => {
    const { events, registration, container, deploy } = lab({ controlled: true });
    deploy();
    registration.waiting = null;
    container.dispatchEvent(new Event('controllerchange'));
    expect(events.clear).toHaveBeenCalledTimes(1);
  });

  it('announces again for a second deploy that replaces the first while the tab stays open, and not twice for the same worker', () => {
    const { events, registration, deploy } = lab({ controlled: true });
    const first = deploy();
    registration.dispatchEvent(new Event('updatefound')); // looked again, same worker still waiting
    expect(events.waiting).toHaveBeenCalledTimes(1);
    deploy(); // the first goes redundant, a second waits in its place
    first.dispatchEvent(new Event('statechange'));
    expect(events.waiting).toHaveBeenCalledTimes(2);
  });
});

describe('reloadWhenActivated', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const setup = (waiting: boolean) => {
    const container = new EventTarget() as unknown as ServiceWorkerContainer;
    const worker = new FakeWorker();
    const registration = { waiting: waiting ? worker : null } as unknown as ServiceWorkerRegistration;
    const reload = vi.fn();
    return { container, worker, registration, reload };
  };

  it('tells the waiting worker to take over, and reloads only once the controller has changed', () => {
    const { container, worker, registration, reload } = setup(true);
    reloadWhenActivated(registration, container, reload);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads anyway after a short wait if the controller never changes, so it never does nothing', () => {
    const { container, registration, reload } = setup(true);
    reloadWhenActivated(registration, container, reload, 2000);
    vi.advanceTimersByTime(1999);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads at once when nothing is waiting', () => {
    const { container, registration, reload } = setup(false);
    reloadWhenActivated(registration, container, reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

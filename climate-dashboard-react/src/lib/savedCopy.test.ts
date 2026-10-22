import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVED_AT_HEADER, describeSavedAt, recordResponse, resetSavedData, savedCopyPlugin, savedDataSince } from './savedCopy';

afterEach(() => { vi.useRealTimers(); resetSavedData(); });

describe('savedCopyPlugin', () => {
  it('stamps a response with the time it is saved, keeps its body, status and other headers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-10-14T09:30:00Z'));
    const stamped = await savedCopyPlugin.cacheWillUpdate({ response: new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } }) });
    expect(stamped.headers.get(SAVED_AT_HEADER)).toBe('2025-10-14T09:30:00.000Z');
    expect(stamped.headers.get('content-type')).toBe('application/json');
    expect(stamped.status).toBe(200);
    expect(await stamped.json()).toEqual({ a: 1 });
  });

  it('the stamp is the time the copy was saved: serving it a year later does not change it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-10-14T09:30:00Z'));
    const stored = await savedCopyPlugin.cacheWillUpdate({ response: new Response('x') });
    vi.setSystemTime(new Date('2026-10-22T08:00:00Z'));
    const served = stored.clone();
    expect(served.headers.get(SAVED_AT_HEADER)).toBe('2025-10-14T09:30:00.000Z');
    expect(describeSavedAt(served.headers.get(SAVED_AT_HEADER) as string, new Date('2026-10-22T08:00:00Z'))).toBe('14 October 2025');
  });

  it('is self-contained, so the worker script generated from it has nothing to resolve', () => {
    const source = savedCopyPlugin.cacheWillUpdate.toString();
    expect(source).toContain('x-saved-at');
    expect(source).not.toContain('SAVED_AT_HEADER');
  });
});

describe('describeSavedAt', () => {
  const now = new Date('2026-10-22T08:00:00Z');
  it('gives day and month, and adds the year only when it is not the current one', () => {
    expect(describeSavedAt('2026-10-14T09:30:00Z', now)).toBe('14 October');
    expect(describeSavedAt('2025-12-31T12:00:00Z', now)).toBe('31 December 2025');
  });
});

describe('what is on show, per URL', () => {
  beforeEach(() => resetSavedData());

  it('is saved while any URL’s latest response came from a copy, and the oldest copy is the one named', () => {
    recordResponse('/api/a', null);
    expect(savedDataSince()).toBeNull();
    recordResponse('/api/b', '2026-10-14T09:00:00.000Z');
    recordResponse('/api/c', '2026-10-10T09:00:00.000Z');
    expect(savedDataSince()).toBe('2026-10-10T09:00:00.000Z');
  });

  it('mixed case: a live response for one URL clears only that URL', () => {
    recordResponse('/api/a', '2026-10-14T09:00:00.000Z');
    recordResponse('/api/b', '2026-10-12T09:00:00.000Z');
    recordResponse('/api/b', null);
    expect(savedDataSince()).toBe('2026-10-14T09:00:00.000Z');
    recordResponse('/api/a', null);
    expect(savedDataSince()).toBeNull();
  });

  it('a later saved response for a URL that was live puts the notice back', () => {
    recordResponse('/api/a', null);
    recordResponse('/api/a', '2026-10-14T09:00:00.000Z');
    expect(savedDataSince()).toBe('2026-10-14T09:00:00.000Z');
  });
});

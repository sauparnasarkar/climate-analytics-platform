import { describe, expect, it } from 'vitest';
import { WORKER_CACHE_CONTROL, isWorkerScript } from './workerCache';

describe('isWorkerScript', () => {
  it('is the service worker script itself, at the root base and under a prefix', () => {
    expect(isWorkerScript('/sw.js', '/')).toBe(true);
    expect(isWorkerScript('/sw.js?cachebust=1', '/')).toBe(true);
    expect(isWorkerScript('/app-prefix/sw.js', '/app-prefix/')).toBe(true);
  });
  it('is nothing else: pages, hashed assets and the other worker files keep their normal caching', () => {
    for (const url of ['/', '/overview', '/assets/index-abc123.js', '/workbox-29a8e232.js', '/registerSW.js', '/x/sw.js', '/sw.json', '/sw.js.map']) expect(isWorkerScript(url, '/')).toBe(false);
    expect(isWorkerScript('/sw.js', '/app-prefix/')).toBe(false);
  });
});

describe('WORKER_CACHE_CONTROL', () => {
  it('says not to store: an edge that caches static scripts by extension rewrites no-cache into a four-hour browser lifetime, but leaves no-store alone', () => {
    expect(WORKER_CACHE_CONTROL).toBe('no-store');
  });
});

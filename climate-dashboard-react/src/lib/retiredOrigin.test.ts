import { describe, expect, it } from 'vitest';
import { DEFAULT_RETIRED_HOSTS, killSwitchWorker, parseRetiredHosts, retiredOriginReply } from './retiredOrigin';

const OLD = 'climate-analytics.syena.io';
const NEW = 'https://degreesofcarbon.syena.io';

describe('retiredOriginReply', () => {
  it('serves the kill-switch worker at /sw.js: 200, never stored, not a redirect', () => {
    const reply = retiredOriginReply({ method: 'GET', url: '/sw.js', host: OLD }, DEFAULT_RETIRED_HOSTS)!;
    expect(reply.status).toBe(200);
    expect(reply.headers['Cache-Control']).toBe('no-store');
    expect(reply.headers['Location']).toBeUndefined();
    expect(reply.body).toContain(NEW);
    expect(retiredOriginReply({ method: 'GET', url: '/sw.js?v=2', host: OLD }, DEFAULT_RETIRED_HOSTS)!.status).toBe(200);
  });

  it('sends every other path to the same path, query and all, on the new origin', () => {
    for (const url of ['/', '/overview?year=2010', '/climate-correlation#methodology', '/assets/index-abc.js', '/sw.json', '/x/sw.js']) {
      const reply = retiredOriginReply({ method: 'GET', url, host: OLD }, DEFAULT_RETIRED_HOSTS)!;
      expect(reply.status).toBe(301);
      expect(reply.headers['Location']).toBe(NEW + url);
    }
  });

  it('keeps the method of a POST with a 308, and matches the host without its port, in any case', () => {
    expect(retiredOriginReply({ method: 'POST', url: '/mcp', host: OLD }, DEFAULT_RETIRED_HOSTS)!.status).toBe(308);
    expect(retiredOriginReply({ method: 'GET', url: '/', host: 'Climate-Analytics.syena.io:443' }, DEFAULT_RETIRED_HOSTS)!.status).toBe(301);
  });

  it('leaves the new hosts and anything else to the app', () => {
    for (const host of ['degreesofcarbon.syena.io', 'degreesofcarbon-preview.syena.io', 'localhost:4173', undefined]) expect(retiredOriginReply({ method: 'GET', url: '/sw.js', host }, DEFAULT_RETIRED_HOSTS)).toBeNull();
  });

  it('retires the preview host to the preview host', () => {
    expect(retiredOriginReply({ method: 'GET', url: '/overview', host: 'climate-analytics-preview.syena.io' }, DEFAULT_RETIRED_HOSTS)!.headers['Location']).toBe('https://degreesofcarbon-preview.syena.io/overview');
  });
});

describe('parseRetiredHosts', () => {
  it('reads old=new pairs and falls back to the real hosts without them', () => {
    expect(parseRetiredHosts('old.localhost=http://new.localhost:4301/, b.test=https://c.test')).toEqual({ 'old.localhost': 'http://new.localhost:4301', 'b.test': 'https://c.test' });
    expect(parseRetiredHosts(undefined)).toBe(DEFAULT_RETIRED_HOSTS);
  });
});

describe('killSwitchWorker', () => {
  const source = killSwitchWorker(NEW);
  it('takes over, claims, clears the caches, unregisters, then moves each tab, and handles no fetches', () => {
    const order = ['skipWaiting', 'clients.claim', 'caches.delete', 'unregister', 'navigate'].map((s) => source.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(source).not.toMatch(/addEventListener\('fetch'|importScripts/);
  });
  it('is valid JavaScript', () => {
    expect(() => new Function(source)).not.toThrow();
  });
});

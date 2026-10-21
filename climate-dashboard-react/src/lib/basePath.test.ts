import { describe, expect, it } from 'vitest';
import { apiRuntimeCachePattern, backendProxyKey, navigateFallbackDenylist, stripTrailingSlash } from './basePath';

const denied = (base: string, url: string) => navigateFallbackDenylist(base).some((re) => re.test(url));

describe('stripTrailingSlash', () => {
  it('keeps the bare root and strips one trailing slash otherwise', () => {
    expect(stripTrailingSlash('/')).toBe('/');
    expect(stripTrailingSlash('/x/')).toBe('/x');
  });
});

describe('apiRuntimeCachePattern', () => {
  // Workbox's RegExpRoute runs the pattern against the request's full href, so these are full URLs.
  it('matches API requests by their full URL, at the root base and under a prefix', () => {
    const root = apiRuntimeCachePattern('/');
    for (const url of ['https://climate-analytics.syena.io/api/overview', 'https://climate-analytics.syena.io/api/overview?countries=China', 'http://localhost:4173/api/health']) {
      expect(root.test(url)).toBe(true);
    }
    expect(apiRuntimeCachePattern('/app-prefix/').test('https://labs.syena.io/app-prefix/api/overview')).toBe(true);
  });

  it('does not match look-alikes, other backends, or an api segment deeper in the path', () => {
    const root = apiRuntimeCachePattern('/');
    for (const url of ['https://climate-analytics.syena.io/apiary', 'https://climate-analytics.syena.io/agent/query', 'https://climate-analytics.syena.io/x/api/overview', 'https://climate-analytics.syena.io/overview', 'https://labs.syena.io/app-prefix/api/overview']) {
      expect(root.test(url)).toBe(false);
    }
  });

  it('regression: the old pathname-anchored pattern can never match a full URL', () => {
    expect(/^\/api\//.test('https://climate-analytics.syena.io/api/overview')).toBe(false);
  });
});

describe('navigateFallbackDenylist', () => {
  it("never answers Cloudflare's edge paths with the SPA shell -- Access's post-login callback must reach the edge", () => {
    for (const base of ['/', '/app-prefix/']) {
      for (const url of ['/cdn-cgi/access/authorized?kid=abc&meta=xyz', '/cdn-cgi/access/logout', '/cdn-cgi/trace', '/.well-known/cloudflare-access-protected-resource/admin']) {
        expect(denied(base, url)).toBe(true);
      }
    }
    expect(denied('/', '/cdn-cgi-notes')).toBe(false); // look-alike stays an app path
  });

  it('at the root base: sends backend prefixes, /admin and static files to the network', () => {
    for (const url of ['/api/health', '/api/overview?countries=China', '/mcp', '/agent/query', '/agent/admin/llm', '/admin', '/admin?x=1', '/report.pdf', '/sw.js?cachebust=1']) {
      expect(denied('/', url)).toBe(true);
    }
  });

  it('at the root base: leaves every SPA route on the shell fallback (including look-alikes)', () => {
    for (const url of ['/', '/overview', '/overview#pct-change', '/historical?countries=India', '/country-profile', '/ask', '/agentic', '/apis', '/mcp-notes', '/administrators']) {
      expect(denied('/', url)).toBe(false);
    }
  });

  it('at a prefixed base: the same rules apply under the prefix, not outside it', () => {
    const base = '/app-prefix/';
    expect(denied(base, '/app-prefix/agent/admin')).toBe(true);
    expect(denied(base, '/app-prefix/api/health')).toBe(true);
    expect(denied(base, '/app-prefix/overview')).toBe(false);
    expect(denied(base, '/agent/query')).toBe(false);
  });
});

describe('backendProxyKey', () => {
  // Vite's own test of a ^ key: `new RegExp(key).test(req.url)` (the url includes any query string).
  const matches = (key: string, url: string) => new RegExp(key).test(url);

  it('is a regex key (Vite treats a leading ^ that way) for the segment under the base', () => {
    expect(backendProxyKey('/', 'agent').startsWith('^')).toBe(true);
    expect(backendProxyKey('/app-prefix/', 'api').startsWith('^')).toBe(true);
  });

  it('matches the segment itself, its sub-paths and a query string', () => {
    const key = backendProxyKey('/', 'agent');
    for (const url of ['/agent', '/agent/', '/agent/query', '/agent/admin/llm', '/agent?x=1']) expect(matches(key, url)).toBe(true);
    expect(matches(backendProxyKey('/app-prefix/', 'api'), '/app-prefix/api/overview')).toBe(true);
  });

  it('does not match a path that only starts with the segment name, or the segment deeper in the path', () => {
    const key = backendProxyKey('/', 'agent');
    for (const url of ['/agentadmin/llm', '/agentx', '/agent%2Fadmin/llm', '/x/agent/query', '/Agent/query']) expect(matches(key, url)).toBe(false);
    expect(matches(backendProxyKey('/', 'api'), '/apiary')).toBe(false);
    expect(matches(backendProxyKey('/app-prefix/', 'api'), '/api/overview')).toBe(false);
  });
});

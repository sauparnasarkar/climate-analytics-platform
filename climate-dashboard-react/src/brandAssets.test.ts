import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p));
const text = (p: string) => read(p).toString('utf8');
const png = (p: string) => { const b = read(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] }; };

describe('brand assets', () => {
  it('the icon master is the 64x64 mark: dark ground, radius 14, three rising dots inside the central 80% circle', () => {
    const svg = text('public/favicon.svg');
    expect(svg).toMatch(/viewBox="0 0 64 64"/);
    expect(svg).toMatch(/<rect width="64" height="64" rx="14" fill="#0b1a2e"\/>/);
    const dots = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="(#[0-9a-f]{6})"/g)].map((m) => ({ x: +m[1], y: +m[2], r: +m[3], fill: m[4] }));
    expect(dots.map((d) => d.fill)).toEqual(['#8eaab7', '#2d9cbd', '#ffb53b']);
    // The maskable safe zone is the circle of radius 40% of the side (25.6 of 64) about the centre.
    for (const d of dots) expect(Math.hypot(d.x - 32, d.y - 32) + d.r).toBeLessThanOrEqual(25.6);
  });

  it('the PNG icons have their sizes; the touch icon and the maskable icon are opaque squares', () => {
    expect(png('public/icon-192.png')).toMatchObject({ w: 192, h: 192 });
    expect(png('public/icon-512.png')).toMatchObject({ w: 512, h: 512 });
    expect(png('public/icon-maskable-512.png')).toMatchObject({ w: 512, h: 512, colorType: 2 }); // 2 = RGB, no alpha: full bleed
    expect(png('public/apple-touch-icon.png')).toMatchObject({ w: 180, h: 180, colorType: 2 });
  });

  it('favicon.ico holds a 32 px and a 16 px image', () => {
    const ico = read('public/favicon.ico');
    expect(ico.readUInt16LE(2)).toBe(1);
    const n = ico.readUInt16LE(4);
    const sizes = Array.from({ length: n }, (_, i) => ico.readUInt8(6 + 16 * i)).sort((a, b) => a - b);
    expect(sizes).toEqual([16, 32]);
  });

  it('the share card is 1200x630 and under 300 KB', () => {
    expect(png('public/og-card.png')).toMatchObject({ w: 1200, h: 630 });
    expect(statSync(resolve(root, 'public/og-card.png')).size).toBeLessThan(300 * 1024);
  });

  it('index.html: the share-card meta, the large-image Twitter card, the icon links', () => {
    const html = text('index.html');
    const meta = (k: string, v: string) => expect(html).toContain(`${k}="${v}"`);
    expect(html).toContain('<meta property="og:image" content="https://degreesofcarbon.syena.io/og-card.png" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('<meta property="og:image:type" content="image/png" />');
    expect(html).toContain('<meta property="og:image:alt" content="Degrees of Carbon — how emissions add up to warming" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta name="twitter:image" content="https://degreesofcarbon.syena.io/og-card.png" />');
    meta('rel', 'apple-touch-icon');
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('href="/favicon.svg"');
  });

  it('the manifest names the five icons with their purposes and the icon ground as its colours', () => {
    const cfg = text('vite.config.ts');
    expect(cfg).toContain("const MANIFEST_COLOR = '#0b1a2e'");
    expect(cfg).toContain('theme_color: MANIFEST_COLOR');
    expect(cfg).toContain('background_color: MANIFEST_COLOR');
    expect(cfg).toContain("{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }");
    expect(cfg).toContain("{ src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }");
    expect(cfg).toContain("{ src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }");
  });
});

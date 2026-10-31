// Renders the brand files in public/ from their sources: the icon master (public/favicon.svg, a 64x64 grid) and the share card (brand/og-card.html).
//   favicon.ico (32 rounded + 16 square-cornered), apple-touch-icon.png (180, square, opaque), icon-192.png and icon-512.png (purpose "any"),
//   icon-maskable-512.png (full bleed), og-card.png (1200x630).
// Run: node scripts/build-brand-assets.mjs   (Playwright is read from the design-system checkout, SYN_DS_PATH or ../../syena-design-system)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const ds = process.env.SYN_DS_PATH ?? resolve(app, '../../syena-design-system');
const { chromium } = await import(pathToFileURL(join(ds, 'node_modules/playwright/index.mjs')).href);

const master = readFileSync(join(app, 'public/favicon.svg'), 'utf8');
const square = master.replace(/ rx="14"/, '');        // full-bleed: no rounded corners
if (square === master) throw new Error('favicon.svg: expected a rect with rx="14"');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function png(svg, size, opaque) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:${opaque ? '#0b1a2e' : 'transparent'}}svg{display:block}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  return page.screenshot({ type: 'png', omitBackground: !opaque, clip: { x: 0, y: 0, width: size, height: size } });
}
const out = (name, buf) => { writeFileSync(join(app, 'public', name), buf); console.log(name, buf.length, 'bytes'); };

out('icon-192.png', await png(master, 192, false));
out('icon-512.png', await png(master, 512, false));
out('apple-touch-icon.png', await png(square, 180, true));
out('icon-maskable-512.png', await png(square, 512, true));

// favicon.ico: PNG-compressed entries, 32 px with the rounded corners and 16 px square-cornered (a 16 px rounded tile loses its corner pixels to blur).
const entries = [[32, await png(master, 32, false)], [16, await png(square, 16, true)]];
const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
let offset = 6 + 16 * entries.length;
const dir = entries.map(([size, data]) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0); e.writeUInt8(size, 1); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
out('favicon.ico', Buffer.concat([head, ...dir, ...entries.map(([, d]) => d)]));

const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await card.goto(pathToFileURL(join(app, 'brand/og-card.html')).href, { waitUntil: 'networkidle' });
await card.evaluate(() => document.fonts.ready);
out('og-card.png', await card.locator('#card').screenshot({ type: 'png' }));
await browser.close();

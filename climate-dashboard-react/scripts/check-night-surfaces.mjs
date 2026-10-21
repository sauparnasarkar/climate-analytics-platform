// Opens each page in a real browser under the night theme and reports light surfaces and low-contrast text.
// Usage: node scripts/check-night-surfaces.mjs <base url> [theme: night|tidewater] [path ...]
// A page under the night theme must have no large opaque light panel and no text under 3:1 against what is behind it.
// The browser comes from the design system checkout next to this app (the same one its stories use).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../../syena-design-system/package.json'));
const { chromium } = require('playwright');

const THEME_KEY = 'climate-analytics-theme';
const IDS = { night: 'night', tidewater: 'tidewater' };
const PAGES = ['/', '/overview', '/historical', '/country-profile', '/forecasts', '/scenarios', '/data-explorer', '/climate-correlation', '/about', '/ask'];

const [base = 'http://127.0.0.1:4273', theme = 'night', ...rest] = process.argv.slice(2);
const pages = rest.length ? rest : PAGES;
if (!IDS[theme]) throw new Error(`theme must be night or tidewater, not ${theme}`);

/** Runs in the page: the opaque light backgrounds and the low-contrast text currently painted. */
function scan({ checkLight }) {
  const parse = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/) ?? value.match(/color\(srgb ([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    const scale = value.startsWith('color(') ? 255 : 1;
    return { r: parts[0] * scale, g: parts[1] * scale, b: parts[2] * scale, a: parts.length > 3 ? parts[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) layers.push(c);
      if (c && c.a >= 1) break;
    }
    return layers.reduceRight((under, layer) => over(layer, under), { r: 255, g: 255, b: 255, a: 1 });
  };
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 8 && r.height > 8 && r.bottom > 0 && r.right > 0 && r.left < innerWidth && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const found = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg, canvas, img, .js-plotly-plot, [disabled], [aria-disabled="true"]') || !visible(el)) continue;
    const own = parse(getComputedStyle(el).backgroundColor);
    const box = el.getBoundingClientRect();
    // Small light marks (legend swatches, a tooltip chip) are data or inverse colours; a panel is a light surface when it is large.
    // A data fill (a tile, a share-bar segment) carries a short label; a panel holds content.
    const panel = (box.width * box.height >= 20000 || box.width >= 300) && (el.textContent ?? '').trim().length > 40;
    if (checkLight && panel && own && own.a >= 0.9 && lum(own) > 0.45) found.push({ kind: 'light surface', where: label(el), detail: getComputedStyle(el).backgroundColor, text: (el.textContent ?? '').trim().slice(0, 40) });
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (hasText) {
      const fg = parse(getComputedStyle(el).color);
      if (!fg) continue;
      const bg = backdrop(el);
      const a = lum(over(fg, bg)) + 0.05;
      const b = lum(bg) + 0.05;
      const ratio = Math.max(a, b) / Math.min(a, b);
      if (ratio < 3) found.push({ kind: 'low contrast text', where: label(el), detail: `${ratio.toFixed(2)}:1`, text: el.textContent.trim().slice(0, 40) });
    }
  }
  return found;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
await context.addInitScript(([key, id]) => { try { localStorage.setItem(key, id); } catch { /* storage blocked */ } }, [THEME_KEY, IDS[theme]]);
let total = 0;
for (const route of pages) {
  const page = await context.newPage();
  await page.goto(new URL(route, base).href, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
  const set = await page.evaluate(() => document.querySelector('[data-syn-theme]')?.getAttribute('data-syn-theme'));
  const found = await page.evaluate(scan, { checkLight: theme === 'night' });
  const seen = new Set();
  const unique = found.filter((f) => { const k = `${f.kind}|${f.where}|${f.text}`; return seen.has(k) ? false : (seen.add(k), true); });
  console.log(`${route}  (theme=${set})  ${unique.length} finding(s)`);
  for (const f of unique.slice(0, 12)) console.log(`   ${f.kind}: ${f.where}  ${f.detail}  "${f.text}"`);
  if (unique.length > 12) console.log(`   ... ${unique.length - 12} more`);
  total += unique.length;
  await page.close();
}
await browser.close();
console.log(total === 0 ? `PASS: no light surface or low-contrast text under ${theme}` : `FAIL: ${total} finding(s) under ${theme}`);
process.exit(total === 0 ? 0 : 1);

// Scrolls the whole landing page and checks that no text of 18px or more has a line box that is too short for it: figures and card titles need at least 1.15 x
// their size, display headings at least 1.05 x. A shorter box lets a figure spill into the line below it and makes a wrapped heading's lines overlap.
// Usage: node scripts/check-landing-line-heights.mjs <base url> [WxH ...]   (default sizes 1440x900 and 390x844)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.resolve(here, '../../../syena-design-system/package.json'))('playwright');
const [base = 'http://127.0.0.1:4273', ...sizes] = process.argv.slice(2);

const browser = await chromium.launch({ args: ['--disable-features=OverlayScrollbar'], ignoreDefaultArgs: ['--hide-scrollbars'] });
let failures = 0;
for (const size of (sizes.length ? sizes : ['1440x900', '390x844'])) {
  const [w, h] = size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.click('.hero-carousel__btn--playpause');
  const found = [];
  const dots = await page.$$('.hero-carousel__btn--dot');
  for (let i = 0; i < dots.length; i += 1) {
    await dots[i].click();
    await page.waitForTimeout(900);
    found.push(...await scan(page));
  }
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) { await page.evaluate((top) => scrollTo(0, top), y); await page.waitForTimeout(150); }
  found.push(...await scan(page));
  const bad = [...new Map(found.map((f) => [f.text + f.y, f])).values()].filter((f) => f.ratio < (/^H[1-3]$/.test(f.tag) ? 1.05 : 1.15) - 0.001);
  console.log(`${size}: ${bad.length === 0 ? 'ok   every large text has a line box that fits it' : 'FAIL ' + bad.length + ' large text(s) with a line box that is too short'}`);
  for (const f of bad) console.log(`  ${f.tag} "${f.text}" ${f.fs}px on ${f.lh} (${f.ratio} x)`);
  failures += bad.length;
  await context.close();
}
await browser.close();
console.log(failures === 0 ? 'PASS' : `FAIL: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

function scan(page) {
  return page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n; (n = walker.nextNode());) {
      const t = n.textContent.trim();
      const el = n.parentElement;
      if (!t || seen.has(el) || !el.getClientRects().length) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      const fs = parseFloat(cs.fontSize);
      const lh = parseFloat(cs.lineHeight);
      if (Number.isNaN(lh) || fs < 18) continue;
      out.push({ text: t.slice(0, 40), tag: el.tagName, fs, lh: cs.lineHeight, ratio: +(lh / fs).toFixed(3), y: Math.round(el.getBoundingClientRect().top + scrollY) });
    }
    return out;
  });
}

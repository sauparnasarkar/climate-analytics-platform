// Opens the landing page at a phone width (with reduced motion, so the ranking holds still) and checks that no two country labels in the ranking overlap, with the longest names forced in.
// Usage: node scripts/check-race-labels.mjs <base url> [width ...]   (default widths 390 and 320)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.resolve(here, '../../../syena-design-system/package.json'))('playwright');
const [base = 'http://127.0.0.1:4273', ...widths] = process.argv.slice(2);
const LONGEST = ['United States of America', 'United Kingdom', 'Saudi Arabia', 'South Korea', 'Democratic Republic of the Congo', 'United Arab Emirates', 'South Africa', 'Russian Federation', 'Trinidad and Tobago', 'Bosnia and Herzegovina'];

const browser = await chromium.launch();
let failures = 0;
for (const width of (widths.length ? widths : ['390', '320']).map(Number)) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-race-label]').first().waitFor({ state: 'attached', timeout: 20000 });
  await page.locator('[data-race-label]').first().scrollIntoViewIfNeeded();
  // Force the longest names into the labels, as a data refresh with those countries in the top ten would.
  await page.evaluate((names) => { document.querySelectorAll('[data-race-label]').forEach((el, i) => { el.textContent = names[i % names.length]; }); }, LONGEST);
  await page.waitForTimeout(800);
  const boxes = await page.evaluate(() => [...document.querySelectorAll('[data-race-label]')].filter((el) => getComputedStyle(el.parentElement).opacity !== '0').map((el) => { const r = el.getBoundingClientRect(); return { text: el.textContent, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5 && a.left < b.right && b.left < a.right) overlaps.push(`${a.text} / ${b.text}`);
  }
  console.log(`${width}px: ${boxes.length} labels, ${overlaps.length} overlap(s)${overlaps.length ? ': ' + overlaps.slice(0, 4).join('; ') : ''}`);
  failures += overlaps.length;
  await context.close();
}
await browser.close();
console.log(failures === 0 ? 'PASS: no two ranking labels overlap' : `FAIL: ${failures} overlap(s)`);
process.exit(failures === 0 ? 0 : 1);

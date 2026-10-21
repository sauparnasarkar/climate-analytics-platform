// The globe names its top emitters while the years step, not only when it is paused, and never more than five.
// Usage: node scripts/check-landing-labels.mjs <base url> [WxH ...]   (default 1440x900)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.resolve(here, '../../../syena-design-system/package.json'))('playwright');
const [base = 'http://127.0.0.1:4273', ...sizes] = process.argv.slice(2);

const browser = await chromium.launch({ args: ['--disable-features=OverlayScrollbar'], ignoreDefaultArgs: ['--hide-scrollbars'] });
let failures = 0;
const check = (name, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures += 1; };
// A label is a country name and its value, e.g. "India 3,200".
const read = (page) => page.evaluate(() => {
  const root = document.querySelector('.landing-hero__globe');
  const pills = [...root.querySelectorAll('span')].filter((s) => s.children.length === 0 && /^[A-Za-zÀ-ÿ .'-]+ [\d,]+$/.test(s.textContent.trim())).map((s) => s.textContent.trim());
  const year = (root.textContent.match(/\b(19|20)\d{2}\b/) || [''])[0];
  return { pills, year };
});
for (const size of (sizes.length ? sizes : ['1440x900'])) {
  const [w, h] = size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.click('.hero-carousel__btn--playpause');
  await (await page.$$('.hero-carousel__btn--dot'))[1].click();
  await page.waitForTimeout(800);
  const samples = [];
  for (let i = 0; i < 6; i += 1) { samples.push(await read(page)); await page.waitForTimeout(500); }
  const years = new Set(samples.map((s) => s.year));
  console.log(`${size}: years seen ${[...years].join(',')}; labels per sample ${samples.map((s) => s.pills.length).join(',')}; e.g. ${JSON.stringify(samples[2].pills)}`);
  check('the years are stepping during the samples', years.size > 1);
  check('every sample while stepping has at least one label', samples.every((s) => s.pills.length >= 1));
  check('never more than five', samples.every((s) => s.pills.length <= 5));
  await context.close();
}
await browser.close();
process.exit(failures ? 1 : 0);

// The landing's primary buttons: the one on each banner has the same height and padding, and no link on the page carries a down chevron (a link goes somewhere; a chevron down says it opens).
// Usage: node scripts/check-landing-cta.mjs <base url> [WxH ...]   (default 1440x900)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.resolve(here, '../../../syena-design-system/package.json'))('playwright');
const [base = 'http://127.0.0.1:4273', ...sizes] = process.argv.slice(2);

const browser = await chromium.launch({ args: ['--disable-features=OverlayScrollbar'], ignoreDefaultArgs: ['--hide-scrollbars'] });
let failures = 0;
const check = (name, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures += 1; };
for (const size of (sizes.length ? sizes : ['1440x900'])) {
  const [w, h] = size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.click('.hero-carousel__btn--playpause');
  const primary = [];
  for (const i of [0, 1]) {
    await (await page.$$('.hero-carousel__btn--dot'))[i].click();
    await page.waitForTimeout(1000);
    primary.push(await page.evaluate(() => {
      const a = document.querySelector('.hero-carousel__slide[data-active="true"] a.app-cta--primary');
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      return { text: a.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), padding: cs.padding, font: cs.fontSize + '/' + cs.fontWeight, svg: a.querySelectorAll('svg').length };
    }));
  }
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) { await page.evaluate((top) => scrollTo(0, top), y); await page.waitForTimeout(100); }
  const chevronLinks = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => a.querySelector('svg.lucide-chevron-down, svg[class*="chevron-down"]')).map((a) => a.textContent.trim()));
  console.log(`${size}: "${primary[0].text}" ${primary[0].w}x${primary[0].h}, "${primary[1].text}" ${primary[1].w}x${primary[1].h}`);
  check(`both primary buttons are ${primary[0].h}px tall (${primary[0].h} / ${primary[1].h})`, primary[0].h === primary[1].h);
  check(`same padding and type (${primary[0].padding} ${primary[0].font} / ${primary[1].padding} ${primary[1].font})`, primary[0].padding === primary[1].padding && primary[0].font === primary[1].font);
  check(`the globe banner's button carries no icon (${primary[1].svg} svg)`, primary[1].svg === 0);
  check(`no link on the page has a down chevron (${JSON.stringify(chevronLinks)})`, chevronLinks.length === 0);
  await context.close();
}
await browser.close();
console.log(failures === 0 ? 'PASS' : `FAIL: ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);

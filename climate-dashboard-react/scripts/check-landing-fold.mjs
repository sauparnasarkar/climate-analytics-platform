// The landing hero above the fold on a laptop: with the carousel paused, the carousel's control row must sit wholly inside the viewport (its bottom at or above
// the viewport's), at the same place on both banners, and both banners must fit the same hero box so the row does not jump.
// Usage: node scripts/check-landing-fold.mjs <base url> [WxH ...]   (default 1440x757, 1440x900, 1366x768 and 1280x720)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.resolve(here, '../../../syena-design-system/package.json'))('playwright');
const [base = 'http://127.0.0.1:4273', ...sizes] = process.argv.slice(2);

const browser = await chromium.launch({ args: ['--disable-features=OverlayScrollbar'], ignoreDefaultArgs: ['--hide-scrollbars'] });
let failures = 0;
for (const size of (sizes.length ? sizes : ['1440x757', '1440x900', '1366x768', '1280x720'])) {
  const [w, h] = size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.click('.hero-carousel__btn--playpause');
  const seen = [];
  for (const i of [0, 1]) {
    await (await page.$$('.hero-carousel__btn--dot'))[i].click();
    await page.waitForTimeout(1200);
    seen.push(await page.evaluate(() => {
      const box = (e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top + scrollY), bottom: Math.round(b.bottom + scrollY) }; };
      const slides = document.querySelector('.hero-carousel__slides');
      const slide = document.querySelector('.hero-carousel__slide[data-active="true"]');
      return { row: box(document.querySelector('.hero-carousel__controls')), slides: box(slides), content: box(slide.firstElementChild), panel: box(slide.querySelector('figure')), overflow: slide.firstElementChild.getBoundingClientRect().bottom - slides.getBoundingClientRect().bottom, scrollbar: innerWidth - document.documentElement.clientWidth };
    }));
  }
  const [a, b] = seen;
  console.log(`${size}: row top ${b.row.top}, bottom ${b.row.bottom} (viewport ${h}); hero ${b.slides.top}-${b.slides.bottom}`);
  const check = (name, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures += 1; };
  check('scrollbars take room', a.scrollbar > 0);
  check(`row bottom ${b.row.bottom} is inside the viewport (${h})`, b.row.bottom <= h);
  check(`row is at the same place on both banners (${a.row.top} / ${b.row.top})`, a.row.top === b.row.top);
  check(`both banners fit the hero (content bottoms ${a.content.bottom} / ${b.content.bottom}, hero bottom ${b.slides.bottom})`, a.overflow <= 0.5 && b.overflow <= 0.5);
  check(`each banner's panel ends inside the hero (${a.panel.bottom} / ${b.panel.bottom})`, a.panel.bottom <= b.slides.bottom && b.panel.bottom <= b.slides.bottom);
  await context.close();
}
await browser.close();
console.log(failures === 0 ? 'PASS' : `FAIL: ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);

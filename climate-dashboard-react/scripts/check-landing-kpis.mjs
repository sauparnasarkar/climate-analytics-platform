// Opens each banner of the landing carousel (paused) in a browser whose scrollbars take room and checks that the two share one KPI strip and one layout:
// values with a line box that holds them, spacing on the space scale, the same value and label styles and the same column widths and top edges on both banners.
// Usage: node scripts/check-landing-kpis.mjs <base url> [WxH ...]   (default sizes 1440x900, 1440x757 and 1280x800)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.resolve(here, '../../../syena-design-system/package.json'))('playwright');
const [base = 'http://127.0.0.1:4273', ...sizes] = process.argv.slice(2);

const browser = await chromium.launch({ args: ['--disable-features=OverlayScrollbar'], ignoreDefaultArgs: ['--hide-scrollbars'] });
async function measure(width, height, index) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.click('.hero-carousel__btn--playpause');
  await (await page.$$('.hero-carousel__btn--dot'))[index].click();
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const px = (css) => { const el = document.createElement('div'); el.style.cssText = `position:absolute;height:${css}`; document.body.appendChild(el); const v = el.getBoundingClientRect().height; el.remove(); return Math.round(v * 100) / 100; };
    const space = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => px(`var(--syn-space-${n})`));
    const box = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
    const slide = document.querySelector('.hero-carousel__slide[data-active="true"]');
    const strip = slide.querySelector('.landing-kpi-strip');
    if (!strip) return { missing: true };
    const cs = (e) => getComputedStyle(e);
    const cells = [...strip.children].map((cell) => {
      const [v, l] = cell.children;
      const c = cs(cell);
      return { padTop: parseFloat(c.paddingTop), padBottom: parseFloat(c.paddingBottom), padLeft: parseFloat(c.paddingLeft), padRight: parseFloat(c.paddingRight), value: { fs: parseFloat(cs(v).fontSize), lh: parseFloat(cs(v).lineHeight), fw: cs(v).fontWeight, h: v.getBoundingClientRect().height, scrollH: v.scrollHeight, color: cs(v).color }, label: { fs: parseFloat(cs(l).fontSize), lh: parseFloat(cs(l).lineHeight), fw: cs(l).fontWeight, color: cs(l).color }, gap: l.getBoundingClientRect().top - v.getBoundingClientRect().bottom };
    });
    const h1 = slide.querySelector('h1');
    const text = h1.parentElement;
    const next = strip.nextElementSibling;
    return { space, cells, strip: box(strip), text: box(text), panel: box(slide.querySelector('figure')), h1: box(h1), eyebrow: box(text.firstElementChild), below: next ? Math.round(next.getBoundingClientRect().top - strip.getBoundingClientRect().bottom) : null };
  });
  await context.close();
  return r;
}

let failures = 0;
const check = (name, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures += 1; };
for (const size of (sizes.length ? sizes : ['1440x900', '1440x757', '1280x800'])) {
  const [w, h] = size.split('x').map(Number);
  const a = await measure(w, h, 0);
  const b = await measure(w, h, 1);
  console.log(`${size}`);
  if (a.missing || b.missing) { check('both banners use the shared KPI strip (.landing-kpi-strip)', false); continue; }
  for (const [name, m] of [['climate banner', a], ['globe banner', b]]) {
    check(`${name}: value line box holds the value (lh ${m.cells[0].value.lh} for ${m.cells[0].value.fs}px, at least 1.15x)`, m.cells.every((c) => c.value.lh >= 1.15 * c.value.fs && c.value.scrollH <= Math.ceil(c.value.h)));
    check(`${name}: cell padding is on the space scale (${m.cells[1].padTop}/${m.cells[1].padRight}/${m.cells[1].padBottom}/${m.cells[1].padLeft})`, m.cells.every((c) => [c.padTop, c.padBottom, c.padRight].every((p) => m.space.includes(p)) && (c.padLeft === 0 || m.space.includes(c.padLeft))));
    check(`${name}: clear space of at least ${m.space[3]}px above the value's line and below the label`, m.cells.every((c) => c.padTop >= m.space[3] && c.padBottom >= m.space[3]));
    check(`${name}: the label sits ${m.cells[0].gap}px under the value, on the scale`, m.cells.every((c) => m.space.includes(c.gap)));
  }
  const same = (what, f) => check(`same ${what} on both banners (${JSON.stringify(f(a))} / ${JSON.stringify(f(b))})`, JSON.stringify(f(a)) === JSON.stringify(f(b)));
  same('value size, weight and line height', (m) => [m.cells[0].value.fs, m.cells[0].value.fw, m.cells[0].value.lh]);
  same('label size, weight and line height', (m) => [m.cells[0].label.fs, m.cells[0].label.fw, m.cells[0].label.lh]);
  same('cell padding', (m) => [m.cells[1].padTop, m.cells[1].padRight, m.cells[1].padBottom, m.cells[1].padLeft]);
  same('space under the strip', (m) => m.below);
  same('strip width', (m) => m.strip.w);
  same('headline column left edge and width', (m) => [m.text.x, m.text.w]);
  same('panel left edge and width', (m) => [m.panel.x, m.panel.w]);
  same('eyebrow top', (m) => m.eyebrow.y);
  same('headline top', (m) => m.h1.y);
  same('panel top', (m) => m.panel.y);
}
await browser.close();
console.log(failures === 0 ? 'PASS: one KPI strip and one layout on both banners' : `FAIL: ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);

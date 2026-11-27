// The landing's first screen on a laptop or desktop (SPEC §5.25.1): with the carousel paused, the control row must sit wholly inside the viewport, at the same
// place on both banners, both banners must fit the same hero box so the row does not jump, the globe keeps its smallest size, and the next section shows:
// wider than 1400 px, its heading in full from 700 px of page height and the top of its four steps from 745 px; 1250-1400 px wide, from 720 and 760 px. Narrower than
// 1250 px a banner's content sets the hero's height and these two are not checked (SPEC §5.25.1). Both headlines hold two lines at 1101-1440 px (the display role)
// and, wider, on pages up to 800 px tall. Both themes. Sizes are page areas (the window less the browser's bars).
// Usage: node scripts/check-landing-fold.mjs <base url> [WxH ...]   (default 1101x800, 1180x800, 1300x800, 1301x800, 1408x726, 1440x726, 1425x700, 1440x789, 1536x864, 1920x1080, 2048x1152, 1366x768, 1280x800, 1280x720, an upright tablet 820x1180, and 1399, 1400, 1401, 1439, 1440 and 1441 x800)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.resolve(here, '../../../syena-design-system/package.json'))('playwright');
const [base = 'http://127.0.0.1:4273', ...sizes] = process.argv.slice(2);

const GLOBE_MIN = 360;
// The widest space the text column's own spacing allows between two of its parts above the button row.
const TEXT_GAP_MAX = 25;
// The sizes at which the button row sits at one height on both banners, on the picture's bottom edge.
const BUTTON_SIZES = ['1408x726', '1440x726', '1440x800', '1920x1080'];
// The wide layout starts here. In it, the "Forecasts to" link is left out on both banners below FORECASTS_LINK_MIN_WIDTH; narrower layouts keep it.
const WIDE_MIN_WIDTH = 1101;
const FORECASTS_LINK_MIN_WIDTH = 1301;
// The narrowest window the next-section checks apply to; narrower sizes keep every other check.
const NEXT_SECTION_MIN_WIDTH = 1250;
// The widths where the headlines step down to the display role, the height up to which the wider headline is held to two lines too,
// and the widest window that gets the later next-section heights (720 and 760 px).
const ROLE_WIDTHS = [1101, 1440];
const TWO_LINES_MAX_HEIGHT = 800;
const LATER_SECTION_MAX_WIDTH = 1400;
// How much of the steps' box must show to count as visible: their top border, padding and label line.
const STEPS_PEEK = 30;

const browser = await chromium.launch({ args: ['--disable-features=OverlayScrollbar'], ignoreDefaultArgs: ['--hide-scrollbars'] });
let failures = 0;
for (const [size, theme] of (sizes.length ? sizes : ['1101x800', '1180x800', '1300x800', '1301x800', '1408x726', '1440x726', '1425x700', '1440x789', '1536x864', '1920x1080', '2048x1152', '1366x768', '1280x800', '1280x720', '1399x800', '1400x800', '1401x800', '1439x800', '1440x800', '1441x800', '820x1180']).flatMap((s) => [[s, 'night'], [s, 'tidewater']])) {
  const [w, h] = size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addInitScript((t) => localStorage.setItem('degrees-of-carbon-theme', t), theme);
  const page = await context.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  if (w < WIDE_MIN_WIDTH) {
    // A narrower layout (tabs above the banner, the picture under the text): only the link is checked, on each banner.
    for (const i of [0, 1]) {
      await (await page.$$('.hero-carousel__btn--dot'))[i].click();
      await page.waitForTimeout(1200);
      const seen = await page.evaluate(() => {
        const slide = document.querySelector('.hero-carousel__slide[data-active="true"]');
        const link = slide.querySelector('.climate-banner__forecasts, .landing-hero__forecasts');
        const box = link.getBoundingClientRect();
        return { theme: document.documentElement.getAttribute('data-syn-theme'), shown: box.height > 0 && box.width > 0 && getComputedStyle(link).visibility === 'visible', text: link.textContent };
      });
      const ok = seen.shown && seen.theme === theme;
      console.log(`${i === 0 ? `${size} ${theme}: narrower layout\n` : ''}  ${ok ? 'ok  ' : 'FAIL'} banner ${i + 1} shows "${seen.text}" in the ${seen.theme} theme`);
      if (!ok) failures += 1;
    }
    await context.close();
    continue;
  }
  await page.click('.hero-carousel__btn--playpause');
  const seen = [];
  for (const i of [0, 1]) {
    await (await page.$$('.hero-carousel__btn--dot'))[i].click();
    await page.waitForTimeout(1200);
    seen.push(await page.evaluate(() => {
      const box = (e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top + scrollY), bottom: Math.round(b.bottom + scrollY) }; };
      const slides = document.querySelector('.hero-carousel__slides');
      const slide = document.querySelector('.hero-carousel__slide[data-active="true"]');
      const h1 = slide.querySelector('h1');
      // The text column's parts above the button row sit together at the top (the widest space between two of them); the row's own place; the footnote block's.
      const ctas = slide.querySelector('.climate-banner__ctas, .landing-hero__ctas');
      const parts = [...slide.querySelector('.climate-banner__text, .landing-hero__text').children].filter((e) => e !== ctas).map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0);
      const button = box(ctas.querySelector('a'));
      const ctaRow = Math.round(ctas.getBoundingClientRect().height);
      const widestGap = Math.round(Math.max(...parts.slice(1).map((r, n) => r.top - parts[n].bottom)));
      const [first, second] = document.querySelector('.chain-band__notes')?.children ?? [];
      const notes = first && second ? [Math.round(first.getBoundingClientRect().top - document.querySelector('.chain-band__steps').getBoundingClientRect().bottom), Math.round(second.getBoundingClientRect().top - first.getBoundingClientRect().bottom)] : null;
      const forecasts = ctas.querySelector('.climate-banner__forecasts, .landing-hero__forecasts').getBoundingClientRect().height > 0;
      return { forecasts, button, ctaRow, widestGap, notes, lines: Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)), theme: document.documentElement.getAttribute('data-syn-theme'), globe: Math.round(document.querySelector('.landing-hero__globe canvas').getBoundingClientRect().width), heading: box(document.querySelector('#chain-heading')), steps: box(document.querySelector('.chain-band__steps')), row: box(document.querySelector('.hero-carousel__controls')), slides: box(slides), content: box(slide.firstElementChild), panel: box(slide.querySelector('figure')), overflow: slide.firstElementChild.getBoundingClientRect().bottom - slides.getBoundingClientRect().bottom, scrollbar: innerWidth - document.documentElement.clientWidth };
    }));
  }
  const [a, b] = seen;
  // A resize and back must leave the hero exactly where it was.
  await page.setViewportSize({ width: w - 160, height: h - 60 });
  await page.waitForTimeout(600);
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => Math.round(document.querySelector('.hero-carousel__slides').getBoundingClientRect().height));
  console.log(`${size} ${theme}: heading ${b.heading.top}-${b.heading.bottom}, steps from ${b.steps.top}, globe ${b.globe}; row top ${b.row.top}, bottom ${b.row.bottom} (viewport ${h}); hero ${b.slides.top}-${b.slides.bottom}`);
  const check = (name, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures += 1; };
  check('scrollbars take room', a.scrollbar > 0);
  check(`the ${theme} theme is applied`, a.theme === theme);
  check(`the hero has one height on both banners (${a.slides.bottom - a.slides.top} / ${b.slides.bottom - b.slides.top}) and after a resize (${after})`, a.slides.bottom - a.slides.top === b.slides.bottom - b.slides.top && after === b.slides.bottom - b.slides.top);
  check(`the globe is at least ${GLOBE_MIN} px (${b.globe})`, b.globe >= GLOBE_MIN);
  if (w < NEXT_SECTION_MIN_WIDTH) console.log(`  --   next section not checked below ${NEXT_SECTION_MIN_WIDTH} px wide (heading ends ${b.heading.bottom}, steps from ${b.steps.top})`);
  const [headingFrom, stepsFrom] = w > LATER_SECTION_MAX_WIDTH ? [700, 745] : [720, 760];
  if (w >= ROLE_WIDTHS[0] && (w <= ROLE_WIDTHS[1] || h <= TWO_LINES_MAX_HEIGHT)) check(`both headlines hold at most two lines (${a.lines} / ${b.lines})`, a.lines <= 2 && b.lines <= 2);
  if (w >= NEXT_SECTION_MIN_WIDTH && h >= headingFrom) check(`the next section's heading is fully visible on both banners (${a.heading.bottom} / ${b.heading.bottom})`, a.heading.bottom <= h && b.heading.bottom <= h);
  if (w >= NEXT_SECTION_MIN_WIDTH && h >= stepsFrom) check(`the top of its steps is visible on both banners (from ${a.steps.top} / ${b.steps.top})`, a.steps.top + STEPS_PEEK <= h && b.steps.top + STEPS_PEEK <= h);
  check(`each banner's text stays together at the top (widest gap ${a.widestGap} / ${b.widestGap} px)`, a.widestGap <= TEXT_GAP_MAX && b.widestGap <= TEXT_GAP_MAX);
  check(`each banner's button row is one line (heights ${a.ctaRow} / ${b.ctaRow})`, a.ctaRow <= 50 && b.ctaRow <= 50);
  const wantsLink = w >= FORECASTS_LINK_MIN_WIDTH;
  check(`the Forecasts link is ${wantsLink ? 'shown' : 'left out'} on both banners`, a.forecasts === wantsLink && b.forecasts === wantsLink);
  const buttons = `button tops ${a.button.top} / ${b.button.top}, button bottoms ${a.button.bottom} / ${b.button.bottom}, picture bottoms ${a.panel.bottom} / ${b.panel.bottom}`;
  check(`the buttons are at one height on both banners (button tops ${a.button.top} / ${b.button.top})`, a.button.top === b.button.top);
  if (BUTTON_SIZES.includes(size)) {
    check('the buttons end on the picture\'s bottom edge on both banners', Math.abs(a.button.bottom - a.panel.bottom) <= 1 && Math.abs(b.button.bottom - b.panel.bottom) <= 1);
  } else console.log(`  --   ${buttons}`);
  check(`the footnotes are one block, 12 px under the steps and 4-6 px apart (${b.notes})`, Boolean(b.notes) && b.notes[0] === 12 && b.notes[1] >= 4 && b.notes[1] <= 6);
  check(`row bottom ${b.row.bottom} is inside the viewport (${h})`, b.row.bottom <= h);
  check(`row is at the same place on both banners (${a.row.top} / ${b.row.top})`, a.row.top === b.row.top);
  check(`both banners fit the hero (content bottoms ${a.content.bottom} / ${b.content.bottom}, hero bottom ${b.slides.bottom})`, a.overflow <= 0.5 && b.overflow <= 0.5);
  check(`each banner's panel ends inside the hero (${a.panel.bottom} / ${b.panel.bottom})`, a.panel.bottom <= b.slides.bottom && b.panel.bottom <= b.slides.bottom);
  await context.close();
}
await browser.close();
console.log(failures === 0 ? 'PASS' : `FAIL: ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);

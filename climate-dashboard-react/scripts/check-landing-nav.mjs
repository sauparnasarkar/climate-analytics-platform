// Opens the landing page at desktop widths, in a browser whose scrollbars take room, and checks that the six nav links share one row and the header does not overflow.
// Usage: node scripts/check-landing-nav.mjs <base url> [width ...]   (default width 1440; pass 1280 as well for the narrower target, which needs the wordmark decision)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.resolve(here, '../../../syena-design-system/package.json'))('playwright');
const [base = 'http://127.0.0.1:4273', ...widths] = process.argv.slice(2);

// Permanent scrollbars, as on Linux and in browsers set to always show them: they take 15px of the width.
const browser = await chromium.launch({ args: ['--disable-features=OverlayScrollbar'], ignoreDefaultArgs: ['--hide-scrollbars'] });
let failures = 0;
for (const width of (widths.length ? widths : ['1440']).map(Number)) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  const r = await page.evaluate(() => {
    const header = document.querySelector('header');
    const links = [...header.querySelectorAll('nav a')];
    const rows = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    return { links: links.length, rows, scrollbar, overflow: header.scrollWidth - header.clientWidth };
  });
  const ok = r.scrollbar > 0 && r.links >= 5 && r.rows === 1 && r.overflow <= 0;
  console.log(`${width}px (scrollbar ${r.scrollbar}px): ${r.links} links on ${r.rows} row(s), header overflow ${r.overflow}px ${ok ? 'ok' : 'FAIL'}`);
  if (!ok) failures += 1;
  await context.close();
}
await browser.close();
console.log(failures === 0 ? 'PASS: the nav is one row at every width checked' : `FAIL: ${failures} width(s)`);
process.exit(failures === 0 ? 0 : 1);

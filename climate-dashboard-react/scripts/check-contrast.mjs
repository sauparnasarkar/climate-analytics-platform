// Colour contrast (axe) on the live pages in both themes, switched the way a visitor switches them (the app's stored theme), never by editing the root attribute.
// Usage: node scripts/check-contrast.mjs <base url> [route ...]   (default: the landing page and the five analysis pages)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.resolve(here, '../../../syena-design-system/package.json'));
const { chromium } = req('playwright');
const axeSource = fs.readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
const [base = 'http://127.0.0.1:4273', ...given] = process.argv.slice(2);
const routes = given.length ? given : ['/', '/overview', '/country-profile', '/historical', '/scenarios'];
const stored = { night: 'night', tidewater: 'tidewater' };

const browser = await chromium.launch();
let failures = 0;
for (const [theme, value] of Object.entries(stored)) {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    for (const route of routes) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.addInitScript((v) => { try { localStorage.setItem('climate-analytics-theme', v); } catch { /* storage blocked */ } }, value);
      await page.goto(base + route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const shown = await page.evaluate(() => document.querySelector('[data-syn-theme]')?.getAttribute('data-syn-theme'));
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += 600) { await page.evaluate((top) => scrollTo(0, top), y); await page.waitForTimeout(150); }
      await page.evaluate(() => scrollTo(0, 0));
      await page.addScriptTag({ content: axeSource });
      const found = await page.evaluate(async () => (await axe.run({ runOnly: ['color-contrast'] })).violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ').slice(0, 60)}: ${(n.any[0]?.message ?? '').replace('Element has insufficient color contrast of ', '').slice(0, 70)}`)));
      const ok = found.length === 0 && shown === theme;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${theme} ${width}x${height} ${route}${shown === theme ? '' : ` (theme shown: ${shown})`}${found.length ? ` ${found.length} finding(s)` : ''}`);
      for (const f of found.slice(0, 4)) console.log(`       ${f}`);
      if (!ok) failures += 1;
      await context.close();
    }
  }
}
await browser.close();
process.exit(failures ? 1 : 0);

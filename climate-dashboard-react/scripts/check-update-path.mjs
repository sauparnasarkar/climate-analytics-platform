// A new deploy reaches a tab that is already open, without anyone clearing caches: the tab learns of the new version, offers a reload, and runs the new scripts after it.
// Usage: node scripts/check-update-path.mjs <base url> '<shell command that deploys a new build behind that url>'
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.resolve(here, '../../../syena-design-system/package.json'))('playwright');
const [base = 'http://127.0.0.1:4373', deploy] = process.argv.slice(2);
if (!deploy) { console.error('give the deploy command'); process.exit(2); }

let failures = 0;
const check = (name, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures += 1; };
const bundle = (page) => page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /\/assets\/index-/.test(s)) ?? '');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
const page = await context.newPage();
await page.goto(base + '/', { waitUntil: 'networkidle' });
// A clean first load (nothing cached, no worker) raises no prompt and leaves no second worker waiting: both would mean the browser met two different copies of the script.
await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
await page.waitForTimeout(6000);
check('a clean first load shows no prompt', (await page.locator('.update-prompt').count()) === 0);
check('and has no worker waiting beside the active one', await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return Boolean(r?.active) && !r?.waiting; }));
// The worker controls a page from its second load on.
await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
await page.reload({ waitUntil: 'networkidle' });
const before = await bundle(page);
check(`a worker controls the open tab (${before.split('/').pop()})`, await page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
check('no prompt before a deploy', (await page.locator('.update-prompt').count()) === 0);

console.log(`deploying: ${deploy}`);
execSync(deploy, { stdio: 'inherit' });

// The tab stays open and is not navigated; it comes back to the front, as a phone's does.
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.locator('.update-prompt').waitFor({ timeout: 30000 }).catch(() => {});
const prompt = page.locator('.update-prompt');
check('the open tab offers a reload', (await prompt.count()) === 1 && /new version is available/i.test(await prompt.textContent()));
check('the page is still running the old scripts until it is reloaded', (await bundle(page)) === before);

await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}), page.getByRole('button', { name: 'Reload' }).click()]);
await page.waitForLoadState('networkidle');
const after = await bundle(page);
check(`after Reload it runs the new scripts (${after.split('/').pop()})`, after !== '' && after !== before);
check('and no longer offers a reload', (await page.locator('.update-prompt').count()) === 0);
await browser.close();
process.exit(failures ? 1 : 0);

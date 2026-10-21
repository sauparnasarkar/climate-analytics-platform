// The update prompt in the profiles a visitor can be in: a page a worker controls (one deploy, then two in a row behind the open tab) and a page nothing
// controls (a first visit, or a hard reload). Serves copies of dist/ that differ as deploys do, so run `npm run build` first.
// Usage: node scripts/check-update-states.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const { chromium } = createRequire(path.resolve(here, '../../../syena-design-system/package.json'))('playwright');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Versions 1 to 3: a different shell and a different worker each, as a deploy makes them.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'update-states-'));
for (const n of [1, 2, 3]) {
  const dir = path.join(root, `v${n}`);
  fs.cpSync(dist, dir, { recursive: true });
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace('<head>', `<head><meta name="app-version" content="${n}">`);
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8').replace(/(\{url:"index\.html",revision:")[^"]*(")/, `$1rev-${n}$2`);
  fs.writeFileSync(path.join(dir, 'sw.js'), `${sw}\n/*v${n}*/`);
}
let current = 'v1';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(root, current, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(url.pathname)) { res.statusCode = 404; res.end(); return; }
    file = path.join(root, current, 'index.html');
  }
  res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
  res.setHeader('cache-control', path.basename(file) === 'sw.js' ? 'no-store' : 'no-cache');
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
const check = (name, ok) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures += 1; };
const state = (page) => page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return { version: document.querySelector('meta[name=app-version]')?.content, prompts: document.querySelectorAll('.update-prompt').length, waiting: Boolean(r?.waiting), controlled: Boolean(navigator.serviceWorker.controller) };
});
const comeBack = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

const browser = await chromium.launch();
async function open({ reloadOnce }) {
  current = 'v1';
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' })).newPage();
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
  await wait(6000); // past the browser's first look, so the next one counts as a deploy
  if (reloadOnce) { await page.reload({ waitUntil: 'load' }); await wait(1500); } // the worker controls a page from its second load on
  return page;
}
async function reloadIntoNewest(page, expected) {
  const navigated = page.waitForNavigation({ timeout: 10000, waitUntil: 'load' }).then(() => true, () => false);
  await page.getByRole('button', { name: 'Reload' }).click();
  check('Reload reloads the page', await navigated);
  await wait(2500);
  const after = await state(page);
  check(`it runs the newest version (${expected})`, after.version === expected);
  check('the prompt is gone', after.prompts === 0);
  await page.reload({ waitUntil: 'load' });
  await wait(2500);
  const again = await state(page);
  check('and stays gone after another reload', again.prompts === 0 && again.version === expected);
}

console.log('a controlled page, one deploy');
{
  const page = await open({ reloadOnce: true });
  check('no prompt before a deploy', (await state(page)).prompts === 0);
  current = 'v2'; await comeBack(page); await wait(2500);
  const s = await state(page);
  check('a worker waits and the page offers a reload', s.waiting && s.controlled && s.prompts === 1);
  await reloadIntoNewest(page, '2');
}
console.log('a controlled page, two deploys in a row behind the open tab');
{
  const page = await open({ reloadOnce: true });
  current = 'v2'; await comeBack(page); await wait(2500);
  current = 'v3'; await comeBack(page); await wait(2500);
  check('one prompt, not two', (await state(page)).prompts === 1);
  await reloadIntoNewest(page, '3');
}
console.log('a page nothing controls (first visit or hard reload) when a deploy lands');
{
  const page = await open({ reloadOnce: false });
  check('the page is not controlled', !(await state(page)).controlled);
  current = 'v2'; await comeBack(page); await wait(2500);
  const s = await state(page);
  check('no prompt, since nothing waits and a reload would have nothing to activate', s.prompts === 0 && !s.waiting);
  await page.reload({ waitUntil: 'load' }); await wait(2500);
  const again = await state(page);
  check('a plain reload runs the newest version, controlled, with no prompt', again.version === '2' && again.controlled && again.prompts === 0);
}
await browser.close();
server.close();
fs.rmSync(root, { recursive: true, force: true });
process.exit(failures ? 1 : 0);

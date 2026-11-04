// Drives the 36-case battery through the real Ask page (default: the public site), one fresh browser context per
// case so no conversation thread carries over. Per case it records: the SSE the page received from /query,
// the answer as rendered, UI-perceived latency, and a full-page screenshot.
//
//   node ui_battery.mjs <outDir> [baseUrl]        env ONLY=id1,id2 limits the cases
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
const base = (process.argv[3] || 'https://degreesofcarbon.syena.io').replace(/\/$/, '');
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
fs.mkdirSync(path.join(outDir, 'screens'), { recursive: true });

const cases = JSON.parse(fs.readFileSync(new URL('./cases.json', import.meta.url))).filter((c) => !only || only.has(c.id));

function parseSse(text) {
  const out = { progress: [], result: null, error: null };
  let ev = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('event:')) ev = line.slice(6).trim();
    else if (line.startsWith('data:') && ['progress', 'result', 'error'].includes(ev)) {
      try {
        const d = JSON.parse(line.slice(5));
        if (ev === 'progress') out.progress.push(d.label);
        else if (ev === 'result') out.result = d;
        else out.error = d;
      } catch { /* a partial line; ignore */ }
    }
  }
  return out;
}

const browser = await chromium.launch({ headless: true });
const results = [];
const tAll = Date.now();

for (const [i, c] of cases.entries()) {
  const rec = { id: c.id, group: c.group, prompt: c.prompt, http_status: null, ui_error: null, sse: null, ui_text: '', screenshot: `screens/${c.id}.png` };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1700 } });
  const page = await ctx.newPage();
  // Tee the /query stream from inside the page. Playwright's Response.text() cannot read a long-running streamed body (CDP drops it),
  // and the page's own fetchEventSource calls window.fetch at call time, so the UI keeps streaming exactly as it would for a user.
  await page.addInitScript(() => {
    const orig = window.fetch.bind(window);
    window.__sse = '';
    window.__sseDone = false;
    window.__sseStatus = null;
    window.fetch = async (input, init) => {
      const res = await orig(input, init);
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/query')) {
        window.__sseStatus = res.status;
        const clone = res.clone();
        (async () => {
          const reader = clone.body.getReader();
          const dec = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            window.__sse += dec.decode(value, { stream: true });
          }
          window.__sseDone = true;
        })().catch(() => { window.__sseDone = true; });
      }
      return res;
    };
  });
  const t0 = Date.now();
  try {
    await page.goto(`${base}/ask`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const box = page.getByLabel('Ask about climate emissions');
    await box.waitFor({ timeout: 30000 });
    await box.fill(c.prompt);
    const tSend = Date.now();
    await box.press('Enter');
    await page.waitForFunction(() => window.__sseDone === true, null, { timeout: 180000, polling: 500 });
    rec.http_status = await page.evaluate(() => window.__sseStatus);
    rec.sse = parseSse(await page.evaluate(() => window.__sse));
    rec.stream_seconds = +((Date.now() - tSend) / 1000).toFixed(1);
    // the UI finishes after the stream: wait for the pending skeleton to go, then let charts paint
    await page.locator('section[aria-busy="true"]').waitFor({ state: 'detached', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);
    rec.ui_seconds = +((Date.now() - tSend) / 1000).toFixed(1);
    rec.ui_text = (await page.locator('main').innerText()).slice(0, 8000);
    await page.screenshot({ path: path.join(outDir, rec.screenshot), fullPage: true });
  } catch (e) {
    rec.ui_error = `${e.name}: ${String(e.message).split('\n')[0].slice(0, 300)}`;
    await page.screenshot({ path: path.join(outDir, rec.screenshot), fullPage: true }).catch(() => {});
  }
  rec.seconds = +((Date.now() - t0) / 1000).toFixed(1);
  await ctx.close();
  results.push(rec);
  const kind = rec.ui_error ? 'UIERR' : rec.sse?.error ? 'ERROR' : rec.sse?.result ? 'result' : 'none';
  console.log(`[${String(i + 1).padStart(2, '0')}/${cases.length}] ${c.id.padEnd(6)} ${kind.padEnd(6)} http=${rec.http_status} stream=${rec.stream_seconds}s ui=${rec.ui_seconds}s ${rec.ui_error || ''}`);
  fs.writeFileSync(path.join(outDir, 'raw.json'), JSON.stringify({ base, results, total_seconds: +((Date.now() - tAll) / 1000).toFixed(1) }, null, 1));
  await new Promise((r) => setTimeout(r, 1500));
}
await browser.close();
console.log(`done ${results.length} cases in ${((Date.now() - tAll) / 1000).toFixed(0)}s`);

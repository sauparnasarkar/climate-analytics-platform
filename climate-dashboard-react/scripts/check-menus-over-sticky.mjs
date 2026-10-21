// An open menu (a select's list) sits above the pinned rows and bars: every option can be reached, none is covered by a sticky row.
// On a narrow screen the selects are in the filters sheet: each is opened there, every option must be reachable (scrolling the list and the sheet), and Escape must close the list only.
// Usage: node scripts/check-menus-over-sticky.mjs <base url> [WxH ...]   (default 1440x900, 500x844 and 390x844)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.resolve(here, '../../../syena-design-system/package.json'))('playwright');
const [base = 'http://127.0.0.1:4273', ...sizes] = process.argv.slice(2);
const routes = ['/overview', '/country-profile', '/historical', '/scenarios'];

const browser = await chromium.launch({ args: ['--disable-features=OverlayScrollbar'], ignoreDefaultArgs: ['--hide-scrollbars'] });
let failures = 0;
for (const size of (sizes.length ? sizes : ['1440x900', '500x844', '390x844'])) {
  const [w, h] = size.split('x').map(Number);
  for (const route of routes) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(base + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const count = await page.locator('button[aria-haspopup="listbox"], [role="combobox"]').count();
    for (let i = 0; i < count; i += 1) {
      const trigger = page.locator('button[aria-haspopup="listbox"], [role="combobox"]').nth(i);
      if (!(await trigger.isVisible())) continue;
      const label = (await trigger.getAttribute('aria-label')) ?? (await trigger.textContent())?.trim().slice(0, 30);
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await page.waitForTimeout(400);
      const result = await page.evaluate(() => {
        const list = [...document.querySelectorAll('[role="listbox"]')].find((l) => l.getBoundingClientRect().height > 0);
        if (!list) return { open: false };
        const view = { top: 0, bottom: innerHeight };
        const covered = [];
        for (const option of list.querySelectorAll('[role="option"]')) {
          const r = option.getBoundingClientRect();
          if (r.bottom <= view.top || r.top >= view.bottom) continue; // scrolled out of the list's own view
          const listRect = list.getBoundingClientRect();
          const y = Math.min(Math.max(r.top + r.height / 2, listRect.top + 2), listRect.bottom - 2);
          if (y < 0 || y > innerHeight) continue;
          const hit = document.elementFromPoint(r.left + r.width / 2, y);
          if (hit && !list.contains(hit) && !hit.contains(list)) covered.push(`${option.textContent.trim().slice(0, 12)} under ${hit.tagName.toLowerCase()}${hit.getAttribute('data-syn-sticky') ? `[sticky ${hit.getAttribute('data-syn-sticky')}]` : ''}`);
        }
        return { open: true, covered };
      });
      const ok = !result.open || result.covered.length === 0;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${size} ${route} "${label}"${result.open ? '' : ' (no list)'}${result.covered?.length ? ` covered: ${result.covered.slice(0, 4).join('; ')}` : ''}`);
      if (!ok) failures += 1;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    // Compact widths: the controls are in the filters sheet.
    const opener = page.getByRole('button', { name: 'Open analysis controls' });
    if (w <= 796 && (await opener.count()) > 0) {
      await opener.click();
      const sheet = page.getByRole('dialog', { name: 'Analysis controls' });
      await sheet.waitFor();
      const triggers = sheet.locator('button[aria-haspopup="listbox"], [role="combobox"]');
      for (let i = 0; i < (await triggers.count()); i += 1) {
        const trigger = triggers.nth(i);
        const label = ((await trigger.getAttribute('aria-label')) ?? (await trigger.textContent()) ?? '').trim().slice(0, 30);
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        await page.waitForTimeout(400);
        const result = await page.evaluate(() => {
          const list = [...document.querySelectorAll('[role="listbox"]')].find((l) => l.getBoundingClientRect().height > 0);
          if (!list) return { open: false };
          const options = [...list.querySelectorAll('[role="option"]')];
          const unreachable = [];
          for (const option of [options[0], options[Math.min(options.length - 1, 5)]].filter(Boolean)) {
            option.scrollIntoView({ block: 'nearest' });
            const r = option.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!hit || !option.contains(hit)) unreachable.push(option.textContent.trim().slice(0, 14));
          }
          const sheetEl = list.closest('[role="dialog"]');
          const visible = list.getBoundingClientRect();
          const shown = sheetEl ? Math.min(visible.bottom, sheetEl.getBoundingClientRect().bottom) - Math.max(visible.top, sheetEl.getBoundingClientRect().top) : visible.height;
          return { open: true, unreachable, shown: Math.round(shown), of: Math.round(visible.height), popupPosition: getComputedStyle(list.parentElement).position };
        });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const sheetStillOpen = (await sheet.count()) > 0;
        const ok = result.open && result.unreachable.length === 0 && result.popupPosition !== 'absolute' && sheetStillOpen;
        console.log(`${ok ? 'ok  ' : 'FAIL'} ${size} ${route} sheet "${label}"${result.open ? ` list ${result.shown}/${result.of}px shown, ${result.popupPosition}` : ' (no list)'}${result.unreachable?.length ? ` unreachable: ${result.unreachable.join(', ')}` : ''}${sheetStillOpen ? '' : ' (Escape closed the whole sheet)'}`);
        if (!ok) failures += 1;
        if (!sheetStillOpen) await opener.click();
      }
    }
    await context.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);

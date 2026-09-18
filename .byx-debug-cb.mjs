import { chromium } from 'playwright';
const [,, storageStatePath, exportUrl] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
await page.goto(exportUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);
const info = await page.locator('input[type="checkbox"]').evaluateAll(els => els.map(e => {
  const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0, cls: e.className.slice(0,40), disabled: e.disabled };
}));
console.log('total:', info.length);
console.log(JSON.stringify(info.slice(0, 6), null, 2));
await page.screenshot({ path: `${OUT}/debug-cb.png`, fullPage: true });
await browser.close();

import { chromium } from 'playwright';
const [,, storageStatePath, exportUrl] = process.argv;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
await page.goto(exportUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);
const info = await page.locator('input[type="checkbox"]').evaluateAll(els => els.map((e,i) => {
  const r = e.getBoundingClientRect();
  return { i, x: Math.round(r.x), y: Math.round(r.y) };
}));
console.log('total:', info.length);
console.log(info.map(x => `${x.i}:(${x.x},${x.y})`).join(' '));
await browser.close();

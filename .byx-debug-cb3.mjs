import { chromium } from 'playwright';
const [,, storageStatePath, exportUrl] = process.argv;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
await page.goto(exportUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);
const roleCbs = await page.locator('[role="checkbox"]').count();
console.log('role=checkbox count:', roleCbs);
if (roleCbs > 0) {
  const info = await page.locator('[role="checkbox"]').evaluateAll(els => els.slice(0,8).map((e,i) => {
    const r = e.getBoundingClientRect();
    return { i, x: Math.round(r.x), y: Math.round(r.y), tag: e.tagName };
  }));
  console.log(JSON.stringify(info));
}
await browser.close();

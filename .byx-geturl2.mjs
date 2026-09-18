import { chromium } from 'playwright';
const [,, storageStatePath] = process.argv;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
await page.goto('http://acquisition-frontier.localhost:3001/masterwork/all', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2000);
const search = page.locator('input[type="search"], input[placeholder*="Search" i]').first();
if (await search.count() > 0) {
  await search.fill('DISPOSABLE TEST');
  await page.waitForTimeout(1500);
}
const link = page.locator('a:has-text("DISPOSABLE TEST")').first();
const href = await link.getAttribute('href').catch(() => null);
console.log('HREF:', href);
await browser.close();

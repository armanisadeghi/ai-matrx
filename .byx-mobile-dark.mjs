import { chromium } from 'playwright';
const [,, storageStatePath, exportUrl, outName] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  storageState: storageStatePath,
  colorScheme: 'dark',
});
const page = await context.newPage();
await page.goto(exportUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);
// scroll down a bit to get "below the fold" cards
await page.mouse.wheel(0, 600);
await page.waitForTimeout(1000);
await page.mouse.wheel(0, 1200);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/${outName}`, fullPage: false });
await browser.close();
console.log('DONE');

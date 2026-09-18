import { chromium } from 'playwright';
const [,, storageStatePath, exportUrl, outName] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  storageState: storageStatePath,
});
const page = await context.newPage();
await page.goto(exportUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);
// find scrollable containers
const scrolled = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  const candidates = all.filter(el => el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 200);
  for (const el of candidates.slice(0, 5)) {
    el.scrollTop = el.scrollHeight;
  }
  return candidates.length;
});
console.log('scrollable candidates:', scrolled);
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/${outName}` });
await browser.close();
console.log('DONE');

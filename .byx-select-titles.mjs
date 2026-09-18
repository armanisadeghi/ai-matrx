import { chromium } from 'playwright';
const [,, storageStatePath, exportUrl] = process.argv;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
await page.goto(exportUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);
// grab first 20 row titles + full detail (thread/channel/when) to match with checkbox order
const rows = await page.evaluate(() => {
  const cbs = Array.from(document.querySelectorAll('[role="checkbox"]')).slice(1, 21);
  return cbs.map(cb => {
    let row = cb.closest('tr') || cb.closest('[role="row"]') || cb.parentElement?.parentElement;
    return row ? row.innerText.replace(/\n+/g, ' | ').slice(0, 200) : 'NO ROW FOUND';
  });
});
rows.forEach((r,i) => console.log(i+1, r));
await browser.close();

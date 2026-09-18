import { chromium } from 'playwright';
const [,, storageStatePath, filePath] = process.argv;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
await page.goto('http://acquisition-frontier.localhost:3001/exports', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1500);
await page.locator('input[type="file"]').setInputFiles(filePath);
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(2000);
  const text = await page.locator('body').innerText();
  if (!/Working out what it is|Reading the archive|Uploaded\.\.\./.test(text)) break;
}
await page.waitForTimeout(1000);
console.log('EXPORT_URL:', page.url());
await browser.close();

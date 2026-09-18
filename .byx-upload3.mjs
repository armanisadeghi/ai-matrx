import { chromium } from 'playwright';

const [,, storageStatePath, filePath, outPrefix] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
page.on('pageerror', err => console.log('PAGEERROR:', err.message));

await page.goto('http://acquisition-frontier.localhost:3001/exports', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1500);

await page.locator('input[type="file"]').setInputFiles(filePath);
console.log('file set, polling...');

let settled = false;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(2000);
  const text = await page.locator('body').innerText();
  if (!/Working out what it is|Reading the archive|Uploaded\.\.\./.test(text)) { settled = true; console.log(`settled after ~${(i+1)*2}s`); break; }
}
if (!settled) console.log('NOT SETTLED after 80s');
await page.waitForTimeout(3000);

await page.screenshot({ path: `${OUT}/${outPrefix}-detected.png`, fullPage: true });
console.log('URL:', page.url());
const bodyText = await page.locator('body').innerText();
console.log('---BODY---');
console.log(bodyText.slice(0, 1500));

await context.storageState({ path: storageStatePath });
await browser.close();
console.log('DONE');

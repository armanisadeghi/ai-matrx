import { chromium } from 'playwright';

const [,, storageStatePath, filePath, outPrefix] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
page.on('pageerror', err => console.log('PAGEERROR:', err.message));

await page.goto('http://acquisition-frontier.localhost:3001/exports', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);

const fileInput = await page.locator('input[type="file"]');
await fileInput.setInputFiles(filePath);
console.log('file set, polling for "Reading the archive" to clear...');

let settled = false;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(2000);
  const text = await page.locator('body').innerText();
  if (!text.includes('Reading the archive')) { settled = true; console.log(`settled after ~${(i+1)*2}s`); break; }
}
if (!settled) console.log('NOT SETTLED after 80s');

await page.screenshot({ path: `${OUT}/${outPrefix}-03-final.png`, fullPage: true });
const bodyText = await page.locator('body').innerText();
console.log('---BODY TEXT SNIPPET---');
console.log(bodyText.slice(0, 3000));
console.log('URL:', page.url());

await context.storageState({ path: storageStatePath });
await browser.close();
console.log('DONE');

import { chromium } from 'playwright';
const [,, storageStatePath, outPrefix, maxWaitS] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
await page.goto('http://acquisition-frontier.localhost:3001/exports', { waitUntil: 'networkidle', timeout: 30000 });

let settled = false;
const max = parseInt(maxWaitS || '90');
for (let i = 0; i < max/2; i++) {
  await page.waitForTimeout(2000);
  const text = await page.locator('body').innerText();
  if (!/Working out what it is|Reading the archive|Uploaded\./.test(text)) { settled = true; console.log(`settled after ~${(i+1)*2}s`); break; }
}
if (!settled) console.log('NOT SETTLED after', max, 's');

await page.screenshot({ path: `${OUT}/${outPrefix}-final.png`, fullPage: true });
const bodyText = await page.locator('body').innerText();
console.log('---BODY---');
console.log(bodyText.slice(0, 2500));
await context.storageState({ path: storageStatePath });
await browser.close();
console.log('DONE');

import { chromium } from 'playwright';

const [,, storageStatePath, filePath, outPrefix] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
page.on('pageerror', err => console.log('PAGEERROR:', err.message));
page.on('response', async (res) => {
  const url = res.url();
  if (url.includes('/exports') || url.includes('bring-your-export') || url.includes('/media/') ) {
    console.log('RESP', res.status(), url);
  }
});

await page.goto('http://acquisition-frontier.localhost:3001/exports', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);

const fileInput = await page.locator('input[type="file"]');
await fileInput.setInputFiles(filePath);
console.log('file set, waiting for processing...');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/${outPrefix}-01-after-upload.png`, fullPage: true });

// wait for possible async detection to settle further
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/${outPrefix}-02-settled.png`, fullPage: true });

const bodyText = await page.locator('body').innerText();
console.log('---BODY TEXT SNIPPET---');
console.log(bodyText.slice(0, 3000));

await browser.close();
console.log('DONE');

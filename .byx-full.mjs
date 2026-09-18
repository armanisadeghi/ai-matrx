import { chromium } from 'playwright';

const [,, storageStatePath, slackZip, linkedinZip] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';

function log(...a) { console.log(new Date().toISOString().slice(11,19), ...a); }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
page.on('pageerror', err => log('PAGEERROR:', err.message));
const netlog = [];
page.on('response', async (res) => {
  const url = res.url();
  if (url.includes('server.app.matrxserver.com') && (url.includes('export') || url.includes('rulebook') || url.includes('raw_material') || url.includes('library'))) {
    netlog.push(`${res.status()} ${res.request().method()} ${url}`);
  }
});

async function waitSettled(maxS = 90) {
  for (let i = 0; i < maxS/2; i++) {
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    if (!/Working out what it is|Reading the archive|Uploaded\.\.\./.test(text)) return true;
  }
  return false;
}

log('nav to /exports');
await page.goto('http://acquisition-frontier.localhost:3001/exports', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);

log('upload slack');
await page.locator('input[type="file"]').setInputFiles(slackZip);
const s1 = await waitSettled();
log('slack settled:', s1);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/slack-detected.png`, fullPage: true });
let bt = await page.locator('body').innerText();
log('SLACK SUMMARY SNIPPET:', bt.slice(0, 1200).replace(/\n+/g,' | '));
log('current url:', page.url());

await browser.close();
console.log('---NETLOG---');
console.log(netlog.join('\n'));
log('DONE');

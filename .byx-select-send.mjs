import { chromium } from 'playwright';
const [,, storageStatePath, exportUrl, rulebookId, outPrefix] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';

function log(...a) { console.log(new Date().toISOString().slice(11,19), ...a); }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
page.on('pageerror', err => log('PAGEERROR:', err.message));
const netlog = [];
page.on('response', async (res) => {
  const url = res.url();
  if (url.includes('server.app.matrxserver.com') && (url.includes('rulebook') || url.includes('raw_material') || url.includes('library') || url.includes('keep') || url.includes('send'))) {
    let bodySnippet = '';
    try { bodySnippet = (await res.text()).slice(0, 500); } catch {}
    netlog.push(`${res.status()} ${res.request().method()} ${url}\n  BODY: ${bodySnippet}`);
  }
});

await page.goto(exportUrl, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(4000);

// select 20 checkboxes in the item rows: role=checkbox, index 0 is "select all" header
const checkboxes = page.locator('[role="checkbox"]');
const total = await checkboxes.count();
log('checkbox count found:', total);

let selected = 0;
for (let i = 1; i <= total && selected < 20; i++) {
  const cb = checkboxes.nth(i);
  await cb.click();
  selected++;
  await page.waitForTimeout(380); // paced clicks >= 350ms apart
}
log('selected count (clicks made):', selected);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/${outPrefix}-selected-20.png`, fullPage: true });
const bodyText = await page.locator('body').innerText();
const m = bodyText.match(/(\d+) selected/i);
log('selection indicator text:', m ? m[0] : 'NOT FOUND');

// click "Send to a Rulebook"
await page.getByText('Send to a Rulebook', { exact: true }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/${outPrefix}-send-dialog.png`, fullPage: true });
log('send dialog opened, body snippet:');
console.log((await page.locator('body').innerText()).slice(0, 500));

await page.getByText('Send as Sources', { exact: true }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/${outPrefix}-send-result.png`, fullPage: true });
log('after send, body snippet:');
console.log((await page.locator('body').innerText()).slice(0, 2000));
log('URL after send:', page.url());

await context.storageState({ path: storageStatePath });
await browser.close();
console.log('---NETLOG---');
console.log(netlog.join('\n'));
log('DONE');

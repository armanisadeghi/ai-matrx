import { chromium } from 'playwright';
const [,, storageStatePath] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
page.on('pageerror', err => console.log('PAGEERROR:', err.message));
page.on('response', async (res) => {
  const url = res.url();
  if (url.includes('server.app.matrxserver.com') && (url.includes('masterwork') || url.includes('rulebook'))) {
    console.log('RESP', res.status(), res.request().method(), url);
  }
});
await page.goto('http://acquisition-frontier.localhost:3001/masterwork/new', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2000);
await page.locator('textarea').first().fill('DISPOSABLE TEST — verify-7 round-7 Rulebook for bring-your-export Slack/LinkedIn body-text verification. Safe to delete.');
await page.getByText('Continue', { exact: true }).click();
await page.waitForTimeout(2000);
await page.getByText('Start', { exact: true }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/masterwork-started.png`, fullPage: true });
console.log('URL after start:', page.url());
console.log((await page.locator('body').innerText()).slice(0, 2000));
await context.storageState({ path: storageStatePath });
await browser.close();
console.log('DONE');

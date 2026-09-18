import { chromium } from 'playwright';
const [,, storageStatePath, rulebookId, outPrefix] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
await page.goto(`http://acquisition-frontier.localhost:3001/masterwork/${rulebookId}`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3000);
// click Sources tab if not active
const sourcesTab = page.getByText('Sources', { exact: true }).first();
await sourcesTab.click().catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/${outPrefix}-rulebook-sources.png`, fullPage: true });
console.log((await page.locator('body').innerText()).slice(0, 3000));
await browser.close();

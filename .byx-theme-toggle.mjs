import { chromium } from 'playwright';
const [,, storageStatePath] = process.argv;
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
await page.goto('http://acquisition-frontier.localhost:3001/exports', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2000);
// click avatar (admin) top right by coordinate
await page.mouse.click(1417, 21);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/debug-menu.png`, fullPage: true });
const bodyText = await page.locator('body').innerText();
console.log(bodyText.slice(0, 1500));
await context.storageState({ path: storageStatePath });
await browser.close();

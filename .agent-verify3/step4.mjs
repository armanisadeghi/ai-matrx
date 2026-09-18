import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();

await page.goto('http://sc280ffb6.localhost:3001/masterwork/new', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);

const textarea = await page.$('textarea');
await textarea.fill('An assistant that captures exactly how our senior appraiser values distressed commercial real estate the way she does it.');

// click "Written down" tile
await page.click('text=Written down');
await page.waitForTimeout(300);

await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/04_filled.png', fullPage: true });

// find Next/Continue button
const buttons = await page.$$eval('button', els => els.map(e => (e.textContent||'').trim()).filter(Boolean));
console.log(JSON.stringify(buttons));

await browser.close();

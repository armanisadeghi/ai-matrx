import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();

await page.goto('http://sc280ffb6.localhost:3001/masterwork/new', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);
const textarea = await page.$('textarea');
await textarea.fill('An assistant that captures exactly how our senior appraiser values distressed commercial real estate the way she does it.');
await page.click('text=Written down');
await page.waitForTimeout(300);
await page.click('button:has-text("Continue")');
await page.waitForTimeout(1500);
console.log('url now', page.url());

// list all "Dump everything you have" matches on step 1's step=2 page (which is actually the method chooser)
const count = await page.locator('text=Dump everything you have').count();
console.log('dump matches on this page:', count);
const dumpCard = page.locator('text=Dump everything you have').first();
await dumpCard.scrollIntoViewIfNeeded();
await dumpCard.click();
await page.waitForTimeout(500);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/10_afterclick_check.png', fullPage: true });

await browser.close();

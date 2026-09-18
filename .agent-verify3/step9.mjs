import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();

await page.goto('http://acquisition-frontier.localhost:3001/masterwork/new', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);
const textarea = await page.$('textarea');
await textarea.fill('An assistant that captures exactly how our senior appraiser values distressed commercial real estate the way she does it.');
await page.click('text=Written down');
await page.waitForTimeout(300);
await page.click('button:has-text("Continue")');
await page.waitForTimeout(1500);
console.log('url step2', page.url());

// Now on the "How do you want to do this?" page. Find and click "Dump everything you have"
const dumpCard = page.locator('text=Dump everything you have').first();
await dumpCard.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await dumpCard.click({ force: true });
await page.waitForTimeout(500);
// confirm selection via "Starting with" footer text
const footerText = await page.locator('text=Starting with').textContent().catch(()=>null);
console.log('footer:', footerText);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/11_selected.png', fullPage: true });

await page.click('button:has-text("Start")');
await page.waitForTimeout(3000);
console.log('url after start', page.url());
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/12_after_start.png', fullPage: true });

await context.storageState({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
await browser.close();

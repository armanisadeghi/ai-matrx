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
await page.getByRole('button', { name: 'Continue', exact: true }).click();
await page.waitForTimeout(1500);

const dumpCard = page.getByRole('button', { name: /Dump everything you have/ });
await dumpCard.scrollIntoViewIfNeeded();
await dumpCard.click();
await page.waitForTimeout(500);

const startBtn = page.getByRole('button', { name: 'Start', exact: true });
await startBtn.scrollIntoViewIfNeeded();
await startBtn.click();

await page.waitForURL(u => /\/masterwork\/[0-9a-f-]{36}/.test(u.toString()), { timeout: 20000 }).catch(e => console.log('waitForURL err', e.message));
console.log('url final', page.url());
await page.waitForTimeout(2000);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/15_rulebook.png', fullPage: true });

await context.storageState({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
await browser.close();

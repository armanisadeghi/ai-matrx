import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();
page.on('request', r => { if (r.method()!=='GET') console.log('REQ', r.method(), r.url()); });
page.on('response', r => { if (r.status()>=300) console.log('RESP', r.status(), r.url()); });
page.on('console', msg => { if (/error/i.test(msg.type())) console.log('[console-err]', msg.text().slice(0,300)); });
page.on('pageerror', e => console.log('[pageerror]', e.message));

await page.goto('http://acquisition-frontier.localhost:3001/masterwork/new', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1000);
const textarea = await page.$('textarea');
await textarea.fill('An assistant that captures exactly how our senior appraiser values distressed commercial real estate the way she does it.');
await page.click('text=Written down');
await page.waitForTimeout(300);
await page.click('button:has-text("Continue")');
await page.waitForTimeout(1500);

const dumpCard = page.locator('text=Dump everything you have').first();
await dumpCard.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await dumpCard.click({ force: true });
await page.waitForTimeout(500);

const startBtn = page.locator('button:has-text("Start")');
await startBtn.scrollIntoViewIfNeeded();
console.log('clicking start now, url before:', page.url());
await Promise.all([
  page.waitForURL(u => u.toString() !== page.url(), { timeout: 8000 }).catch(e=>console.log('waitForURL timeout', e.message)),
  startBtn.click()
]);
await page.waitForTimeout(1000);
console.log('url immediately after:', page.url());
await page.waitForTimeout(3000);
console.log('url +3s:', page.url());
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/13_debug.png', fullPage: true });

await browser.close();

import { chromium } from 'playwright';

const RULEBOOK_URL = 'http://acquisition-frontier.localhost:3001/masterwork/03cb27e4-887b-4138-8b2b-39f6c38fcd5a';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();

await page.goto(RULEBOOK_URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
await page.click('text=Add your first resource');
await page.waitForTimeout(500);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/18_add_resource.png', fullPage: true });

const inputs = await page.$$eval('input[type=file]', els => els.map(e => ({accept: e.getAttribute('accept'), multiple: e.multiple, id: e.id})));
console.log('file inputs:', JSON.stringify(inputs));

const btns = await page.$$eval('button', els => els.map(e=>(e.textContent||'').trim()).filter(Boolean));
console.log('buttons:', JSON.stringify(btns));

await browser.close();

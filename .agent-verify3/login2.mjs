import { chromium } from 'playwright';
const LOGIN_URL = 'http://acquisition-frontier.localhost:3001/api/dev-login?nonce=0eecfabf30f738da99dcef23b574fcb8&next=/masterwork';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('response', r => { if (r.url().includes('dev-login')) console.log('RESP', r.status(), r.url()); });
try {
  await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: 30000 });
} catch(e) { console.log('goto error', e.message); }
await page.waitForTimeout(1500);
console.log('final url', page.url());
const body = await page.textContent('body').catch(()=>null);
console.log('body snippet', (body||'').slice(0,500));
const whoami = await page.evaluate(async () => (await fetch('/api/whoami')).json());
console.log('whoami:', JSON.stringify(whoami));
await context.storageState({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
await browser.close();

import { chromium } from 'playwright';

const HOST = 'sc280ffb6.localhost';
const LOGIN_URL = 'http://sc280ffb6.localhost:3001/api/dev-login?nonce=9a0cc819771e72da25546ae0683d3276&next=/masterwork';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on('console', msg => console.log('[console]', msg.type(), msg.text().slice(0,200)));

console.log('Navigating to login url...');
await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);
console.log('URL after login:', page.url());

const whoami = await page.evaluate(async () => {
  const r = await fetch('/api/whoami');
  return r.json();
});
console.log('whoami:', JSON.stringify(whoami));

await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/01_after_login.png', fullPage: false });

await context.storageState({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });

await browser.close();
console.log('done');

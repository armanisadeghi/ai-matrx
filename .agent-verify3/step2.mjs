import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();

await page.goto('http://sc280ffb6.localhost:3001/masterwork/all', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/02_masterwork_all.png', fullPage: false });

// find buttons/links mentioning "new" or "create"
const candidates = await page.$$eval('a,button', els => els
  .filter(e => /new|create|start/i.test(e.textContent||''))
  .map(e => ({tag:e.tagName, text:(e.textContent||'').trim().slice(0,60), href:e.getAttribute('href')})));
console.log(JSON.stringify(candidates, null, 2));

await browser.close();

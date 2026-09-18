import { chromium } from 'playwright';

const RULEBOOK_URL = 'http://acquisition-frontier.localhost:3001/masterwork/03cb27e4-887b-4138-8b2b-39f6c38fcd5a';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();

await page.goto(RULEBOOK_URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2000);

const resourcesCount = await page.locator('text=Resources').first().locator('xpath=..').textContent().catch(()=>null);
console.log('resources header area:', resourcesCount);

const turnBtn = page.locator('button:has-text("Turn this into rules")');
await turnBtn.scrollIntoViewIfNeeded();
const disabled = await turnBtn.isDisabled();
console.log('Turn button disabled?', disabled);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/20_before_turn.png', fullPage: true });

await turnBtn.click();
console.log('clicked Turn this into rules at', new Date().toISOString());
await page.waitForTimeout(3000);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/21_after_turn.png', fullPage: true });

await context.storageState({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
await browser.close();

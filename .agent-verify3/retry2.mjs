import { chromium } from 'playwright';
const RULEBOOK_URL = 'http://acquisition-frontier.localhost:3001/masterwork/03cb27e4-887b-4138-8b2b-39f6c38fcd5a';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1400 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();
await page.goto(RULEBOOK_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2000);
const btn = page.locator('button:has-text("Turn this into rules")');
const count = await btn.count();
console.log('button count', count);
if (count > 0) {
  await btn.first().scrollIntoViewIfNeeded();
  const disabled = await btn.first().isDisabled();
  console.log('disabled?', disabled);
  if (!disabled) {
    await btn.first().click();
    console.log('clicked retry2 at', new Date().toISOString());
  }
} else {
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('NO BUTTON. body snippet:', bodyText.slice(0,1500));
}
await page.waitForTimeout(3000);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/retry2_clicked.png', fullPage: true });
await context.storageState({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
await browser.close();

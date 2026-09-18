import { chromium } from 'playwright';

const RULEBOOK_URL = 'http://acquisition-frontier.localhost:3001/masterwork/03cb27e4-887b-4138-8b2b-39f6c38fcd5a';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();
await page.goto(RULEBOOK_URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  const text = await page.evaluate(() => document.body.innerText);
  const attachedMatch = text.match(/(\d+)\s+(files?|resources?|attached)/gi);
  const turnBtn = await page.$('button:has-text("Turn this into rules")');
  const disabled = turnBtn ? await turnBtn.isDisabled() : null;
  console.log(`t=${(i+1)*5}s disabled=${disabled} matches=${JSON.stringify(attachedMatch)}`);
}
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/mobile_03_after_wait.png', fullPage: true });
await browser.close();

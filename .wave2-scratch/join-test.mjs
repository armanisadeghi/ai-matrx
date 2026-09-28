import { chromium } from 'playwright';

const HOST = 'wave2edu.localhost:3001';
const STATE = '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/state.json';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE });
const page = await context.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console error]', msg.text()); });

// First host a room so we have a real code to join.
await page.goto(`http://${HOST}/education/game/host`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
console.log('host page url:', page.url());

// Click "Create room" with real click.
const createBtn = page.getByRole('button', { name: /Create room/i });
await createBtn.waitFor({ state: 'visible', timeout: 15000 });
await createBtn.scrollIntoViewIfNeeded();
await createBtn.click();
await page.waitForTimeout(1500);
// Org picker dialog appears on first action.
const orgOption = page.getByText("admin's Workspace", { exact: true }).first();
if (await orgOption.isVisible().catch(() => false)) {
  await orgOption.click();
  await page.waitForTimeout(300);
  const continueBtn = page.getByRole('button', { name: /^Continue$/i });
  await continueBtn.click();
  await page.waitForTimeout(2000);
}
console.log('after org pick, url:', page.url());
// Now click create room again (or it may have auto-proceeded).
const createBtn2 = page.getByRole('button', { name: /Create room/i });
if (await createBtn2.isVisible().catch(() => false)) {
  await createBtn2.click();
  await page.waitForTimeout(3000);
}
console.log('after create click, url:', page.url());
await page.screenshot({ path: '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/after-create.png', fullPage: false });

// Grab the join code from lobby page
const codeMatch = page.url().match(/code=([A-Z0-9]+)/i);
let code = codeMatch ? decodeURIComponent(codeMatch[1]) : null;
if (!code) {
  const text = await page.textContent('body');
  console.log('lobby body snippet:', text?.slice(0, 500));
}
console.log('JOIN CODE:', code);

await context.storageState({ path: STATE });
await browser.close();

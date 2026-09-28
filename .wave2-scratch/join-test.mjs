import { chromium } from 'playwright';

const HOST = 'wave2edu.localhost:3001';
const STATE = '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/state.json';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE });
const page = await context.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console error]', msg.text()); });

// Pick an org first (fresh login has no org selected).
await page.goto(`http://${HOST}/education`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2000);
const orgBtn = page.getByText("admin's Workspace", { exact: false }).first();
if (await orgBtn.isVisible().catch(() => false)) {
  await orgBtn.click();
  await page.waitForTimeout(1500);
  console.log('picked org, url now:', page.url());
}

// First host a room so we have a real code to join.
await page.goto(`http://${HOST}/education/game/host`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
console.log('host page url:', page.url());

// Click "Create room" with real click.
const createBtn = page.getByRole('button', { name: /Create room/i });
await createBtn.waitFor({ state: 'visible', timeout: 15000 });
await createBtn.click();
await page.waitForTimeout(3000);
console.log('after create click, url:', page.url());

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

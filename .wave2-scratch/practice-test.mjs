import { chromium } from 'playwright';
const HOST = 'wave2edu.localhost:3001';
const STATE = '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/state.json';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE });
const page = await context.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console error]', msg.text()); });

await page.goto(`http://${HOST}/education/practice-tests/new`, { waitUntil: 'load', timeout: 90000 });
await page.waitForTimeout(2500);
console.log('new page url:', page.url());

// Topic mode is default; type a topic.
const topicInput = page.getByLabel('Topic');
await topicInput.click();
await topicInput.type('Agent Test Practice Timer', { delay: 20 });

// Set time limit to 1 minute.
const timeInput = page.getByLabel('Time limit (minutes)');
await timeInput.click({ clickCount: 3 });
await timeInput.fill('1');

await page.screenshot({ path: '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/pt-form.png' });

const genBtn = page.getByRole('button', { name: /^Generate$/i });
await genBtn.click();

// Handle possible org gate dialog.
await page.waitForTimeout(1500);
const dialog = page.getByRole('dialog');
if (await dialog.isVisible().catch(() => false)) {
  const orgBtn = dialog.getByRole('button', { name: "admin's Workspace" });
  if (await orgBtn.isVisible().catch(() => false)) {
    await orgBtn.click();
    await page.waitForTimeout(300);
    await dialog.getByRole('button', { name: /^Continue$/i }).click();
  }
}

// Wait for generation to finish -- navigates to the new assessment detail page.
let landed = false;
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(2000);
  if (/\/education\/practice-tests\/[0-9a-f-]{20,}/.test(page.url())) { landed = true; break; }
}
console.log('landed:', landed, 'url:', page.url());
await page.screenshot({ path: '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/pt-created.png' });
await context.storageState({ path: STATE });
await browser.close();

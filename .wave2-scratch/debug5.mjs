import { chromium } from 'playwright';
const HOST = 'wave2edu.localhost:3001';
const STATE = '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/state.json';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE });
const page = await context.newPage();
await page.goto(`http://${HOST}/education/game/host`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
const createBtn = page.getByRole('button', { name: /Create room/i });
await createBtn.scrollIntoViewIfNeeded();
await createBtn.click();
await page.waitForTimeout(1500);
const dialog = page.getByRole('dialog');
if (await dialog.isVisible().catch(()=>false)) {
  const orgBtn = dialog.getByRole('button', { name: "admin's Workspace" });
  await orgBtn.click();
  await page.waitForTimeout(300);
  await dialog.getByRole('button', { name: /^Continue$/i }).click();
}
await page.waitForTimeout(4000);
console.log('final url', page.url());
await context.storageState({ path: STATE });
await browser.close();

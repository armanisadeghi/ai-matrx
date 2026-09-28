import { chromium } from 'playwright';
const HOST = 'wave2edu.localhost:3001';
const STATE = '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/state.json';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE });
const page = await context.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console error]', msg.text()); });
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

for (let i = 1; i <= 5; i++) {
  const p = await context.newPage();
  await p.goto(`http://${HOST}/education/game/host`, { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(2500);
  const createBtn = p.getByRole('button', { name: /Create room/i });
  await createBtn.scrollIntoViewIfNeeded();
  const t0 = Date.now();
  await createBtn.click();
  // Poll: did URL change to /play/ within 8s with just ONE click?
  let landed = false;
  for (let tries = 0; tries < 40; tries++) {
    await p.waitForTimeout(200);
    if (p.url().includes('/game/play/')) { landed = true; break; }
    // if org dialog appears, this is a separate gate, not a double-click bug -- handle it
    const dialog = p.getByRole('dialog');
    if (await dialog.isVisible().catch(()=>false)) {
      const orgBtn = dialog.getByRole('button', { name: "admin's Workspace" });
      if (await orgBtn.isVisible().catch(()=>false)) {
        await orgBtn.click();
        await p.waitForTimeout(200);
        await dialog.getByRole('button', { name: /^Continue$/i }).click();
      }
    }
  }
  const elapsed = Date.now() - t0;
  console.log(`[host run ${i}] landed=${landed} elapsed=${elapsed}ms url=${p.url()}`);
  await p.close();
}
await browser.close();

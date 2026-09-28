import { chromium } from 'playwright';
const HOST = 'wave2edu.localhost:3001';
const STATE = '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/state.json';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE });

for (let i = 1; i <= 5; i++) {
  const p = await context.newPage();
  await p.goto(`http://${HOST}/education/game/host`, { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(2500);
  const createBtn = p.getByRole('button', { name: /Create room/i });
  await createBtn.scrollIntoViewIfNeeded();
  await createBtn.click();
  // wait to land in lobby
  for (let tries = 0; tries < 40; tries++) {
    await p.waitForTimeout(200);
    if (p.url().includes('/game/play/')) break;
  }
  // Now wait for "Start game" button to become enabled (queueReady), then click ONCE.
  const startBtn = p.getByRole('button', { name: /Start game|Preparing/i });
  await startBtn.waitFor({ state: 'visible', timeout: 15000 });
  // Wait for it to say "Start game" (enabled) rather than "Preparing..."
  await p.waitForFunction(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => /Start game|Preparing/.test(x.textContent || ''));
    return b && /Start game/.test(b.textContent || '') && !b.disabled;
  }, { timeout: 20000 }).catch(() => console.log(`[run ${i}] never became ready`));
  const t0 = Date.now();
  await startBtn.click();
  let started = false;
  for (let tries = 0; tries < 40; tries++) {
    await p.waitForTimeout(200);
    // "playing" state renders PlaySurface -- look for absence of "Start game"/"Waiting for players" lobby text
    const stillLobby = await p.getByText(/Join code/).isVisible().catch(()=>false);
    if (!stillLobby) { started = true; break; }
  }
  const elapsed = Date.now() - t0;
  console.log(`[start run ${i}] started=${started} elapsed=${elapsed}ms url=${p.url()}`);
  await p.close();
}
await browser.close();

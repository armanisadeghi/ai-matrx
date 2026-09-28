import { chromium } from 'playwright';
const HOST = 'wave2edu.localhost:3001';
const STATE = '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/state.json';

const browser = await chromium.launch();
const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE });
const joinCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: STATE });

for (let i = 1; i <= 5; i++) {
  // Host creates a room.
  const hp = await hostCtx.newPage();
  await hp.goto(`http://${HOST}/education/game/host`, { waitUntil: 'load', timeout: 60000 });
  await hp.waitForTimeout(2500);
  const createBtn = hp.getByRole('button', { name: /Create room/i });
  try {
    await createBtn.waitFor({ state: 'visible', timeout: 30000 });
  } catch (e) {
    await hp.screenshot({ path: `/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/fail-host-${i}.png` });
    console.log(`[join run ${i}] host page failed to show Create room; url=${hp.url()}`);
    await hp.close();
    continue;
  }
  await createBtn.scrollIntoViewIfNeeded();
  await createBtn.click();
  let code = null;
  for (let tries = 0; tries < 40; tries++) {
    await hp.waitForTimeout(200);
    const m = hp.url().match(/code=([A-Z0-9]+)/i);
    if (m) { code = decodeURIComponent(m[1]); break; }
  }
  if (!code) { console.log(`[join run ${i}] FAILED to get code`); await hp.close(); continue; }

  // Joiner enters the code with real clicks.
  const jp = await joinCtx.newPage();
  await jp.goto(`http://${HOST}/education/game/join`, { waitUntil: 'load', timeout: 60000 });
  await jp.waitForTimeout(1500);
  const input = jp.getByPlaceholder('ABC12');
  await input.click();
  await input.type(code, { delay: 30 });
  const joinBtn = jp.getByRole('button', { name: /^Join$/i });
  const t0 = Date.now();
  await joinBtn.click();
  let landed = false;
  for (let tries = 0; tries < 40; tries++) {
    await jp.waitForTimeout(200);
    if (jp.url().includes('/game/play/')) { landed = true; break; }
  }
  const elapsed = Date.now() - t0;
  console.log(`[join run ${i}] code=${code} landed=${landed} elapsed=${elapsed}ms url=${jp.url()}`);
  await hp.close();
  await jp.close();
}
await browser.close();

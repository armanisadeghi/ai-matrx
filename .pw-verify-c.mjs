import { chromium } from 'playwright';
const S = '/private/tmp/claude-501/-Users-armanisadeghi-code/b99b203d-b44a-48d9-8b71-cf5d74fb29db/scratchpad/pw';
const base = 'http://s20c29cb9.localhost:3001';
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, storageState: S + '/state.json' });
const page = await ctx.newPage();
let log = [];
page.on('websocket', ws => {
  if (!/cartesia/i.test(ws.url())) return;
  const rec = { url: ws.url().split('?')[0], sent: [], recvText: 0, recvChunks: 0, errors: [], done: 0 };
  log.push(rec);
  ws.on('framesent', f => { if (typeof f.payload === 'string') rec.sent.push(f.payload.slice(0, 400)); });
  ws.on('framereceived', f => { if (typeof f.payload === 'string') { rec.recvText++; try { const j = JSON.parse(f.payload); if (j.type==='chunk') rec.recvChunks++; if (j.type==='done' || j.done) rec.done++; if (j.type==='error' || j.error) rec.errors.push(f.payload.slice(0,300)); } catch {} } else rec.recvChunks++; });
});
page.on('console', m => { if (m.type()==='error' && /cartesia|tts|speak|emotion/i.test(m.text())) console.log('CONSOLE', m.text().slice(0,300)); });
async function go(p){ for(let i=0;i<3;i++){ try{ await page.goto(base+p,{waitUntil:'load',timeout:120000}); break;}catch(e){ await page.waitForTimeout(3000);} } await page.waitForTimeout(8000); }
async function playSample(tag){
  await go('/user-settings/voice/voices');
  const btns = page.getByRole('button', { name: /^Play sample for/ });
  console.log(tag, 'play buttons:', await btns.count());
  log = [];
  await btns.first().click();
  await page.waitForTimeout(12000);
  console.log(tag, JSON.stringify(log, null, 1).slice(0, 2500));
  const err = await page.getByText(/The sample could not play/).count();
  console.log(tag, 'sample error text visible:', err);
}
await playSample('WITH_CALM');
// set to None
await go('/user-settings/voice/input');
const combo = page.getByRole('combobox').first();
console.log('combo text before:', await combo.innerText().catch(e=>'ERR '+e.message));
await combo.click(); await page.waitForTimeout(800);
const opts = await page.getByRole('option').allInnerTexts(); console.log('options:', JSON.stringify(opts));
await page.getByRole('option', { name: /^None/ }).click(); await page.waitForTimeout(3000);
console.log('combo text after:', await combo.innerText());
await playSample('WITH_NONE');
// restore Calm
await go('/user-settings/voice/input');
const c2 = page.getByRole('combobox').first();
await c2.click(); await page.waitForTimeout(800);
await page.getByRole('option', { name: /^Calm$/ }).click(); await page.waitForTimeout(4000);
await page.reload({waitUntil:'load'}); await page.waitForTimeout(8000);
console.log('restored combo text after reload:', await page.getByRole('combobox').first().innerText());
// doors
for (const p of ['/user-settings/voice/input','/user-settings/communication/video']) {
  await go(p);
  await page.getByRole('button', { name: /Open device settings/ }).first().click().catch(async()=>{ await page.getByText('Open device settings').first().click(); });
  await page.waitForTimeout(6000);
  console.log('DOOR from', p, '->', page.url(), '|', (await page.locator('main').first().innerText()).slice(0,200).replace(/\n/g,' / '));
}
await go('/user-settings/communication/email'); await page.waitForTimeout(10000);
console.log('EMAIL:', (await page.locator('main').first().innerText()).slice(0,1500));
await page.screenshot({ path: S+'/email.png' });
await browser.close();

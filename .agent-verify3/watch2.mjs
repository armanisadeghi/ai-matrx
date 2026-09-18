import { chromium } from 'playwright';
import fs from 'fs';

const RULEBOOK_URL = 'http://acquisition-frontier.localhost:3001/masterwork/03cb27e4-887b-4138-8b2b-39f6c38fcd5a';
const LOG = '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/watch2.log';
const SHOTDIR = '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();

let loaded = false;
for (let attempt = 0; attempt < 5 && !loaded; attempt++) {
  try {
    await page.goto(RULEBOOK_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    loaded = true;
  } catch (e) {
    log(`goto attempt ${attempt} failed: ${e.message}`);
    await new Promise(r => setTimeout(r, 5000));
  }
}
if (!loaded) { log('FATAL: could not load page after retries'); process.exit(1); }
log('loaded page');

const maxIters = 200; // up to 200 * 15s ~= 50 min
let lastSummary = '';
for (let i = 0; i < maxIters; i++) {
  await page.waitForTimeout(15000);
  let bodyText;
  try {
    bodyText = await page.evaluate(() => document.body.innerText);
  } catch (e) {
    log(`iter=${i} evaluate failed: ${e.message}, reloading`);
    try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }); } catch(e2) { log('reload failed too: ' + e2.message); }
    continue;
  }
  const lines = bodyText.split('\n');
  const summaryIdx = lines.findIndex(l => /sources read/.test(l));
  const summary = summaryIdx >= 0 ? lines[summaryIdx] : null;
  const clockIdx = lines.findIndex(l => /so far/.test(l));
  const clockLine = clockIdx >= 0 ? lines[clockIdx] : null;
  log(`iter=${i} summary="${summary}" clock="${clockLine}"`);

  if (i % 6 === 0) {
    try { await page.screenshot({ path: `${SHOTDIR}/p2_${i}.png`, fullPage: true }); } catch(e) {}
  }
  if (/did not finish|lost the live view|run_lost/i.test(bodyText) && i % 6 !== 0) {
    try { await page.screenshot({ path: `${SHOTDIR}/p2_failnotice_${i}.png`, fullPage: true }); } catch(e) {}
  }
  if (summary && /^21 of 21/.test(summary)) {
    log('ALL 21 READ - stopping poll loop');
    try { await page.screenshot({ path: `${SHOTDIR}/final_complete.png`, fullPage: true }); } catch(e) {}
    break;
  }
  lastSummary = summary;
}

try { await page.screenshot({ path: `${SHOTDIR}/final_state.png`, fullPage: true }); } catch(e) {}
try { await context.storageState({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' }); } catch(e) {}
log('watch script done');
await browser.close();

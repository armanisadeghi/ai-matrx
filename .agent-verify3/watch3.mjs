import { chromium } from 'playwright';
import fs from 'fs';

const RULEBOOK_URL = 'http://acquisition-frontier.localhost:3001/masterwork/03cb27e4-887b-4138-8b2b-39f6c38fcd5a';
const LOG = '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/watch3.log';
const SHOTDIR = '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1400 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
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
log('loaded page for watch3');

const maxIters = 90; // 90*15s = 22.5 min
for (let i = 0; i < maxIters; i++) {
  await page.waitForTimeout(15000);
  let bodyText;
  try {
    bodyText = await page.evaluate(() => document.body.innerText);
  } catch (e) {
    log(`iter=${i} evaluate failed: ${e.message}`);
    try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }); } catch(e2){}
    continue;
  }
  const lines = bodyText.split('\n');
  const summaryIdx = lines.findIndex(l => /sources read/.test(l));
  const summary = summaryIdx >= 0 ? lines[summaryIdx] : null;
  const clockIdx = lines.findIndex(l => /so far/.test(l));
  const clockLine = clockIdx >= 0 ? lines[clockIdx] : null;
  const ruleCount = (bodyText.match(/(\d+)\nRules/)||[])[1] || null;
  log(`iter=${i} summary="${summary}" clock="${clockLine}" rules="${ruleCount}"`);
  if (i % 6 === 0) { try { await page.screenshot({ path: `${SHOTDIR}/r3_${i}.png`, fullPage: true }); } catch(e){} }
  if (/did not finish/i.test(bodyText)) {
    log('DID NOT FINISH detected again');
    try { await page.screenshot({ path: `${SHOTDIR}/r3_stopped_${i}.png`, fullPage: true }); } catch(e){}
    break;
  }
  if (summary && /^21 of 21/.test(summary)) {
    log('ALL 21 READ');
    try { await page.screenshot({ path: `${SHOTDIR}/r3_complete.png`, fullPage: true }); } catch(e){}
    break;
  }
}
try { await page.screenshot({ path: `${SHOTDIR}/r3_final.png`, fullPage: true }); } catch(e){}
log('watch3 done');
await browser.close();

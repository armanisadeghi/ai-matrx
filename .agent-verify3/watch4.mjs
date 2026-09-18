import { chromium } from 'playwright';
import fs from 'fs';

const RULEBOOK_URL = 'http://acquisition-frontier.localhost:3001/masterwork/03cb27e4-887b-4138-8b2b-39f6c38fcd5a';
const LOG = '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/watch4.log';
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
  try { await page.goto(RULEBOOK_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }); loaded = true; }
  catch (e) { log(`goto attempt ${attempt} failed: ${e.message}`); await new Promise(r => setTimeout(r, 5000)); }
}
log('loaded page for watch4');

const maxIters = 100; // 100*15s ~25min
let consecStopped = 0;
for (let i = 0; i < maxIters; i++) {
  await page.waitForTimeout(15000);
  let bodyText;
  try { bodyText = await page.evaluate(() => document.body.innerText); }
  catch (e) { log(`iter=${i} evaluate failed: ${e.message}`); try{await page.reload({waitUntil:'domcontentloaded',timeout:45000});}catch(e2){}; continue; }
  const lines = bodyText.split('\n');
  const summaryIdx = lines.findIndex(l => /sources read/.test(l));
  const summary = summaryIdx >= 0 ? lines[summaryIdx] : null;
  const clockIdx = lines.findIndex(l => /so far/.test(l));
  const clockLine = clockIdx >= 0 ? lines[clockIdx] : null;
  const stillRunning = /Turning it into rules|Reading /.test(bodyText);
  const stopped = /This one did not finish/.test(bodyText);
  log(`iter=${i} summary="${summary}" clock="${clockLine}" running=${stillRunning} stopped=${stopped}`);
  if (i % 8 === 0) { try{await page.screenshot({path:`${SHOTDIR}/w4_${i}.png`, fullPage:true});}catch(e){} }
  if (stopped) {
    consecStopped++;
    try{await page.screenshot({path:`${SHOTDIR}/w4_stopped_${i}.png`, fullPage:true});}catch(e){}
    if (consecStopped >= 3) { log('confirmed stopped 3x, breaking'); break; }
  } else {
    consecStopped = 0;
  }
  if (summary && !stillRunning && !stopped) {
    log('run appears to have reached a summary with no active running text - possible completion');
    try{await page.screenshot({path:`${SHOTDIR}/w4_possible_done_${i}.png`, fullPage:true});}catch(e){}
  }
  if (/of 29 sources read/.test(bodyText) && bodyText.match(/(\d+) of 29 sources read/)?.[1] === '29') {
    log('ALL 29 READ');
    try{await page.screenshot({path:`${SHOTDIR}/w4_complete.png`, fullPage:true});}catch(e){}
    break;
  }
}
try{await page.screenshot({path:`${SHOTDIR}/w4_final.png`, fullPage:true});}catch(e){}
log('watch4 done');
await browser.close();

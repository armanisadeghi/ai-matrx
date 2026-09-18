import { chromium } from 'playwright';
import fs from 'fs';

const RULEBOOK_URL = 'http://acquisition-frontier.localhost:3001/masterwork/03cb27e4-887b-4138-8b2b-39f6c38fcd5a';
const LOG = '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/watch.log';
const SHOTDIR = '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();

await page.goto(RULEBOOK_URL, { waitUntil: 'load', timeout: 30000 });
log('loaded page');

const maxIters = 240; // up to 240 * 15s = 60 min
let lastText = '';
for (let i = 0; i < maxIters; i++) {
  await page.waitForTimeout(15000);
  const bodyText = await page.evaluate(() => document.body.innerText);
  // look for the progress summary line and per-source status
  const lines = bodyText.split('\n');
  const summaryIdx = lines.findIndex(l => /sources read/.test(l));
  const summary = summaryIdx >= 0 ? lines[summaryIdx] : null;
  const readingIdx = lines.findIndex(l => /^Reading /.test(l) || /so far/.test(l));
  const readingLine = readingIdx >= 0 ? lines.slice(readingIdx, readingIdx+2).join(' | ') : null;
  const errorCount = (bodyText.match(/error/gi) || []).length;
  const changed = summary !== lastText;
  log(`iter=${i} summary="${summary}" reading="${readingLine}" errorMentions=${errorCount} changed=${changed}`);
  lastText = summary;

  if (summary && /^0 of 21/.test(summary) === false && /21 of 21/.test(summary)) {
    log('ALL 21 READ - taking final screenshot and stopping poll loop');
    await page.screenshot({ path: `${SHOTDIR}/final_complete.png`, fullPage: true });
    break;
  }
  if (i % 8 === 0) {
    await page.screenshot({ path: `${SHOTDIR}/progress_${i}.png`, fullPage: true });
  }
  // check for terminal/failure banners
  if (/did not finish|lost the live view|run_lost/i.test(bodyText)) {
    log('DETECTED possible terminal-failure banner text');
    await page.screenshot({ path: `${SHOTDIR}/failure_detected_${i}.png`, fullPage: true });
  }
}

await page.screenshot({ path: `${SHOTDIR}/final_state.png`, fullPage: true });
await context.storageState({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
log('watch script done');
await browser.close();

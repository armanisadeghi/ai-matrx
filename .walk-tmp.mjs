import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/phase1-walk';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3001';
const EMAIL = process.env.ADM_EMAIL;
const PASS = process.env.ADM_PASS;

const log = [];
function note(s) { log.push(s); console.log(s); }
async function shot(page, name) {
  try { await page.screenshot({ path: `${OUT}/${name}.png` }); note(`SHOT ${name}`); }
  catch (e) { note(`SHOT-FAIL ${name}: ${e}`); }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') note(`CONSOLE ERROR: ${m.text().slice(0,300)}`); });
  page.on('pageerror', e => note(`PAGE ERROR: ${String(e).slice(0,300)}`));
  page.on('requestfailed', r => note(`REQ FAILED: ${r.url()} ${r.failure()?.errorText}`));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await Promise.all([page.waitForLoadState('networkidle').catch(()=>{}), page.click('button[type="submit"]')]);
  await page.waitForTimeout(2000);
  note(`login -> ${page.url()}`);

  await page.goto(`${BASE}/knowledge/library`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '01a-library-list');

  // Dump interactive controls near the top toolbar
  const buttons = await page.locator('button').allTextContents();
  fs.writeFileSync(`${OUT}/_buttons.txt`, buttons.filter(b=>b.trim()).join('\n'));
  note(`buttons found: ${buttons.length}`);

  // Try to find and use search box
  const searchBox = page.locator('input[placeholder*="Search" i]').first();
  if (await searchBox.count()) {
    await searchBox.fill('AI');
    await page.waitForTimeout(1200);
    await shot(page, '01b-library-search-AI');
    await searchBox.fill('');
    await page.waitForTimeout(800);
  } else {
    note('no search box found with placeholder*=Search');
  }

  // Open the first source row
  const rows = page.locator('[class*="row"], a, div').filter({ hasText: /Transcript|YouTube|Saved/ });
  // Try clicking first plausible card/link
  const firstCard = page.locator('a').filter({ hasText: /Transcript|Saved|captions/ }).first();
  if (await firstCard.count()) {
    await firstCard.click({ timeout: 5000 }).catch(async ()=>{
      // fallback: click first list item text block
      const alt = page.getByText(/Transcript · \d+ segments/).first();
      await alt.click({ timeout: 5000 }).catch(()=>note('could not click any source row'));
    });
    await page.waitForTimeout(2000);
    note(`opened source -> ${page.url()}`);
    await shot(page, '02-source-open');
  } else {
    note('no clickable source card found');
  }

  // search page for "edited version" banner text anywhere already loaded
  const bodyNow = await page.textContent('body').catch(()=>'');
  if (/edited version|View original/i.test(bodyNow||'')) {
    note('FOUND "edited version / View original" text on this source');
    await shot(page, '02b-edited-version-banner');
  } else {
    note('no edited-version banner on this source (may not have edits)');
  }

  // Go back to library, filter by Transcript stage/type if a filter control exists
  await page.goto(`${BASE}/knowledge/library`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const filterButtons = await page.locator('button, [role="tab"], [role="button"]').allTextContents();
  fs.writeFileSync(`${OUT}/_filters.txt`, filterButtons.filter(b=>b.trim()).join('\n'));

  const transcriptFilter = page.getByText(/^Transcript$/i).first();
  if (await transcriptFilter.count()) {
    await transcriptFilter.click({timeout:4000}).catch(()=>note('transcript filter click failed'));
    await page.waitForTimeout(1200);
    await shot(page, '08a-transcript-filter');
  } else {
    note('no explicit Transcript filter control found by exact text');
  }

  await browser.close();
  fs.writeFileSync(`${OUT}/_run-log.txt`, log.join('\n'));
})().catch(e => { console.error('FATAL', e); fs.writeFileSync(`${OUT}/_run-log.txt`, log.join('\n') + '\nFATAL: ' + e); process.exit(1); });

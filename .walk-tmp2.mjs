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
  page.on('console', m => { if (m.type() === 'error') note(`CONSOLE ERROR: ${m.text().slice(0,200)}`); });
  page.on('pageerror', e => note(`PAGE ERROR: ${String(e).slice(0,200)}`));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await Promise.all([page.waitForLoadState('networkidle').catch(()=>{}), page.click('button[type="submit"]')]);
  await page.waitForTimeout(1500);

  await page.goto(`${BASE}/knowledge/library`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Search
  const search = page.locator('input[placeholder="Search Sources"]');
  if (await search.count()) {
    await search.fill('AI');
    await page.waitForTimeout(1200);
    await shot(page, '01b-search-AI');
    await search.fill('');
    await page.waitForTimeout(800);
  } else note('search box not found by exact placeholder');

  // Open first row (click on NAME cell text)
  const firstNameCell = page.locator('table tbody tr').first().locator('td').nth(1);
  await firstNameCell.click({ timeout: 5000 }).catch(async e => note('row click failed: '+e));
  await page.waitForTimeout(2000);
  note(`after opening row -> ${page.url()}`);
  await shot(page, '02-source-detail');
  const body2 = await page.textContent('body').catch(()=>'');
  if (/edited version|View original/i.test(body2||'')) { note('found edited-version banner text'); await shot(page,'02b-edited-banner'); }
  else note('no edited-version banner on this particular source');
  fs.writeFileSync(`${OUT}/_source-detail-body.txt`, body2||'');

  // back to library
  await page.goto(`${BASE}/knowledge/library`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Click "Add" to see scrape/paste entry points
  const addBtn = page.getByRole('button', { name: /^Add$/ }).first();
  if (await addBtn.count()) {
    await addBtn.click({ timeout: 5000 }).catch(e=>note('add click failed: '+e));
    await page.waitForTimeout(1200);
    await shot(page, '03-add-menu');
    const addBody = await page.textContent('body').catch(()=>'');
    fs.writeFileSync(`${OUT}/_add-menu-body.txt`, addBody||'');
  } else note('no Add button found');

  await browser.close();
  fs.writeFileSync(`${OUT}/_run-log2.txt`, log.join('\n'));
})().catch(e => { console.error('FATAL', e); fs.writeFileSync(`${OUT}/_run-log2.txt`, log.join('\n') + '\nFATAL: ' + e); process.exit(1); });

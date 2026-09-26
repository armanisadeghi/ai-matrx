import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
const OUT = '/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/phase1-walk-2';
const BASE = 'http://localhost:3001';
const results = [];
function log(step, status, note) { results.push({ step, status, note }); console.log(`[${status}] ${step}: ${note}`); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name) }).catch(e => console.log('shot fail', name, e.message)); }

(async () => {
  const userDataDir = '/Users/armanisadeghi/code/matrx-frontend/.walk-profile';
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`${BASE}/knowledge/library`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.click('text=Add');
  await page.waitForTimeout(500);
  await page.click('text=Paste text');
  await page.waitForTimeout(1200);
  const marker = `Seated walk #2 paste-text probe ${Date.now()}`;
  const ta = await page.$('textarea');
  await ta.fill(`${marker}\n\nThis is a test paste for the phase-1 seated walk verifying Not yet searchable -> Process now -> Indexing -> Searchable.`);
  await page.click('button:has-text("Add to Sources")');
  await page.waitForTimeout(4000);
  await shot(page, '10c-paste-text-saved.png');

  // find in library
  await page.fill('input[placeholder*="Search Sources" i]', marker.slice(0,30));
  await page.waitForTimeout(2000);
  await shot(page, '10d-paste-text-found-row.png');
  const text = await page.textContent('body');
  const hasNotYet = /Not yet searchable/i.test(text);
  log('4-paste-land', hasNotYet ? 'PASS' : 'INFO', `Not yet searchable visible: ${hasNotYet}`);

  // open it and click Process now
  await page.click('table tbody tr:first-child');
  await page.waitForTimeout(4000);
  await shot(page, '10e-paste-source-detail.png');
  fs.writeFileSync(path.join(OUT, 'results-10b.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync('/tmp/paste_marker.txt', marker);
  console.log('SOURCE_URL', page.url());
  await context.close();
})();

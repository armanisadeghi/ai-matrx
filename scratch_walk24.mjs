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
  await shot(page, '10a-paste-text-panel.png');
  // find textarea
  const ta = await page.$('textarea');
  const marker = `Seated walk #2 paste-text probe ${Date.now()}`;
  if (ta) {
    await ta.fill(`${marker}\n\nThis is a test paste for the phase-1 seated walk verifying Not yet searchable -> Process now -> Indexing -> Searchable.`);
    await shot(page, '10b-paste-text-filled.png');
  }
  // find title input if separate
  const titleInput = await page.$('input[placeholder*="title" i], input[placeholder*="Title" i]');
  if (titleInput) { await titleInput.fill(marker); }
  fs.writeFileSync(path.join(OUT, 'results-10.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync('/tmp/paste_marker.txt', marker);
  await context.close();
})();

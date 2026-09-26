import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
const OUT = '/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/phase1-walk-2';
const results = [];
function log(step, status, note) { results.push({ step, status, note }); console.log(`[${status}] ${step}: ${note}`); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name) }).catch(e => console.log('shot fail', name, e.message)); }
(async () => {
  const userDataDir = '/Users/armanisadeghi/code/matrx-frontend/.walk-profile';
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto('http://localhost:3001/knowledge/library', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const marker = fs.readFileSync('/tmp/paste_marker.txt', 'utf-8').trim();
  await page.fill('input[placeholder*="Search Sources" i]', marker.slice(0,30));
  await page.waitForTimeout(2000);
  const dialogOpen = await page.$('text=Captured, not saved');
  if (dialogOpen) {
    await page.click('button:has-text("Save"):near(button:has-text("Cancel"))');
    await page.waitForTimeout(4000);
  }
  await shot(page, '10f-after-real-save.png');
  const text = await page.textContent('body');
  log('4-real-save', /Not yet searchable/i.test(text) ? 'PASS' : 'INFO', 'Not yet searchable visible: ' + /Not yet searchable/i.test(text));
  // open source detail
  await page.click('table tbody tr:first-child');
  await page.waitForTimeout(3000);
  await shot(page, '10g-source-detail-not-searchable.png');
  console.log('url', page.url());
  fs.writeFileSync(path.join(OUT, 'results-10c.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync('/tmp/paste_source_url.txt', page.url());
  await context.close();
})();

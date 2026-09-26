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
  page.on('response', r => { if (r.request().method() !== 'GET') console.log(r.status(), r.request().method(), r.url()); });
  await page.goto('http://localhost:3001/knowledge/sources/6d199cc1-8735-4104-b71c-475460054f87', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(1500);
  await shot(page, '10r-save-dialog-from-source.png');
  const dlg = await page.$('text=Captured, not saved');
  console.log('dialog visible?', !!dlg);
  fs.writeFileSync(path.join(OUT, 'results-10-save2.json'), JSON.stringify(results, null, 2));
  await context.close();
})();

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
  await page.waitForTimeout(4000);
  try {
    const rows = await page.$$('table tbody tr, [role="row"]');
    // click first row's name link
    const firstNameCell = await page.$('table tbody tr:first-child td:first-child, table tbody tr:first-child a');
    await page.click('table tbody tr:first-child');
    await page.waitForTimeout(3000);
    await shot(page, '02-source-detail.png');
    const url = page.url();
    const text = await page.textContent('body');
    const panes = ['Parts','Original','Clean','Raw','Chunks','Entities','Attached'];
    const found = panes.filter(p => new RegExp(p,'i').test(text));
    log('2-open-source', found.length >= 5 ? 'PASS' : 'INFO', `url=${url} panes found: ${found.join(',')}`);
  } catch(e) { log('2-open-source', 'FAIL', e.message); }
  fs.writeFileSync(path.join(OUT, 'results-2.json'), JSON.stringify(results, null, 2));
  await context.close();
})();

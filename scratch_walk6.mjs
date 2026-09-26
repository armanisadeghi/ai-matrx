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
  try {
    await page.click('text=Add', { timeout: 8000 });
    await page.waitForTimeout(1000);
    await shot(page, '03-add-menu.png');
    const text = await page.textContent('body');
    log('3-add-menu', 'INFO', text.slice(0,800));
  } catch(e) { log('3-add-menu', 'FAIL', e.message); }
  fs.writeFileSync(path.join(OUT, 'results-3.json'), JSON.stringify(results, null, 2));
  await context.close();
})();

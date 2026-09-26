import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
const OUT = '/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/phase1-walk-2';
const BASE = 'http://localhost:3001';
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name) }).catch(e => console.log('shot fail', name, e.message)); }
(async () => {
  const userDataDir = '/Users/armanisadeghi/code/matrx-frontend/.walk-profile';
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`${BASE}/knowledge/search`, { waitUntil: 'domcontentloaded' }).catch(async ()=>{
    await page.goto(`${BASE}/knowledge/library`, { waitUntil: 'domcontentloaded' });
  });
  await page.waitForTimeout(2500);
  await shot(page, '08a-search-page.png');
  console.log('url', page.url());
  await context.close();
})();

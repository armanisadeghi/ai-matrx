import { chromium } from 'playwright';
import path from 'path';
const OUT = '/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/phase1-walk-2';
const BASE = 'http://localhost:3001';
(async () => {
  const userDataDir = '/Users/armanisadeghi/code/matrx-frontend/.walk-profile';
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`${BASE}/knowledge/library`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(OUT, '01b-library-after-wait.png') });
  const text = await page.textContent('body');
  console.log('Checking count:', (text.match(/Checking/g)||[]).length);
  console.log('Indexed/Searchable count:', (text.match(/Searchable|Indexed|Not yet searchable/g)||[]).length);
  await context.close();
})();

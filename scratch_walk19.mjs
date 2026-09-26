import { chromium } from 'playwright';
import path from 'path';
const OUT = '/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/phase1-walk-2';
(async () => {
  const userDataDir = '/Users/armanisadeghi/code/matrx-frontend/.walk-profile';
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto('http://localhost:3001/knowledge/sources/c5ac7592-a994-494a-9395-e91c0edcda48', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.click('text=Attached to');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '07g-attached-to-loaded.png') });
  await context.close();
})();

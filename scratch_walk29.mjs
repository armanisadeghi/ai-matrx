import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
const OUT = '/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/phase1-walk-2';
(async () => {
  const userDataDir = '/Users/armanisadeghi/code/matrx-frontend/.walk-profile';
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto('http://localhost:3001/knowledge/library', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const marker = fs.readFileSync('/tmp/paste_marker.txt', 'utf-8').trim();
  await page.fill('input[placeholder*="Search Sources" i]', marker.slice(0,30));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '10j-precheck.png') });
  await context.close();
})();

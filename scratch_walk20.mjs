import { chromium } from 'playwright';
import path from 'path';
const OUT = '/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/phase1-walk-2';
(async () => {
  const userDataDir = '/Users/armanisadeghi/code/matrx-frontend/.walk-profile';
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto('http://localhost:3001/knowledge/sources/c5ac7592-a994-494a-9395-e91c0edcda48', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.click('text=Attached to');
  await page.waitForTimeout(1000);
  const panel = await page.$('text=Not attached to anything yet, text=Attached to');
  await page.evaluate(() => { const el = document.querySelector('[class*="attached"]') || document.body; });
  // scroll the right column
  await page.mouse.wheel(0, 0);
  const rightCol = await page.$('text=Utilities');
  await rightCol.scrollIntoViewIfNeeded();
  await page.mouse.move(1250, 400);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '07h-attached-scroll.png') });
  await context.close();
})();

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
const OUT = '/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/phase1-walk-2';
const results = [];
function log(step, status, note) { results.push({ step, status, note }); console.log(`[${status}] ${step}: ${note}`); }
(async () => {
  const userDataDir = '/Users/armanisadeghi/code/matrx-frontend/.walk-profile';
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  await page.goto('http://localhost:3001/scraper/search-and-scrape', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('input[placeholder*="keyword" i]', 'mediterranean diet benefits');
  await page.fill('input[type="number"]', '2');
  await page.click('button:has-text("Search & Scrape")');
  await page.waitForTimeout(15000);
  await page.screenshot({ path: path.join(OUT, '09b-search-scrape-results.png') });
  const text = await page.textContent('body');
  log('3-search-scrape', 'INFO', 'screenshot taken, see for sentence-match count and unkept wording');
  fs.writeFileSync(path.join(OUT, 'results-9.json'), JSON.stringify(results, null, 2));
  await context.close();
})();

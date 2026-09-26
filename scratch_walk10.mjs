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
  await page.click('text=Add');
  await page.waitForTimeout(500);
  await page.click('text=Paste a web address');
  await page.waitForTimeout(1000);
  const urlInput = await page.$('input[type="url"], input[placeholder*="URL" i], input[placeholder*="http" i], input[placeholder*="web address" i]');
  await urlInput.click();
  await urlInput.fill('https://example.com');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Read the page")', { force: true });
  await page.waitForTimeout(1500);
  // workspace picker
  const wsDialog = await page.$('text=Which workspace is this for?');
  if (wsDialog) {
    const opts = await page.$$('text=AI Matrx');
    for (const o of opts) { if (await o.isVisible()) { await o.click(); break; } }
    await page.waitForTimeout(300);
    await page.click('button:has-text("Continue")');
    log('5-workspace-pick', 'PASS', 'workspace picker appeared, chose AI Matrx');
  } else {
    log('5-workspace-pick', 'INFO', 'no workspace picker appeared');
  }
  await page.waitForTimeout(6000);
  await shot(page, '05c-scrape-save-panel.png');
  fs.writeFileSync(path.join(OUT, 'results-5.json'), JSON.stringify(results, null, 2));
  await context.close();
})();

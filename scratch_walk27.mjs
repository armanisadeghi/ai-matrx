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
  await page.goto('http://localhost:3001/knowledge/library', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const marker = fs.readFileSync('/tmp/paste_marker.txt', 'utf-8').trim();
  // remove AI Matrx org filter
  const removeOrgFilter = await page.$('button:has-text("AI Matrx") svg, [aria-label*="remove" i]');
  await page.click('text=AI Matrx >> xpath=following-sibling::*[1]').catch(()=>{});
  // simpler: click the x on the AI Matrx chip
  const chip = await page.$('div:has-text("AI Matrx")');
  await page.fill('input[placeholder*="Search Sources" i]', marker.slice(0,30));
  await page.waitForTimeout(1500);
  await shot(page, '10h-still-filtered.png');
  // click 'Clear filters'
  const clearBtn = await page.$('button:has-text("Clear filters")');
  if (clearBtn) { await clearBtn.click(); await page.waitForTimeout(1500); }
  await page.fill('input[placeholder*="Search Sources" i]', marker.slice(0,30));
  await page.waitForTimeout(2000);
  await shot(page, '10i-cleared-filters-search.png');
  const text = await page.textContent('body');
  log('4-find-after-clear', 'INFO', text.includes('No matching rows') ? 'still no match' : 'found row(s)');
  await context.close();
})();

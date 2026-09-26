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
  await page.goto('http://localhost:3001/knowledge/sources/6d199cc1-8735-4104-b71c-475460054f87', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.click('button:has-text("Process now")');
  await page.waitForTimeout(1500);
  await shot(page, '10o-processing-clicked.png');
  await page.waitForTimeout(6000);
  await shot(page, '10p-processing-6s.png');
  const text6 = await page.textContent('body');
  log('4-processing-state', 'INFO', /Indexing|Searchable|Not yet searchable/i.exec(text6)?.[0] || 'unknown');
  await page.waitForTimeout(15000);
  await shot(page, '10q-processing-final.png');
  const textF = await page.textContent('body');
  log('4-final-state', /Searchable/i.test(textF) && !/Not yet searchable/i.test(textF) ? 'PASS' : 'INFO', /Indexing|Searchable/i.exec(textF)?.[0] || 'unknown');
  fs.writeFileSync(path.join(OUT, 'results-4-process.json'), JSON.stringify(results, null, 2));
  await context.close();
})();

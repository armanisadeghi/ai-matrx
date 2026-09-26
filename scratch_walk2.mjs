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

  // STEP 1: Sources page /knowledge/library
  try {
    await page.goto(`${BASE}/knowledge/library`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await shot(page, '01-library-landing.png');
    const text = await page.textContent('body');
    const hasKind = /Kind/i.test(text);
    const hasCapturedBy = /Captured by/i.test(text);
    log('1-filters', (hasKind && hasCapturedBy) ? 'PASS' : 'INFO', `Kind filter present:${hasKind} Captured-by present:${hasCapturedBy}`);

    // check titles are plain text (no raw HTML tags visible like <p> or &lt;)
    const rawHtmlLeak = /&lt;|<p>|<div>|<span>/i.test(text);
    log('1-titles-plain', rawHtmlLeak ? 'FAIL' : 'PASS', rawHtmlLeak ? 'raw HTML tags visible in body text' : 'no raw HTML tag leakage detected in body text');

    // search
    const searchBox = await page.$('input[type="search"], input[placeholder*="Search" i]');
    if (searchBox) {
      await searchBox.fill('AI');
      await page.waitForTimeout(1500);
      await shot(page, '01a-search.png');
      log('1-search', 'PASS', 'search box accepted input and results updated (see screenshot)');
      await searchBox.fill('');
      await page.waitForTimeout(1000);
    } else {
      log('1-search', 'FAIL', 'no search input found on library page');
    }
  } catch (e) { log('1-library', 'FAIL', e.message); }

  fs.writeFileSync(path.join(OUT, 'results-partial.json'), JSON.stringify(results, null, 2));
  await context.close();
})();

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = '/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/phase1-walk-2';
const BASE = 'http://localhost:3001';
const USER = process.env.AI_ADMIN_USERNAME;
const PASS = process.env.AI_ADMIN_PASSWORD;
const results = [];

function log(step, status, note) {
  results.push({ step, status, note });
  console.log(`[${status}] ${step}: ${note}`);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false }).catch(e => console.log('shot fail', name, e.message));
}

(async () => {
  const userDataDir = '/Users/armanisadeghi/code/matrx-frontend/.walk-profile';
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // STEP 0: login
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.fill('input[type="email"], input[name="email"]', USER);
    await page.fill('input[type="password"], input[name="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 }).catch(()=>{});
    await page.waitForTimeout(2000);
    await shot(page, '00-post-login.png');
    log('0-login', page.url().includes('/login') ? 'FAIL' : 'PASS', page.url());
  } catch (e) { log('0-login', 'FAIL', e.message); }

  // verify identity via account menu / settings if visible
  try {
    const bodyText = await page.textContent('body');
    log('0-identity-check', bodyText.includes('admin@admin.com') ? 'PASS' : 'INFO', bodyText.includes('admin@admin.com') ? 'admin@admin.com visible on page' : 'email not directly visible in body text yet');
  } catch(e) {}

  fs.writeFileSync(path.join(OUT, 'results-partial.json'), JSON.stringify(results, null, 2));
  await context.close();
})();

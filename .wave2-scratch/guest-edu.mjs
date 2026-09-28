import { chromium } from 'playwright';
const HOST = 'wave2edu.localhost:3001';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); // no storageState = signed out
const page = await context.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push('[pageerror] ' + err.message));
page.on('response', (res) => {
  if (res.status() >= 500) errors.push(`[${res.status()}] ${res.url()}`);
});

await page.goto(`http://${HOST}/education`, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2000);
console.log('landing url:', page.url());

// Collect all internal /education* links on the landing page.
const hrefs = await page.$$eval('a[href^="/education"]', (as) =>
  Array.from(new Set(as.map((a) => a.getAttribute('href')))),
);
console.log('found links:', hrefs.length, JSON.stringify(hrefs));

const results = [];
for (const href of hrefs) {
  const url = `http://${HOST}${href}`;
  const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch((e) => ({ error: e.message }));
  await page.waitForTimeout(800);
  const finalUrl = page.url();
  const status = resp && 'status' in resp ? resp.status() : 'nav-error';
  // crude redirect-loop guard: bounced back to /login repeatedly handled by browser already
  results.push({ href, status, finalUrl });
}
console.log('RESULTS:', JSON.stringify(results, null, 2));
console.log('CONSOLE/NETWORK ERRORS:', JSON.stringify(errors, null, 2));
await browser.close();

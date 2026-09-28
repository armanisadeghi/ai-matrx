import { chromium } from 'playwright';

const LOGIN_URL = process.argv[2];
if (!LOGIN_URL) { console.error('usage: node login.mjs <loginUrl>'); process.exit(1); }

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(3000);
console.log('URL after login:', page.url());
await context.storageState({ path: '/Users/armanisadeghi/code/matrx-frontend/.wave2-scratch/state.json' });
await browser.close();
console.log('saved state');

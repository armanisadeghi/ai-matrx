import { chromium } from 'playwright';

const NONCE_URL = process.argv[2];
const OUT = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/bring-your-export/screens/verify-7';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
page.on('pageerror', err => console.log('PAGEERROR:', err.message));

await page.goto(NONCE_URL, { waitUntil: 'networkidle', timeout: 30000 });
console.log('URL after login:', page.url());
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/00-after-login.png`, fullPage: true });
console.log('Title:', await page.title());

await context.storageState({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/storage-state.json' });
await browser.close();
console.log('DONE');

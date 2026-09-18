import { chromium } from 'playwright';

const RULEBOOK_URL = 'http://acquisition-frontier.localhost:3001/masterwork/03cb27e4-887b-4138-8b2b-39f6c38fcd5a';
const FIX = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/own-files/fixtures-2026-09-18';

const files = [
  'book.epub','page_01.jpg','page_02.jpg','page_03.jpg','page_04.jpg','page_05.jpg','page_05.heic',
  'page_06.jpg','page_07.jpg','page_08.jpg','page_09.jpg','page_10.jpg','page_11.jpg','page_12.jpg',
  'spread_01.jpg','My Clippings.txt','readwise.csv','protected.epub','scanned.pdf','audiobook.m4b','nothing_here.txt'
].map(f => `${FIX}/${f}`);
console.log('file count', files.length);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();

await page.goto(RULEBOOK_URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/mobile_01_before.png', fullPage: true });

// expand resources if needed
const addFirst = page.locator('text=Add your first resource');
if (await addFirst.count() > 0) {
  await addFirst.click();
  await page.waitForTimeout(500);
}

const fileInput = page.locator('input[type=file]').first();
await fileInput.setInputFiles(files);
console.log('files set, waiting for processing...');
await page.waitForTimeout(4000);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/mobile_02_after_select.png', fullPage: true });

await context.storageState({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
await browser.close();

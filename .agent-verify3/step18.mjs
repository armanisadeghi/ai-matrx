import { chromium } from 'playwright';

const RULEBOOK_URL = 'http://acquisition-frontier.localhost:3001/masterwork/03cb27e4-887b-4138-8b2b-39f6c38fcd5a';
const FIX = '/Users/armanisadeghi/code/common-docs/projects/acquisition-frontier/own-files/fixtures-2026-09-18';

const files = [
  'book.epub','page_01.jpg','page_02.jpg','page_03.jpg','page_04.jpg','page_05.jpg','page_05.heic',
  'page_06.jpg','page_07.jpg','page_08.jpg','page_09.jpg','page_10.jpg','page_11.jpg','page_12.jpg',
  'spread_01.jpg','My Clippings.txt','readwise.csv','protected.epub','scanned.pdf','audiobook.m4b','nothing_here.txt'
].map(f => `${FIX}/${f}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
const page = await context.newPage();
page.on('request', r => { const u=r.url(); if (r.method()==='POST' && /upload|resource|file|attach/i.test(u)) console.log('REQ', r.method(), u.slice(0,140)); });
page.on('response', r => { const u=r.url(); if (r.status()>=400 && /upload|resource|file|attach/i.test(u)) console.log('RESP-ERR', r.status(), u.slice(0,140)); });

await page.goto(RULEBOOK_URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1500);
const addFirst = page.locator('text=Add your first resource');
if (await addFirst.count() > 0) { await addFirst.click(); await page.waitForTimeout(500); }

const fileInput = page.locator('input[type=file]').first();
await fileInput.setInputFiles(files);
console.log('files set at', new Date().toISOString());

for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(10000);
  const turnBtn = await page.$('button:has-text("Turn this into rules")');
  const disabled = turnBtn ? await turnBtn.isDisabled() : 'not-found';
  const bodyText = await page.evaluate(() => document.body.innerText);
  const resourcesLine = bodyText.split('\n').filter(l => /resource|attach|uploading|queued|file/i.test(l)).slice(0,8);
  console.log(`t=${(i+1)*10}s disabled=${disabled}`, JSON.stringify(resourcesLine));
  if (disabled === false) { console.log('ENABLED - breaking'); break; }
}
await page.screenshot({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/19_attach_progress.png', fullPage: true });
await context.storageState({ path: '/private/tmp/claude-501/-Users-armanisadeghi-code/97ce06fb-fe43-496b-8c0d-08baed25bfa7/scratchpad/verify3/state.json' });
await browser.close();

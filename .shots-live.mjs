import { chromium } from 'playwright';
import fs from 'fs';
const out = '/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-27/web-source-screen';
const login = fs.readFileSync('/private/tmp/claude-501/dl3.txt','utf8').trim().replace('next=/dashboard','next=/scraper/quick');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(login, { timeout: 300000 });
await p.waitForTimeout(2000);
await p.goto('http://s05f33637.localhost:3001/scraper/quick', { timeout: 300000 });
const who = await p.evaluate(() => { let raw=''; for (const c of document.cookie.split(';')) { const [k,...v]=c.trim().split('='); if(k.startsWith('sb-matrx-auth-v2.')) raw+=decodeURIComponent(v.join('=')); } raw = raw.startsWith('base64-')? atob(raw.slice(7).replace(/-/g,'+').replace(/_/g,'/')) : raw; return JSON.parse(raw).user.email; });
console.log('identity', who);
if (who !== 'admin@admin.com') process.exit(1);
await p.getByPlaceholder('Enter URL to scrape...').fill('https://en.wikipedia.org/wiki/Photosynthesis');
await p.getByRole('button', { name: /Full Scrape/ }).click();
await p.getByRole('tab', { name: 'Structured', exact: true }).waitFor({ timeout: 180000 });
await p.waitForTimeout(2500);
for (const [tab, name] of [['Pretty','pretty'],['Content','organized'],['Structured','structured']]) {
  await p.getByRole('tab', { name: tab, exact: true }).click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/live-scraper-${name}-1440.png` });
}
await p.getByRole('button', { name: 'Save', exact: true }).first().click();
await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Save', exact: true }).last().click();
await p.waitForTimeout(5000);
console.log('saved; text has Saved?', (await p.evaluate(()=>document.body.innerText)).match(/Saved[^\n]{0,60}/)?.[0]);
await b.close();

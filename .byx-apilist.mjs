import { chromium } from 'playwright';
const [,, storageStatePath] = process.argv;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storageStatePath });
const page = await context.newPage();
await page.goto('http://acquisition-frontier.localhost:3001/exports', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(500);
const res = await page.evaluate(async () => {
  const r = await fetch('https://server.app.matrxserver.com/media/exports', { credentials: 'include' });
  return { status: r.status, text: await r.text() };
});
console.log(res.status);
console.log(res.text.slice(0, 3000));
await browser.close();

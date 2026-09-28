import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://wave4b-adversarial.localhost:3001";
const LOGIN_URL = process.env.LOGIN_URL;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function resumeIfParked() {
  for (let tries = 0; tries < 15; tries++) {
    if (page.url().includes("/__dev-walk")) {
      const form = page.locator('form[action="/__dev-walk"] button[type=submit]');
      if (await form.count()) {
        await Promise.all([page.waitForNavigation({ waitUntil: "load", timeout: 60000 }).catch(() => {}), form.click()]);
        await page.waitForTimeout(1200);
      } else { await page.waitForTimeout(3000); await page.reload({ waitUntil: "load", timeout: 60000 }).catch(() => {}); }
    } else return true;
  }
  return false;
}
async function gotoWithRetry(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try { await page.goto(url, { waitUntil: "load", timeout: 90000 }); return true; }
    catch (e) { console.log(`goto attempt ${i} failed:`, e.message.split("\n")[0]); await page.waitForTimeout(3000); }
  }
  return false;
}

await gotoWithRetry(LOGIN_URL);
await resumeIfParked();
await gotoWithRetry(`${BASE}/education/overview`);
await resumeIfParked();
await page.waitForTimeout(4000);

const info = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button[aria-label*="organization" i], button[title*="organization" i]')];
  return btns.map(b => {
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      aria: b.getAttribute('aria-label'),
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      html: b.outerHTML.slice(0, 300),
    };
  });
});
console.log(JSON.stringify(info, null, 2));

await browser.close();

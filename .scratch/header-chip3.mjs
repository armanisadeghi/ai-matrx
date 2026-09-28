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

await page.goto(LOGIN_URL, { waitUntil: "load", timeout: 90000 }).catch(e => console.log("login goto err:", e.message.split("\n")[0]));
await resumeIfParked();
await gotoWithRetry(`${BASE}/education/overview`);
await resumeIfParked();
await page.waitForTimeout(8000);

const info = await page.evaluate(() => {
  const btn = document.querySelector('.shell-header-right button[aria-label="Choose an organization"], .shell-header-right button[aria-label="Change organization"], .shell-header-right button[title*="organization" i]');
  if (!btn) return { found: false };
  const chain = [];
  let el = btn;
  let depth = 0;
  while (el && depth < 10) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    chain.push({
      tag: el.tagName, cls: (el.className||'').toString().slice(0,120),
      rect: { w: r.width, h: r.height }, display: cs.display, position: cs.position,
      overflow: cs.overflow, width: cs.width, flexBasis: cs.flexBasis,
    });
    el = el.parentElement;
    depth++;
  }
  return { found: true, chain };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: "/Users/armanisadeghi/code/matrx-frontend/.scratch/header.png" });
await browser.close();

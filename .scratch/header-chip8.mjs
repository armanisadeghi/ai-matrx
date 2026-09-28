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
      if (await form.count()) { await Promise.all([page.waitForNavigation({ waitUntil: "load", timeout: 60000 }).catch(() => {}), form.click()]); await page.waitForTimeout(1200); }
      else { await page.waitForTimeout(3000); await page.reload({ waitUntil: "load", timeout: 60000 }).catch(() => {}); }
    } else return true;
  }
  return false;
}
await page.goto(LOGIN_URL, { waitUntil: "load", timeout: 90000 }).catch(e=>console.log(e.message));
await resumeIfParked();
await page.goto(`${BASE}/education/classes/agent-test-chemistry`, { waitUntil: "load", timeout: 90000 }).catch(e=>console.log(e.message));
await resumeIfParked();
await page.waitForTimeout(6000);

const info = await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="Show sidebar"]');
  if (!btn) return { found: false };
  const r = btn.getBoundingClientRect();
  const cx = r.x + r.width/2, cy = r.y + r.height/2;
  const topEl = document.elementFromPoint(cx, cy);
  const chain = [];
  let el = topEl, depth=0;
  while (el && depth<10) {
    const rr = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    chain.push({tag: el.tagName, cls: (el.className||'').toString().slice(0,150), rect:{x:rr.x,y:rr.y,w:rr.width,h:rr.height}, position: cs.position, zIndex: cs.zIndex, pointerEvents: cs.pointerEvents});
    el = el.parentElement; depth++;
  }
  return { found: true, btnRect: {x:r.x,y:r.y,w:r.width,h:r.height}, topElAtBtnCenter: chain[0], chain };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();

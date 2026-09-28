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
await page.goto(LOGIN_URL, { waitUntil: "load", timeout: 90000 }).catch(e=>console.log(e.message));
await resumeIfParked();
await page.goto(`${BASE}/education/classes/agent-test-chemistry`, { waitUntil: "load", timeout: 90000 }).catch(e=>console.log(e.message));
await resumeIfParked();
await page.waitForTimeout(6000);

const info = await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="Choose an organization"], button[aria-label^="Organization:"]');
  const out = { btnChain: [], overlayChain: [] };
  let el = btn, depth=0;
  while (el && depth<12) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    out.btnChain.push({tag:el.tagName, cls:(el.className||'').toString().slice(0,100), rect:{x:r.x,y:r.y,w:r.width,h:r.height}, position:cs.position, zIndex:cs.zIndex, transform:cs.transform!=='none'});
    el = el.parentElement; depth++;
  }
  const overlay = document.elementFromPoint(131+50, 854+18);
  el = overlay; depth=0;
  while (el && depth<12) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    out.overlayChain.push({tag:el.tagName, cls:(el.className||'').toString().slice(0,100), rect:{x:r.x,y:r.y,w:r.width,h:r.height}, position:cs.position, zIndex:cs.zIndex, transform:cs.transform!=='none'});
    el = el.parentElement; depth++;
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();

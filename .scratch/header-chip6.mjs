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
  const panels = [...document.querySelectorAll('[data-side-panel]')].map(el => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { id: el.getAttribute('data-side-panel'), state: el.getAttribute('data-state'), inert: el.hasAttribute('inert'),
      rect: {x:r.x,y:r.y,w:r.width,h:r.height}, position: cs.position, zIndex: cs.zIndex };
  });
  const orgBtn = document.querySelector('.canvas-user-menu-root')?.parentElement?.querySelector('button[aria-label*="rganization"]')
    ?? [...document.querySelectorAll('button')].find(b => /choose an organization/i.test(b.getAttribute('aria-label')||'') && b.closest('[data-side-panel]'));
  let orgInfo = null;
  if (orgBtn) {
    const r = orgBtn.getBoundingClientRect();
    orgInfo = { rect: {x:r.x,y:r.y,w:r.width,h:r.height}, closestSidePanel: orgBtn.closest('[data-side-panel]')?.getAttribute('data-side-panel') };
  }
  return { panels, orgInfo, url: location.href };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();

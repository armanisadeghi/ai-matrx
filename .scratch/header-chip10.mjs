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
await page.waitForTimeout(5000);

// Hover the LIVE (non-inert) toggle to trigger the overlay preview.
const hoverResult = await page.evaluate(() => {
  const all = [...document.querySelectorAll('[data-canvas-nav-toggle]')];
  const live = all.find(b => !b.closest('[inert]'));
  if (!live) return { ok: false, count: all.length };
  const r = live.getBoundingClientRect();
  return { ok: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
});
console.log("toggle icon (data-canvas-nav-toggle):", hoverResult);
if (hoverResult.ok) {
  const cx = hoverResult.rect.x + hoverResult.rect.w/2, cy = hoverResult.rect.y + hoverResult.rect.h/2;
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => {
    const p = document.querySelector('[data-side-panel="canvas-nav"]');
    return p ? { state: p.getAttribute('data-state'), inert: p.hasAttribute('inert'), rect: p.getBoundingClientRect(), cls: p.className } : null;
  });
  console.log("canvas-nav panel while hovering toggle:", state);

  if (state && !state.inert) {
    const orgBtn = page.locator('[data-side-panel="canvas-nav"] button[aria-label="Choose an organization"], [data-side-panel="canvas-nav"] button[aria-label^="Organization:"]').first();
    const box = await orgBtn.boundingBox();
    console.log("org box during hover overlay:", box);
    if (box) {
      const ocx = box.x + box.width/2, ocy = box.y + box.height/2;
      // Move mouse toward the org button WITHOUT leaving the nav overlay area, to keep hover open.
      await page.mouse.move((cx+ocx)/2, (cy+ocy)/2, { steps: 5 });
      await page.mouse.move(ocx, ocy, { steps: 5 });
      await page.waitForTimeout(300);
      const hit = await page.evaluate(({ocx,ocy}) => {
        const el = document.elementFromPoint(ocx, ocy);
        return el ? { tag: el.tagName, cls: (el.className||'').toString().slice(0,150) } : null;
      }, {ocx, ocy});
      console.log("elementFromPoint at org button during hover-overlay:", hit);
      await page.mouse.down(); await page.mouse.up();
      await page.waitForTimeout(500);
      const popoverCount = await page.locator('[role="dialog"], [data-radix-popper-content-wrapper], [data-slot="popover-content"]').count();
      console.log("popovers after mouse click during hover-overlay:", popoverCount);
    }
  }
}
await browser.close();

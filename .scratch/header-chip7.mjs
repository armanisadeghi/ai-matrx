import { chromium } from "playwright-core";
const BASE = process.env.BASE || "http://wave4b-adversarial.localhost:3001";
const LOGIN_URL = process.env.LOGIN_URL;
const ROUTES = ["/education/classes/agent-test-chemistry", "/education/overview"];
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

for (const route of ROUTES) {
  console.log(`\n=== ${route} ===`);
  await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 90000 }).catch(e=>console.log(e.message));
  await resumeIfParked();
  await page.waitForTimeout(5000);

  // Open the collapsed nav via its toggle ("Show sidebar").
  const toggle = page.locator('button[aria-label="Show sidebar"]').first();
  const toggleCount = await toggle.count();
  console.log("toggle count:", toggleCount);
  if (toggleCount) {
    await toggle.click({ timeout: 5000 }).catch(e => console.log("[toggle click threw]", e.message.split("\n")[0]));
    await page.waitForTimeout(1000);
  }

  const state = await page.evaluate(() => {
    const p = document.querySelector('[data-side-panel="canvas-nav"]');
    return p ? { state: p.getAttribute('data-state'), inert: p.hasAttribute('inert'), rect: p.getBoundingClientRect() } : null;
  });
  console.log("canvas-nav panel after toggle:", state);

  const orgBtn = page.locator('[data-side-panel="canvas-nav"] button[aria-label*="rganization" i]').first();
  const orgCount = await orgBtn.count();
  console.log("org button in nav panel:", orgCount);
  if (orgCount) {
    const box = await orgBtn.boundingBox();
    console.log("box:", box);
    if (box) {
      const cx = box.x + box.width/2, cy = box.y + box.height/2;
      const hit = await page.evaluate(({cx,cy}) => {
        const el = document.elementFromPoint(cx, cy);
        return el ? { tag: el.tagName, cls: (el.className||'').toString().slice(0,150) } : null;
      }, {cx, cy});
      console.log("elementFromPoint at org button center:", hit);
    }
    let worked = false;
    try { await orgBtn.click({ timeout: 4000 }); worked = true; } catch (e) { console.log("[org click threw]", e.message.split("\n")[0]); }
    await page.waitForTimeout(500);
    const popoverCount = await page.locator('[role="dialog"], [data-radix-popper-content-wrapper], [data-slot="popover-content"]').count();
    console.log("orgClickWorked:", worked, "popovers after:", popoverCount);
  }
}
await browser.close();

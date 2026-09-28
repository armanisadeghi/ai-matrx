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
      if (await form.count()) {
        await Promise.all([page.waitForNavigation({ waitUntil: "load", timeout: 60000 }).catch(() => {}), form.click()]);
        await page.waitForTimeout(1200);
      } else { await page.waitForTimeout(3000); await page.reload({ waitUntil: "load", timeout: 60000 }).catch(() => {}); }
    } else return true;
  }
  return false;
}
async function gotoOnce(url) {
  try { await page.goto(url, { waitUntil: "load", timeout: 90000 }); return true; }
  catch (e) { console.log("goto failed:", e.message.split("\n")[0]); return false; }
}

await gotoOnce(LOGIN_URL);
await resumeIfParked();

for (const route of ROUTES) {
  console.log(`\n=== ${route} ===`);
  if (!(await gotoOnce(`${BASE}${route}`))) { console.log("retry route nav"); await gotoOnce(`${BASE}${route}`); }
  await resumeIfParked();
  await page.waitForTimeout(6000);

  // CanvasOrgDropUp — the foot-of-nav org control (the real header workspace chip on education pages
  // since .shell-header is display:none in the signed-in canvas workspace layout).
  const btn = page.locator('button[aria-label="Choose an organization"], button[aria-label^="Organization:"]').last();
  const count = await btn.count();
  console.log("CanvasOrgDropUp button count:", count);
  if (!count) { console.log("NOT FOUND at all"); continue; }
  const box = await btn.boundingBox();
  console.log("box:", box);
  if (box) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const hit = await page.evaluate(({ cx, cy }) => {
      const el = document.elementFromPoint(cx, cy);
      if (!el) return null;
      return { tag: el.tagName, cls: (el.className||'').toString().slice(0,200), pointerEvents: getComputedStyle(el).pointerEvents, zIndex: getComputedStyle(el).zIndex };
    }, { cx, cy });
    console.log("elementFromPoint at center:", hit);
  }
  let clickWorked = false;
  try { await btn.click({ timeout: 4000 }); clickWorked = true; } catch (e) { console.log("[click threw]", e.message.split("\n")[0]); }
  await page.waitForTimeout(500);
  const popoverCount = await page.locator('[role="dialog"], [data-radix-popper-content-wrapper], [data-slot="popover-content"]').count();
  console.log("clickWorked:", clickWorked, "popover elements after:", popoverCount);
}
await browser.close();

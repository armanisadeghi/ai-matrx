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
        await Promise.all([
          page.waitForNavigation({ waitUntil: "load", timeout: 60000 }).catch(() => {}),
          form.click(),
        ]);
        await page.waitForTimeout(1200);
      } else {
        await page.waitForTimeout(3000);
        await page.reload({ waitUntil: "load", timeout: 60000 }).catch(() => {});
      }
    } else return true;
  }
  return false;
}

async function gotoWithRetry(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 90000 });
      return true;
    } catch (e) {
      console.log(`goto attempt ${i} failed:`, e.message.split("\n")[0]);
      await page.waitForTimeout(3000);
    }
  }
  return false;
}

await gotoWithRetry(LOGIN_URL);
await resumeIfParked();

for (const route of ROUTES) {
  console.log(`\n=== ${route} ===`);
  const ok = await gotoWithRetry(`${BASE}${route}`);
  if (!ok) { console.log("skip route, could not load"); continue; }
  await resumeIfParked();
  await page.waitForTimeout(4000);

  const btn = page.locator('button[aria-label*="organization" i], button[title*="organization" i]').first();
  const count = await btn.count();
  console.log("button found:", count);
  if (!count) continue;

  const box = await btn.boundingBox();
  console.log("box:", box);

  let pwClickWorked = false;
  try {
    await btn.click({ timeout: 3000 });
    await page.waitForTimeout(500);
    pwClickWorked = true;
  } catch (e) {
    console.log("[page.click threw]", e.message.split("\n")[0]);
  }
  const popoverAfterPwClick = await page.locator('[role="dialog"], [data-radix-popper-content-wrapper]').count();
  console.log("pwClickWorked:", pwClickWorked, "popover-ish elements after:", popoverAfterPwClick);

  await page.keyboard.press("Escape").catch(() => {});
  await gotoWithRetry(`${BASE}${route}`);
  await resumeIfParked();
  await page.waitForTimeout(4000);

  const btn2 = page.locator('button[aria-label*="organization" i], button[title*="organization" i]').first();
  const box2 = await btn2.boundingBox();
  if (box2) {
    const cx = box2.x + box2.width / 2;
    const cy = box2.y + box2.height / 2;
    const hit = await page.evaluate(({ cx, cy }) => {
      const el = document.elementFromPoint(cx, cy);
      if (!el) return null;
      return {
        tag: el.tagName,
        cls: el.className?.toString().slice(0, 200),
        id: el.id,
        pointerEvents: getComputedStyle(el).pointerEvents,
        zIndex: getComputedStyle(el).zIndex,
      };
    }, { cx, cy });
    console.log("elementFromPoint at button center:", hit);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(600);
    const popoverAfterCoordClick = await page.locator('[role="dialog"], [data-radix-popper-content-wrapper]').count();
    console.log("popover-ish elements after coord click:", popoverAfterCoordClick);
  }
}

await browser.close();

import { chromium } from "playwright";
import { signIn, until, sleep } from "../lib/seat-browser.mjs";
const ORIGIN = "http://sharemine.localhost:3001", TABLE = process.env.TABLE, OUT = process.env.OUT;
const b = await chromium.launch({ headless: true });
try {
  for (const w of [1600, 390]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 1000 } });
    const p = await ctx.newPage();
    console.log("signed in as", await signIn(p, ORIGIN, "admin@admin.com", process.env.AI_ADMIN_PASSWORD, "admin"));
    await p.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 300000 });
    const found = await until("Share", async () => {
      const s = p.locator('button:has-text("Share"), [aria-label="Share"]');
      for (let i = 0; i < (await s.count()); i += 1) { const x = s.nth(i); if (await x.isVisible().catch(() => false)) { await x.click(); return true; } }
      return false; }, 240000);
    if (!found.v) { await p.screenshot({ path: `${OUT}/noshare-${w}.png` }); console.log(await p.evaluate(() => document.body.innerText.slice(0, 600))); throw new Error("no Share"); }
    await until("lane", () => p.evaluate(() => !!document.querySelector("[data-who-can-see]")), 120000);
    await sleep(1500);
    const r = await p.evaluate(() => ({
      mine: document.querySelector('[data-lane-choice="mine"]')?.textContent,
      hint: !!document.querySelector('[aria-label="About Only me"]'),
      lock: document.querySelector("[data-who-can-see]")?.textContent.includes("Only people I share it with"),
      nested: !!document.querySelector('[data-lane-choice] button'),
    }));
    await p.hover('[aria-label="About Only me"]').catch(() => {});
    await sleep(800);
    const tip = await p.evaluate(() => document.querySelector('[role="tooltip"]')?.textContent ?? null);
    console.log(w, JSON.stringify({ ...r, tip }));
    await p.screenshot({ path: `${OUT}/share-${w}.png` });
    await ctx.close();
  }
} finally { await b.close(); }

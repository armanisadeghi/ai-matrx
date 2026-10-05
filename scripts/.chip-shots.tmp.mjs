// Temporary (scratch) — headless shots for the chip migration; deleted after use.
import { chromium } from "playwright";
import { signIn } from "./lib/seat-browser.mjs";
const ORIGIN = process.env.ORIGIN ?? "http://sdf87ea8d.localhost:3001";
const OUT = process.env.OUT;
const TAG = process.env.TAG ?? "after";
const ROUTES = JSON.parse(process.env.ROUTES);
const NEEDS_LOGIN = ORIGIN.includes("localhost");
const browser = await chromium.launch({ headless: true });
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });
  await ctx.addInitScript((s) => { try { localStorage.setItem("theme", s); } catch {} }, scheme);
  const page = await ctx.newPage();
  if (NEEDS_LOGIN) await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD);
  for (const [name, route, selector] of ROUTES) {
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
      try {
        await page.goto(ORIGIN + route, { waitUntil: "domcontentloaded", timeout: 180000 });
        if (selector) await page.waitForSelector(selector, { timeout: 90000 }).catch(() => console.log("no selector", name, width));
        await page.waitForTimeout(4000);
        const el = selector ? page.locator(selector).first() : null;
        if (el && (await el.count())) await el.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(800);
        const file = `${OUT}/${name}-${TAG}-${width}-${scheme}.png`;
        if (el && (await el.count()) && process.env.CLIP) {
          const box = await el.boundingBox();
          const sec = await el.evaluate((n) => { const s = n.closest("section") ?? n.parentElement; const r = s.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
          await page.screenshot({ path: file, clip: { x: 0, y: Math.max(0, sec.y - 10), width, height: Math.min(sec.h + 20, 1400) }, fullPage: true }).catch(async () => page.screenshot({ path: file }));
        } else await page.screenshot({ path: file });
        console.log("shot", file);
      } catch (e) { console.log("FAIL", name, width, scheme, String(e).slice(0, 200)); }
    }
  }
  await ctx.close();
}
await browser.close();

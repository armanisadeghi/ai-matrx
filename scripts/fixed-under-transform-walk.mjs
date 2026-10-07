// FIXED-UNDER-TRANSFORM WALK — headless, read-only, seat admin@admin.com (from .env.local, never printed).
// For each route at 375px: lists every position:fixed element that has an ancestor which is its containing block
// (transform / translate / scale / rotate / perspective / filter / backdrop-filter / will-change transform / contain paint|layout),
// and measures layout shift. Usage: WALK_ORIGIN=<your host> node scripts/fixed-under-transform-walk.mjs "/a,/b"
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, sleep } from "./lib/seat-browser.mjs";
const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const ORIGIN = process.env.WALK_ORIGIN;
const ROUTES = (process.argv[2] ?? "/").split(",");
function inPage() {
  const out = [];
  const creates = (cs) => {
    const w = [];
    if (cs.transform !== "none") w.push("transform");
    if (cs.translate && cs.translate !== "none") w.push("translate");
    if (cs.scale && cs.scale !== "none") w.push("scale");
    if (cs.rotate && cs.rotate !== "none") w.push("rotate");
    if (cs.perspective !== "none") w.push("perspective");
    if (cs.filter !== "none") w.push("filter");
    if ((cs.backdropFilter && cs.backdropFilter !== "none") || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== "none")) w.push("backdrop-filter");
    if (/transform|perspective|filter/.test(cs.willChange)) w.push("will-change");
    if (/paint|layout|strict|content/.test(cs.contain)) w.push("contain");
    return w;
  };
  const desc = (e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + String(e.className?.baseVal ?? e.className).split(/\s+/).slice(0, 6).join(".");
  for (const el of document.querySelectorAll("*")) {
    if (getComputedStyle(el).position !== "fixed") continue;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const w = creates(getComputedStyle(a));
      if (w.length) { out.push({ fixed: desc(el), ancestor: desc(a), why: w, rect: (({ x, y, width, height }) => ({ x, y, width, height }))(el.getBoundingClientRect()) }); break; }
    }
  }
  return out;
}
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
await page.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
for (const r of ROUTES) {
  try {
    await page.goto(ORIGIN + r, { waitUntil: "domcontentloaded", timeout: 120000 });
    await sleep(4500);
    const res = await page.evaluate(inPage);
    const cls = await page.evaluate(() => +window.__cls.toFixed(4));
    console.log(JSON.stringify({ route: r, cls, final: new URL(page.url()).pathname, hits: res }));
  } catch (e) { console.log(JSON.stringify({ route: r, error: String(e).slice(0, 120) })); }
}
await browser.close();

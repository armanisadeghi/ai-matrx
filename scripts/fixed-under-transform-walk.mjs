// FIXED-UNDER-TRANSFORM WALK — headless, read-only, seat admin@admin.com (from .env.local, never printed).
// For each route at 375px: lists every position:fixed element that has an ancestor which is its containing block
// (transform / translate / scale / rotate / perspective / filter / backdrop-filter / will-change transform / contain paint|layout),
// and measures layout shift. Usage: WALK_ORIGIN=<your host> node scripts/fixed-under-transform-walk.mjs "/a,/b"
//
// CLS BUDGET GUARD (exit code 1 when any route's CLS is over the budget; 0.1 is the "good" line):
//   WALK_ORIGIN=http://localhost:3001 WALK_BUDGET=0.1 node scripts/fixed-under-transform-walk.mjs "/tasks,/approvals,/podcast,/schedules,/projects,/meetings,/transcripts"
// Knobs (all optional): WALK_BUDGET (no budget = report only), WALK_WIDTHS="375,1440" (default 375),
// WALK_RUNS=3 (fresh page per run, the WORST run is judged), WALK_CPU=4 (CPU slowdown factor, default 1),
// WALK_WARM=0 (skip the unmeasured warm-up visit that absorbs a dev server's first-hit compile),
// WALK_SOURCES=1 (print each shifting node: selector, value, before/after rect).
// Same thing with the standard 17-route list, both widths, 3 runs, CPU x4:  pnpm check:cls
// Measure only while `uptime` 1-minute load is under 60 - a busy machine inflates CLS.
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
const WIDTHS = (process.env.WALK_WIDTHS ?? "375").split(",").map(Number);
const RUNS = Number(process.env.WALK_RUNS ?? 1);
const CPU = Number(process.env.WALK_CPU ?? 1);
const BUDGET = process.env.WALK_BUDGET ? Number(process.env.WALK_BUDGET) : null;
const SOURCES = process.env.WALK_SOURCES === "1";
const OBSERVER = () => {
  window.__cls = 0; window.__shifts = [];
  const d = (e) => e ? e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + String(e.className?.baseVal ?? e.className).split(/\s+/).slice(0, 4).join(".") : "?";
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) {
    window.__cls += e.value;
    window.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: (e.sources ?? []).map((s) => ({ n: d(s.node), from: [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round), to: [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round) })) });
  } }).observe({ type: "layout-shift", buffered: true });
};
const browser = await chromium.launch({ headless: true });
let over = 0;
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 812 : 900 }, hasTouch: width < 600, isMobile: width < 600 });
  const page = await ctx.newPage();
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.addInitScript(OBSERVER);
  if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU }); }
  for (const r of ROUTES) {
    const runs = [];
    // A dev server compiles a route on its first hit, and that cold load paints a different (slower, shifting)
    // page than anyone gets afterwards: one unmeasured visit first. WALK_WARM=0 measures the cold load instead.
    if (process.env.WALK_WARM !== "0") { try { await page.goto(ORIGIN + r, { waitUntil: "domcontentloaded", timeout: 120000 }); await sleep(2500); } catch {} }
    for (let i = 0; i < RUNS; i++) {
      try {
        await page.goto(ORIGIN + r, { waitUntil: "domcontentloaded", timeout: 120000 });
        await sleep(4500);
        const hits = i === 0 && width === WIDTHS[0] ? await page.evaluate(inPage) : [];
        const cls = await page.evaluate(() => +window.__cls.toFixed(4));
        const shifts = SOURCES ? await page.evaluate(() => window.__shifts) : undefined;
        runs.push({ cls, hits, shifts, final: new URL(page.url()).pathname });
      } catch (e) { runs.push({ error: String(e).slice(0, 120) }); }
    }
    const worst = Math.max(0, ...runs.map((x) => x.cls ?? 0));
    if (BUDGET !== null && (worst > BUDGET || runs.some((x) => x.error))) over++;
    console.log(JSON.stringify({ route: r, width, cls: worst, runs: runs.map((x) => x.cls ?? x.error), final: runs[0]?.final, hits: runs[0]?.hits, shifts: runs.find((x) => x.cls === worst)?.shifts }));
  }
  await ctx.close();
}
await browser.close();
if (BUDGET !== null) { console.log(over ? `CLS BUDGET FAILED: ${over} route/width over ${BUDGET}` : `CLS budget ok (<= ${BUDGET})`); process.exit(over ? 1 : 0); }

// scripts/data-home/ds-row-cost-demo-walk.mjs — LANE DS-ROW-COST (2026-10-01)
//
// The lane-e scroll and keystroke probes (data-home-lane-e-walk.mjs) run against the design-system
// package's OWN demo page `row-cost.html` — the data home's table shape served from package SOURCE
// by the package's Vite demo — so a package change is measured in a real browser BEFORE it is
// published and before any consumer bumps. Nothing signs in; nothing is written.
//
//   (cd ../aidream/apps/shared/design-system && DESIGN_SYSTEM_DEMO_PORT=<port> pnpm demo)
//   DEMO_ORIGIN=http://127.0.0.1:<port> node scripts/data-home/ds-row-cost-demo-walk.mjs
import { chromium } from "playwright";

const ORIGIN = process.env.DEMO_ORIGIN;
const ROWS = process.env.DEMO_ROWS ?? "200";
const RUNS = Number(process.env.DEMO_RUNS ?? 3);
if (!ORIGIN) throw new Error("DEMO_ORIGIN must be set");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = { scroll: [], search: [] };
for (let run = 0; run < RUNS; run += 1) {
  await page.goto(`${ORIGIN}/row-cost.html?rows=${ROWS}`, { waitUntil: "load", timeout: 180000 });
  for (let i = 0; i < 120 && (await page.locator("[data-row-id]").count()) === 0; i++) await sleep(500);
  await sleep(1500);
  results.scroll.push(await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const longTasks = [];
    const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(Math.round(e.duration))));
    po.observe({ type: "longtask", buffered: false });
    const rows = [...document.querySelectorAll("[data-row-id]")].filter((e) => e.getBoundingClientRect().height > 0);
    let el = rows[0];
    while (el && !(el.scrollHeight > el.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    if (!el) return { error: "no scroller" };
    const gaps = []; let last = performance.now(); let running = true;
    const loop = () => { const n = performance.now(); gaps.push(n - last); last = n; if (running) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    for (let i = 0; i < 30; i++) { el.dispatchEvent(new WheelEvent("wheel", { deltaY: 240, bubbles: true })); el.scrollTop += 240; await sleep(50); }
    for (let i = 0; i < 30; i++) { el.scrollTop -= 240; await sleep(50); }
    running = false; po.disconnect();
    const g = gaps.slice(1).sort((a, b) => b - a);
    return { rowsInDom: rows.length, scrollLongTasks: longTasks, worstFrames: g.slice(0, 5).map(Math.round), framesOver32: g.filter((x) => x > 32).length, frames: g.length };
  }));
  const box = page.locator("[data-entity-list-search]");
  for (const word of ["Pallet", "Forklift", "Label", "scanner"]) {
    await box.fill(""); await sleep(800); await box.click();
    for (const ch of word) {
      await page.evaluate(() => {
        const firstIds = () => [...document.querySelectorAll("[data-row-id]")].slice(0, 8).map((e) => e.getAttribute("data-row-id")).join("|");
        const before = firstIds();
        window.__probe = new Promise((resolve) => {
          const input = document.querySelector("[data-entity-list-search]");
          const onInput = () => {
            input.removeEventListener("input", onInput, true);
            const t0 = performance.now();
            const done = (changed) => requestAnimationFrame(() => setTimeout(() => resolve({ ms: performance.now() - t0, changed }), 0));
            const mo = new MutationObserver(() => { if (firstIds() !== before) { mo.disconnect(); clearTimeout(cap); done(true); } });
            mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-row-id"] });
            const cap = setTimeout(() => { mo.disconnect(); resolve({ ms: performance.now() - t0, changed: false }); }, 1500);
          };
          input.addEventListener("input", onInput, true);
        });
      });
      await page.keyboard.type(ch);
      const r = await page.evaluate(() => window.__probe);
      if (r.changed) results.search.push(Math.round(r.ms));
      await sleep(60);
    }
  }
}
const s = [...results.search].sort((a, b) => a - b);
console.log(JSON.stringify({
  origin: ORIGIN,
  scroll: results.scroll.map((r) => ({ over32: r.framesOver32, frames: r.frames, worst: r.worstFrames, longTasks: r.scrollLongTasks, rows: r.rowsInDom })),
  search: { n: s.length, median: s[Math.floor(s.length / 2)], p90: s[Math.floor(s.length * 0.9)], max: s[s.length - 1] },
}));
await browser.close();

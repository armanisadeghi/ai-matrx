// First paint and layout shift (round 29, item 1): load a Spaces page N times and record, per load, when the
// page's text first PAINTS (first `.bn-inline-content` with text that is visible — never `visibility:hidden`)
// and the load's CLS. Loads 1-2, 5-6… are FIRST VISITS on this device: the kept block heights
// (`spaces:blockh:*`) are cleared before it, so only what the page itself stores can hold its geometry.
// Read-only (never types).
//   node features/spaces/__tests__/walk/first-paint.walk.mjs <pageId> <loads> [width...]
//   MEMBER=1 signs in as test@test.com. Exit 1 when a load's CLS > 0.01 or its text never paints.
import { open, originOf } from "./lib.mjs";

const id = process.argv[2] ?? "ba289103-9ef2-433a-ae94-0cd9a963ae29";
const loads = Number(process.argv[3] ?? 6);
const widths = (process.argv.slice(4).length ? process.argv.slice(4) : ["1280", "1699"]).map(Number);
const { browser, context, page } = await open({ member: !!process.env.MEMBER, width: widths[0], height: 1000 });
await context.addInitScript(() => {
  if (sessionStorage.getItem("__firstVisit") === "1") {
    for (const k of Object.keys(localStorage)) if (k.startsWith("spaces:blockh:")) localStorage.removeItem(k);
  }
  window.__cls = { total: 0, entries: [] };
  window.__textAt = null;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__cls.total += e.value;
      window.__cls.entries.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: (e.sources ?? []).slice(0, 2).map((s) => ({ ct: (s.node?.closest?.("[data-content-type]") ?? s.node?.querySelector?.("[data-content-type]"))?.getAttribute("data-content-type") ?? String(s.node?.className ?? "").slice(0, 40), txt: (s.node?.textContent ?? "").slice(0, 30), from: [s.previousRect.y, s.previousRect.height].map(Math.round), to: [s.currentRect.y, s.currentRect.height].map(Math.round) })) });
    }
  }).observe({ type: "layout-shift", buffered: true });
  const look = () => {
    if (window.__textAt !== null) return;
    for (const el of document.querySelectorAll(".bn-editor .bn-inline-content")) {
      if (!el.textContent?.trim()) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== "hidden") {
        window.__textAt = Math.round(performance.now());
        return;
      }
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
});
let failed = 0;
const rows = [];
for (let i = 0; i < loads; i++) {
  const w = widths[i % widths.length];
  const first = Math.floor(i / 2) % 2 === 0; // each width gets first visits and return visits
  await page.setViewportSize({ width: w, height: 1000 });
  await page.evaluate((f) => sessionStorage.setItem("__firstVisit", f ? "1" : "0"), first).catch(() => {});
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(Number(process.env.WAIT ?? 10000));
  const r = await page.evaluate(() => ({ cls: window.__cls, textAt: window.__textAt, editorAt: performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd ?? null }));
  const bad = r.cls.total > 0.01 || r.textAt === null;
  if (bad) failed++;
  const row = { load: i + 1, width: w, firstVisit: first, cls: +r.cls.total.toFixed(4), textPaintMs: r.textAt, dclMs: r.editorAt && Math.round(r.editorAt) };
  rows.push(row);
  console.log(JSON.stringify(row));
  if (process.env.VERBOSE || bad) for (const e of r.cls.entries) console.log("   shift", JSON.stringify(e));
}
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
console.log("max CLS", Math.max(...rows.map((r) => r.cls)), failed ? "FAIL" : "PASS");
process.exit(failed ? 1 : 0);

// Layout shift on load (round 26, item 9): CLS of a Spaces page at each width, with the shifted nodes.
// Read-only (never types). Exit 1 when any width measures above 0.01.
//   node features/spaces/__tests__/walk/cls.walk.mjs [pageId] [width...]     (default: admin's sample)
//   ROUTE=/tasks node ... cls.walk.mjs x 1280 1699      (any route instead of /spaces/<pageId>)
//   RUNS=4 loads each width that many times (every load is scored on its own).
import { open, originOf } from "./lib.mjs";

const id = process.argv[2] ?? "ba289103-9ef2-433a-ae94-0cd9a963ae29";
const widths = (process.argv.slice(3).length ? process.argv.slice(3) : ["1280", "1699"]).map(Number);
const { browser, context, page } = await open({ member: !!process.env.MEMBER, width: widths[0], height: 1000 });
await context.addInitScript(() => {
  window.__cls = { total: 0, entries: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__cls.total += e.value;
      const name = (n) => (n ? `${n.tagName}.${String(n.className?.baseVal ?? n.className ?? "").split(" ").filter(Boolean).slice(0, 3).join(".")}` : "?");
      window.__cls.entries.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: (e.sources ?? []).slice(0, 3).map((s) => ({ n: name(s.node), ct: s.node?.querySelector?.("[data-content-type]")?.getAttribute("data-content-type"), txt: (s.node?.textContent ?? "").slice(0, 30), from: [Math.round(s.previousRect.x), Math.round(s.previousRect.y), Math.round(s.previousRect.width), Math.round(s.previousRect.height)], to: [Math.round(s.currentRect.x), Math.round(s.currentRect.y), Math.round(s.currentRect.width), Math.round(s.currentRect.height)] })) });
    }
  }).observe({ type: "layout-shift", buffered: true });
});
let failed = 0;
for (const w of widths.flatMap((x) => Array(Number(process.env.RUNS ?? 1)).fill(x))) {
  await page.setViewportSize({ width: w, height: 1000 });
  await page.goto(`${originOf(page)}${process.env.ROUTE ?? `/spaces/${id}`}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(Number(process.env.WAIT ?? 12000));
  const cls = await page.evaluate(() => window.__cls);
  if (cls.total > 0.01) failed++;
  console.log(JSON.stringify({ width: w, cls: +cls.total.toFixed(4) }));
  if (process.env.VERBOSE) for (const e of cls.entries) console.log("  ", JSON.stringify(e));
}
await browser.close();
process.exit(failed ? 1 : 0);

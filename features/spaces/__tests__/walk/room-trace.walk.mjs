// Room trace (round 28, item 1): load a Spaces page N times and record, per load, CLS, every change the
// Yjs room made to the body's block list after joining (space-collab.ts trace), and the rendered block
// count over time against the stored page's count. Read-only (never types).
//   node features/spaces/__tests__/walk/room-trace.walk.mjs <pageId> <loads> [width...]
//   MEMBER=1 signs in as test@test.com. Exit 1 when any load's CLS > 0.01 or shows fewer blocks than stored.
import { open, originOf } from "./lib.mjs";

const id = process.argv[2] ?? "ba289103-9ef2-433a-ae94-0cd9a963ae29";
const loads = Number(process.argv[3] ?? 6);
const widths = (process.argv.slice(4).length ? process.argv.slice(4) : ["1280"]).map(Number);
const { browser, context, page } = await open({ member: !!process.env.MEMBER, width: widths[0], height: 1000 });
await context.addInitScript(() => {
  window.__spacesCollabTrace = [];
  window.__cls = { total: 0, entries: [] };
  window.__counts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__cls.total += e.value;
      window.__cls.entries.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), txt: (e.sources ?? []).slice(0, 2).map((s) => (s.node?.textContent ?? "").slice(0, 24)) });
    }
  }).observe({ type: "layout-shift", buffered: true });
  let last = -1;
  const tick = () => {
    const n = document.querySelectorAll(".bn-editor .bn-block-outer[data-id]").length;
    if (n !== last) window.__counts.push({ t: Math.round(performance.now()), n });
    last = n;
  };
  setInterval(tick, 100);
});
let failed = 0;
for (let i = 0; i < loads; i++) {
  const w = widths[i % widths.length];
  await page.setViewportSize({ width: w, height: 1000 });
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(Number(process.env.WAIT ?? 12000));
  const r = await page.evaluate(() => ({ cls: window.__cls, trace: window.__spacesCollabTrace, counts: window.__counts }));
  const answer = r.trace.find((e) => e.ev === "joined");
  const stored = answer?.stored ?? null;
  const shown = r.counts.filter((c) => c.n > 0);
  const minShown = shown.length ? Math.min(...shown.slice(shown.findIndex((c) => c.n >= (stored ?? 0))).map((c) => c.n)) : 0;
  const finalShown = shown.at(-1)?.n ?? 0;
  const fewer = stored !== null && (finalShown < stored || (shown.some((c) => c.n >= stored) && minShown < stored));
  const bad = r.cls.total > 0.01 || fewer;
  if (bad) failed++;
  console.log(JSON.stringify({ load: i + 1, width: w, cls: +r.cls.total.toFixed(4), stored, finalShown, minAfterFull: minShown, fewer }));
  if (process.env.VERBOSE || bad) {
    for (const e of r.trace) console.log("   trace", JSON.stringify(e));
    console.log("   counts", JSON.stringify(r.counts));
    for (const e of r.cls.entries) console.log("   shift", JSON.stringify(e));
  }
}
await browser.close();
process.exit(failed ? 1 : 0);

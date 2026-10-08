// Load performance (round 34): how fast a Spaces page and its inline tables appear. Read-only (never types).
// Per load: when the page's first block text paints, when each database block shows its first row, every
// browser data read (requests to the database's REST doors, by name and start time), CLS, and hydration
// warnings from the console.
//   node features/spaces/__tests__/walk/load-perf.walk.mjs <pageId> [loads]
//   MEMBER=1 signs in as test@test.com. WAIT=ms per load (default 15000). VERBOSE=1 lists every read.
import { open, originOf } from "./lib.mjs";

const id = process.argv[2] ?? "ba289103-9ef2-433a-ae94-0cd9a963ae29";
const loads = Number(process.argv[3] ?? 2);
const { browser, context, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
await context.addInitScript(() => {
  window.__cls = 0;
  window.__textAt = null;
  window.__titleAt = null;
  window.__rowsAt = {};
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.width > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const look = () => {
    const now = Math.round(performance.now());
    if (window.__titleAt === null) {
      const t = document.querySelector(".spaces-title");
      if (t && t.textContent?.trim() && visible(t)) window.__titleAt = now;
    }
    if (window.__textAt === null) {
      for (const el of document.querySelectorAll(".spaces-content .bn-inline-content")) {
        if (el.textContent?.trim() && visible(el)) {
          window.__textAt = now;
          break;
        }
      }
    }
    document.querySelectorAll('.spaces-content [data-content-type="database"]').forEach((db, i) => {
      if (window.__rowsAt[i] !== undefined) return;
      const row = db.querySelector("[data-matrx-cell-row], tbody tr, [role='row'] + [role='row']");
      if (row && row.textContent?.trim() && visible(row)) window.__rowsAt[i] = now;
    });
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
});
const warnings = [];
page.on("console", (m) => {
  const t = m.text();
  if (/hydrat|did not match|server rendered|Text content does not match/i.test(t)) warnings.push(t.slice(0, 240));
});
let reads = [];
let navStart = 0;
page.on("request", (r) => {
  const u = r.url();
  if (!/\/rest\/v1\//.test(u)) return;
  const name = u.replace(/^.*\/rest\/v1\//, "").split("?")[0];
  reads.push({ at: Date.now() - navStart, name, schema: r.headers()["content-profile"] ?? r.headers()["accept-profile"] ?? "" });
});
const out = [];
for (let i = 0; i < loads; i++) {
  reads = [];
  warnings.length = 0;
  navStart = Date.now();
  const res = await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  const html = await res?.text().catch(() => "");
  await page.waitForTimeout(Number(process.env.WAIT ?? 15000));
  const r = await page.evaluate(() => ({
    cls: window.__cls,
    titleAt: window.__titleAt,
    textAt: window.__textAt,
    rowsAt: window.__rowsAt,
    dbBlocks: document.querySelectorAll('.spaces-content [data-content-type="database"]').length,
    ttfb: Math.round(performance.getEntriesByType("navigation")[0]?.responseStart ?? 0),
  }));
  const rowReads = reads.filter((x) => /record|row|drill|table_page|entit|aggregate|view/i.test(x.name));
  const row = {
    load: i + 1,
    ttfbMs: r.ttfb,
    titleMs: r.titleAt,
    textMs: r.textAt,
    dbBlocks: r.dbBlocks,
    rowsMs: r.rowsAt,
    htmlHasBlockText: /bn-inline-content/.test(html ?? ""),
    dataReads: reads.length,
    rowishReads: rowReads.length,
    cls: +r.cls.toFixed(4),
    hydrationWarnings: warnings.length,
  };
  out.push(row);
  console.log(JSON.stringify(row));
  if (process.env.VERBOSE) for (const x of reads) console.log("   read", x.at, x.schema, x.name);
  else console.log("   rowish", JSON.stringify(rowReads.map((x) => `${x.at}:${x.name}`)));
  for (const w of warnings.slice(0, 3)) console.log("   warn", w);
}
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: false });
await browser.close();

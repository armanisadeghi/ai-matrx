// components/markdown-studio/__fixtures__/stress-bench.mjs
//
// THE BROWSER HALF of the rich-content stress guard (the Jest half is
// `../__tests__/stress-budget.test.tsx`). One headless Chromium drives the
// Markdown Studio on the shared dev server with the stress corpus and FAILS
// (exit 1) when a budget is broken. Built 2026-09-26 after the markdown
// tester crashed Arman's browser: pre-fix, 20 keystrokes into a 1 MB document
// ran 256 s, grew the heap to 1.77 GB and 599,667 DOM nodes, and the page
// died ("Execution context was destroyed").
//
// Run (dev server up via `pnpm preview:start`):
//   npx tsx components/markdown-studio/__fixtures__/write-stress-corpus.ts <dir>
//   node components/markdown-studio/__fixtures__/stress-bench.mjs "$(pnpm -s dev-login /markdown-studio | sed -n 's/.*OPEN   : //p')" <dir>
//
// Budgets (dev build, so a production build has headroom):
//   KEY_100KB   typing into the 100 KB report: p75 key-to-paint latency
//   KEY_1MB     typing into the 1 MB document: the same, and the page survives
//   RENDER_5MB  pasting 5 MB: the page survives and no single task blocks longer
//   REPLAY_HEAP three stream replays: no retained heap growth after the first

import { chromium } from "playwright";
import { readFileSync } from "node:fs";

export const BUDGETS = {
  KEY_100KB_MS_PER_KEY: 50,
  KEY_1MB_MS_PER_KEY: 50,
  // Measured 1,580 ms once diagrams draw only near the viewport (8,697 ms when
  // every one of ~50 drew on paste). Budget keeps ~1 s of headroom for load.
  RENDER_5MB_MAX_TASK_MS: 2500,
  // Measured 517 MB (a fully mounted 5 MB document grew past 2 GB).
  RENDER_5MB_HEAP_MB: 700,
  // 46 diagrams across 1 MB: the longest main-thread stall in the 30 s after
  // the paste (a 50 ms setInterval gap monitor — the verifier's method).
  // Before c71082a03a: 38-75 s.
  DIAGRAMS_1MB_MAX_STALL_MS: 3000,
  REPLAY_HEAP_GROWTH_MB: 30,
};

const [loginUrl, dir] = process.argv.slice(2);
if (!loginUrl || !dir) {
  console.error("usage: stress-bench.mjs <dev-login url for /markdown-studio> <fixture dir>");
  process.exit(2);
}
const origin = new URL(loginUrl).origin;
const failures = [];
const report = {};

const browser = await chromium.launch({ headless: true, args: ["--enable-precise-memory-info"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let page;
let cdp;
let crashed = false;
let signedIn = false;

async function open() {
  page = await ctx.newPage();
  crashed = false;
  page.on("crash", () => (crashed = true));
  cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (!signedIn) {
    // The single-use dev-login nonce signs admin@admin.com into this context.
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
    signedIn = true;
  }
  await page.goto(origin + "/markdown-studio", { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector(".cm-content", { timeout: 180000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    window.__lt = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lt.push(e.duration);
    }).observe({ type: "longtask" });
  });
}
const lt = () =>
  page.evaluate(() => {
    const a = window.__lt || [];
    window.__lt = [];
    return { total: Math.round(a.reduce((s, x) => s + x, 0)), max: Math.round(Math.max(0, ...a)) };
  });
async function heapMB(gc = false) {
  if (gc) await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const { metrics } = await cdp.send("Performance.getMetrics");
  return +(metrics.find((m) => m.name === "JSHeapUsedSize").value / 1048576).toFixed(1);
}
/** Quiet = no new long task AND no newly mounted block for 5 s (huge documents mount in slices). */
async function settle(maxMs = 300000) {
  const t0 = Date.now();
  let last = "";
  let since = Date.now();
  while (Date.now() - t0 < maxMs) {
    const sig = await page
      .evaluate(() => `${(window.__lt || []).length}:${document.querySelectorAll("[data-mtx-ctx]").length}`)
      .catch(() => "dead");
    if (sig === "dead") return false;
    if (sig !== last) {
      last = sig;
      since = Date.now();
    }
    if (Date.now() - since > 5000) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
async function paste(name) {
  const text = readFileSync(`${dir}/${name}.md`, "utf8");
  // The studio's source IS the rich editor's Source view (CodeMirror 6).
  await page.evaluate((t) => {
    const v = document.querySelector(".cm-content").cmTile.view;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } });
  }, text);
  return settle();
}
/** Per-keystroke INTERACTION latency (Event Timing: key press → next paint). */
async function typeAtEnd(keys) {
  await page.evaluate(() => {
    window.__ev = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__ev.push({ id: e.interactionId, d: e.duration });
    }).observe({ type: "event", durationThreshold: 16 });
    const v = document.querySelector(".cm-content").cmTile.view;
    v.focus();
    v.dispatch({ selection: { anchor: v.state.doc.length }, scrollIntoView: true });
  });
  const t0 = Date.now();
  for (let k = 0; k < keys; k++) {
    await page.keyboard.type("x");
    await page.waitForTimeout(150);
  }
  const alive = await settle(300000);
  const ev = await page.evaluate(() => window.__ev || []).catch(() => []);
  const byId = new Map();
  for (const e of ev) if (e.id) byId.set(e.id, Math.max(byId.get(e.id) || 0, e.d));
  const ds = [...byId.values()].sort((a, b) => a - b);
  // Keys under 16 ms never produce an entry: count them as 16.
  while (ds.length < keys) ds.unshift(16);
  const p75 = Math.round(ds[Math.floor(0.75 * (ds.length - 1))]);
  return { alive, wallMs: Date.now() - t0, p75KeyMs: p75, maxKeyMs: Math.round(ds[ds.length - 1]) };
}

// 1. Typing into the 100 KB report.
await open();
await paste("technical-report");
report.key100kb = await typeAtEnd(20);
if (!report.key100kb.alive || report.key100kb.p75KeyMs > BUDGETS.KEY_100KB_MS_PER_KEY)
  failures.push(`100 KB typing: p75 ${report.key100kb.p75KeyMs} ms/key (budget ${BUDGETS.KEY_100KB_MS_PER_KEY})`);

// 2. Typing into the 1 MB document.
await page.close();
await open();
await paste("mega-1mb");
report.key1mb = await typeAtEnd(20);
if (crashed || !report.key1mb.alive || report.key1mb.p75KeyMs > BUDGETS.KEY_1MB_MS_PER_KEY)
  failures.push(`1 MB typing: p75 ${report.key1mb.p75KeyMs} ms/key, alive=${report.key1mb.alive} (budget ${BUDGETS.KEY_1MB_MS_PER_KEY})`);

// 3. Pasting 5 MB.
await page.close();
await open();
await lt();
const t5 = Date.now();
const alive5 = await paste("mega-5mb");
const tasks5 = await lt();
report.render5mb = { alive: alive5 && !crashed, wallMs: Date.now() - t5, maxTaskMs: tasks5.max, heapMB: await heapMB() };
if (!report.render5mb.alive || tasks5.max > BUDGETS.RENDER_5MB_MAX_TASK_MS || report.render5mb.heapMB > BUDGETS.RENDER_5MB_HEAP_MB)
  failures.push(`5 MB paste: longest task ${tasks5.max} ms, heap ${report.render5mb.heapMB} MB, alive=${report.render5mb.alive} (budgets ${BUDGETS.RENDER_5MB_MAX_TASK_MS} ms, ${BUDGETS.RENDER_5MB_HEAP_MB} MB)`);

// 3b. 46 diagrams across a 1 MB document (the verifier's shape).
await page.close();
await open();
await page.evaluate(() => {
  window.__gaps = [];
  let last = performance.now();
  window.__gapT = setInterval(() => {
    const n = performance.now();
    const g = n - last - 50;
    if (g > 50) window.__gaps.push(Math.round(g));
    last = n;
  }, 50);
});
await paste("diagrams-46-1mb");
await page.waitForTimeout(30000);
const gaps = await page.evaluate(() => window.__gaps || []).catch(() => [99999]);
report.diagrams1mb = { alive: !crashed, maxStallMs: Math.max(0, ...gaps), totalStallMs: gaps.reduce((a, b) => a + b, 0) };
if (crashed || report.diagrams1mb.maxStallMs > BUDGETS.DIAGRAMS_1MB_MAX_STALL_MS)
  failures.push(`46 diagrams / 1 MB: longest stall ${report.diagrams1mb.maxStallMs} ms (budget ${BUDGETS.DIAGRAMS_1MB_MAX_STALL_MS})`);

// 4. Three stream replays of the 60-code-block answer: no retained growth.
await page.close();
await open();
await paste("ai-answer-60-code-blocks");
const heaps = [];
for (let r = 0; r < 3; r++) {
  await page.locator('button[aria-label="Replay this content as a stream"]').first().click();
  await page.getByRole("button", { name: /Replay as stream/ }).first().click();
  await page.waitForTimeout(500);
  await page.waitForFunction(
    () => ![...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Stop"),
    null,
    { timeout: 600000, polling: 500 },
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
  heaps.push(await heapMB(true));
}
report.replayHeapsMB = heaps;
if (crashed || heaps[2] - heaps[0] > BUDGETS.REPLAY_HEAP_GROWTH_MB)
  failures.push(`stream replay: heap ${heaps.join(" → ")} MB (budget +${BUDGETS.REPLAY_HEAP_GROWTH_MB} MB after the first)`);

await browser.close();
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error("BUDGET FAILURES:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("All stress budgets met.");

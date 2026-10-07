// scripts/cleanings-first-paint-walk.mjs — Cleanings (or any table) layout first paint, live, headless.
// Samples the page each animation frame and prints the sequence of distinct states (skeleton / grid /
// board / calendar / chooser form) with timestamps, the layout shift total, and the store reads that
// decide the layout. The first non-skeleton state must be the final one.
//   node scripts/cleanings-first-paint-walk.mjs [tableId] [runs=3] [?query]
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const tableId = process.argv[2] ?? "ba31d266-b149-48ef-a427-855050c22a38";
const runs = Number(process.argv[3] ?? 3);
const query = process.argv[4] ?? "";
const login = execSync(`pnpm -s dev-login '/data/${tableId}'`, { encoding: "utf8" });
const url = login.match(/OPEN\s*:\s*(\S+)/)?.[1];
if (!url) throw new Error("dev-login gave no URL");
const origin = new URL(url).origin;
const browser = await chromium.launch({ headless: true });
const boot = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const bp = await boot.newPage();
await bp.goto(url, { timeout: 180_000 });
if (bp.url().includes("__dev-walk")) {
  await bp.getByRole("button", { name: "Resume this preview" }).click();
  await bp.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180_000 });
}
await bp.waitForTimeout(4000);
const state = await boot.storageState();
let bad = false;
const finals = [];
for (let i = 0; i < runs; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: state });
  const page = await ctx.newPage();
  const reqs = [];
  page.on("request", (r) => { if (/view|look|layout/i.test(r.url() + (r.postData() ?? ""))) reqs.push(`${Date.now() % 100000} ${r.method()} ${r.url().slice(-90)} ${(r.postData() ?? "").slice(0, 110)}`); });
  await page.addInitScript(() => {
    window.__cls = 0; window.__timeline = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    const t0 = performance.now();
    const probe = () => {
      const d = document;
      const skel = d.querySelector("[data-records-skeleton], [data-records-skeleton-page]") ? "skeleton" : "";
      const th = d.querySelectorAll("table th, [role=columnheader]").length;
      const board = d.querySelector("[data-kanban], [data-board], [data-records-board]") ? "board" : "";
      const chooser = d.querySelector("[data-layout-chooser-compact]") ? "chooser:compact" : d.querySelector("[role=tablist]") ? "chooser:tabs" : "";
      const text = (d.querySelector("main")?.innerText ?? "").slice(0, 400);
      const kanbanText = /\bNo status\b|Unassigned|\bTo do\b/.test(text) ? "kanbanish" : "";
      const key = [skel, th ? `grid(th=${th})` : "", board, kanbanText, chooser, location.search].filter(Boolean).join(" | ") || "blank";
      const last = window.__timeline.at(-1);
      if (!last || last.key !== key) window.__timeline.push({ t: Math.round(performance.now() - t0), key });
      requestAnimationFrame(probe);
    };
    requestAnimationFrame(probe);
  });
  await page.goto(`${origin}/data/${tableId}${query}`, { timeout: 180_000 });
  await page.waitForTimeout(7000);
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}-${i + 1}.png` });
  const r = await page.evaluate(() => ({ cls: window.__cls, timeline: window.__timeline, url: location.pathname + location.search }));
  console.log(`run ${i + 1}: CLS ${r.cls.toFixed(4)} url ${r.url}\n  ` + r.timeline.map((e) => `${e.t}ms ${e.key}`).join("\n  "));
  console.log("  reads:\n    " + reqs.join("\n    "));
  finals.push(r.timeline.at(-1)?.key);
  await ctx.close();
}
await browser.close();

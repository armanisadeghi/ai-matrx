import { chromium } from "playwright";
import { signIn, sleep, until } from "../lib/seat-browser.mjs";
const { WALK_ORIGIN: O, WALK_EMAIL: E, WALK_PASSWORD: P } = process.env;
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  window.__slow = [];
  const wrap = (proto, name) => {
    const f = proto[name];
    proto[name] = function (...a) {
      const t = performance.now();
      const r = f.apply(this, a);
      const d = performance.now() - t;
      if (d > 2) window.__slow.push({ name, d: Math.round(d), stack: (new Error().stack || "").split("\n").slice(2, 5).map((s) => s.trim().slice(0, 140)).join(" | ") });
      return r;
    };
  };
  wrap(Document.prototype, "elementsFromPoint");
  wrap(Element.prototype, "getBoundingClientRect");
  const gcs = window.getComputedStyle;
  window.getComputedStyle = function (...a) { const t = performance.now(); const r = gcs.apply(this, a); const d = performance.now() - t; if (d > 2) window.__slow.push({ name: "gcs", d: Math.round(d), stack: (new Error().stack || "").split("\n").slice(2, 5).map((s) => s.trim().slice(0, 140)).join(" | ") }); return r; };
});
const page = await ctx.newPage();
await signIn(page, O, E, P, "admin");
await page.goto(O + "/agents/all", { waitUntil: "domcontentloaded", timeout: 240000 });
await until("rows", async () => (await page.locator("[data-row-id]:visible").count()) > 0, 180000);
await sleep(4000);
await page.evaluate(() => { window.__slow = []; performance.clearMeasures(); });
const cdp = await ctx.newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
await cdp.send("Profiler.start");
await page.evaluate(async () => {
  const rows = [...document.querySelectorAll("[data-row-id]")].filter((e) => e.getBoundingClientRect().height > 0);
  let el = rows[0];
  while (el && !(el.scrollHeight > el.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
  for (let i = 0; i < 5; i++) { el.scrollTop += 120; await new Promise((r) => setTimeout(r, 50)); }
  await new Promise((r) => setTimeout(r, 600));
});
const { profile } = await cdp.send("Profiler.stop");
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map();
const dt = profile.timeDeltas;
const inPass = new Map();
profile.samples.forEach((id, i) => {
  const d = (dt[i] ?? 0) / 1000;
  const n = byId.get(id);
  const key = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`;
  // is this sample under applyAssistDockLift / pass?
  let cur = id, under = false;
  while (cur) { const f = byId.get(cur).callFrame; if (/pass|applyAssistDockLift/.test(f.functionName) && /assist/i.test(f.url)) { under = true; break; } cur = parent.get(cur); }
  if (under) inPass.set(key, (inPass.get(key) ?? 0) + d);
});
const urls = new Set(profile.nodes.filter((n) => /assist/i.test(n.callFrame.url)).map((n) => n.callFrame.functionName + " @ " + n.callFrame.url.slice(-80)));
console.log([...urls].slice(0, 15).join("\n"));
console.log([...inPass].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(1)}ms ${k}`).join("\n"));
console.log(JSON.stringify(await page.evaluate(() => ({ passes: performance.getEntriesByName("assists-dock:pass").map((e) => Math.round(e.duration)), slot: document.documentElement.getAttribute("data-assist-dock-slot"), slow: window.__slow.slice(0, 12), n: window.__slow.length })), null, 1));
await b.close();

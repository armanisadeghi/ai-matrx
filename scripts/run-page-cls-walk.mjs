// scripts/run-page-cls-walk.mjs — agent run page cold-load layout shift at 1280/1440/1920 (live, headless).
//   node scripts/run-page-cls-walk.mjs [runs=3]
// Prints per-width CLS and the shifted nodes; exits 1 when any run is above 0.01.
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const runs = Number(process.argv[2] ?? 3);
const PATH = "/administration/agents/system-agents/agents/1b941f40-e846-4828-a9cb-4f3da7f19df7/run?conversationId=4b35c598-2794-4274-8b7d-e735beb3476c";
const login = execSync(`pnpm -s dev-login '${PATH}'`, { encoding: "utf8" });
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
await bp.waitForTimeout(5000);
const state = await boot.storageState();
let bad = false;
for (const width of [1280, 1440, 1920]) {
  const out = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, storageState: state });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0; window.__shifts = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) {
        window.__cls += e.value;
        window.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), n: e.sources.map((s) => `${s.node?.nodeName}.${(s.node?.className?.toString?.() ?? "").slice(0, 60)} ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}`) });
      } }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`${origin}${PATH}`, { timeout: 180_000 });
    await page.waitForTimeout(9000);
    out.push(await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts, text: document.body.innerText.length })));
    if (i === 0) { console.log(`  landed ${page.url().slice(0, 120)} textLen=${out[0].text}`); if (width === 1440) await page.screenshot({ path: process.env.CLS_SHOT ?? "/tmp/run-cls.png" }); }
    await ctx.close();
  }
  console.log(`width ${width}: CLS per run = ${out.map((r) => r.cls.toFixed(4)).join(", ")}`);
  const worst = out.reduce((a, b) => (b.cls > a.cls ? b : a));
  if (worst.cls > 0.01) { bad = true; console.log(JSON.stringify(worst.shifts, null, 1)); }
}
await browser.close();
process.exit(bad ? 1 : 0);

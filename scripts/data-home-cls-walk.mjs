// scripts/data-home-cls-walk.mjs — /data home layout shift at 1280 and 900 (live, headless).
// Logs in with dev-login (admin@admin.com), then loads /data fresh per width and prints the sum of
// 'layout-shift' entries without recent input, plus the column headers shown at the end.
//   node scripts/data-home-cls-walk.mjs [runs=3]
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const runs = Number(process.argv[2] ?? 3);
const login = execSync(`pnpm -s dev-login '/data'`, { encoding: "utf8" });
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
await bp.waitForTimeout(3000);
const state = await boot.storageState();
let bad = false;
for (const width of [1280, 900]) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, storageState: state });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0; window.__shifts = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push(+e.value.toFixed(4)); } }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`${origin}/data`, { timeout: 180_000 });
    await page.waitForSelector("table th, [role=columnheader]", { timeout: 120_000 });
    await page.waitForTimeout(4000);
    const r = await page.evaluate(() => ({
      cls: window.__cls, shifts: window.__shifts,
      cols: [...document.querySelectorAll("th, [role=columnheader]")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent.trim()).filter(Boolean),
    }));
    results.push(r);
    await ctx.close();
  }
  console.log(`width ${width}: CLS per run = ${results.map((r) => r.cls.toFixed(4)).join(", ")}; max ${Math.max(...results.map((r) => r.cls)).toFixed(4)}; shifts ${JSON.stringify(results.at(-1).shifts)}; columns ${JSON.stringify(results.at(-1).cols)}`);
  if (Math.max(...results.map((r) => r.cls)) > 0.01) bad = true;
}
await browser.close();
process.exit(bad ? 1 : 0);

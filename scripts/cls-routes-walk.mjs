// scripts/cls-routes-walk.mjs — cold-load layout shift for /data, /messages, /meetings as admin and member (headless).
//   node scripts/cls-routes-walk.mjs [runs=2] [--routes=/data,/messages] [--seats=admin,member] [--max=0.01] [--verbose]
// Signs in through `pnpm dev-login` (never types a password). Prints each shift entry's nodes
// (selector, previousRect, currentRect). Exits 1 when any route/seat run exceeds --max (default 0.01).
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const runs = Number(args.find((a) => /^\d+$/.test(a)) ?? 2);
const routes = opt("routes", "/data,/messages,/meetings").split(",");
const seats = opt("seats", "admin,member").split(",");
const MAX = Number(opt("max", "0.01"));
const verbose = args.includes("--verbose");
const browser = await chromium.launch({ headless: true });
let bad = false;
for (const seat of seats) {
  const login = execSync(`pnpm -s dev-login ${seat === "member" ? "--member " : ""}'/dashboard'`, { encoding: "utf8" });
  const url = login.match(/OPEN\s*:\s*(\S+)/)?.[1];
  if (!url) throw new Error("dev-login gave no URL");
  const origin = new URL(url).origin;
  const boot = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const bp = await boot.newPage();
  await bp.goto(url, { timeout: 180_000 });
  if (bp.url().includes("__dev-walk")) {
    await bp.getByRole("button", { name: "Resume this preview" }).click();
    await bp.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180_000 });
  }
  await bp.waitForTimeout(3000);
  const state = await boot.storageState();
  await boot.close();
  for (const route of routes) {
    const out = [];
    for (let i = 0; i < runs; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        window.__cls = 0; window.__shifts = [];
        const desc = (el) => { const c = []; for (let i = 0; i < 3 && el; i++) { const cls = (el.className?.toString?.() ?? "").trim().split(/\s+/).slice(0, 4).join("."); c.push(`${el.nodeName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""}`); el = el.parentElement; } return c.join(" < "); };
        const r = (x) => `${Math.round(x.x)},${Math.round(x.y)} ${Math.round(x.width)}x${Math.round(x.height)}`;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) {
          window.__cls += e.value;
          window.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), n: e.sources.map((s) => `${desc(s.node)} [${r(s.previousRect)}] -> [${r(s.currentRect)}] "${(s.node?.textContent ?? "").slice(0, 30).replace(/\n/g, " ")}"`) });
        } }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(`${origin}${route}`, { timeout: 240_000 });
      await page.waitForTimeout(9000);
      out.push(await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts, url: location.pathname })));
      await ctx.close();
    }
    console.log(`${seat} ${route}: CLS per run = ${out.map((r) => r.cls.toFixed(4)).join(", ")} (landed ${out[0].url})`);
    const worst = out.reduce((a, b) => (b.cls > a.cls ? b : a));
    if (worst.cls > MAX) bad = true;
    if (worst.cls > MAX || verbose) console.log(JSON.stringify(worst.shifts, null, 1));
  }
}
await browser.close();
process.exit(bad ? 1 : 0);

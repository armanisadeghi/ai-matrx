// scripts/cls-routes-walk.mjs — cold-load layout shift for /data, /messages, /meetings as admin and member (headless).
//   node scripts/cls-routes-walk.mjs [runs=2] [--routes=/data,/messages] [--seats=admin,member] [--widths=390,1024,1440] [--chat=default|open|closed] [--max=0.01] [--nav-runs=5] [--verbose]
// --chat=open|closed seeds the shell chat dock's remembered state (cookies) per route family, as a returning person has it;
// "default" is a first visit with no cookie. Client navigation (e.g. /chat/new to /notes with a real click) is covered by the chat-dock
// instant-on-navigation rule. After the cold loads, a client-navigation case per seat/width opens /chat/new, then clicks the
// real in-app link to /notes with a real mouse click (page.mouse), and measures only the shift that navigation causes.
// Signs in through `pnpm dev-login` (never types a password). Prints each shift entry's nodes
// (selector, previousRect, currentRect). Exits 1 when any route/seat run exceeds --max (default 0.01).
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const runs = Number(args.find((a) => /^\d+$/.test(a)) ?? 2);
const routes = opt("routes", "/data,/messages,/meetings,/agents,/marketing,/notes").split(",");
const seats = opt("seats", "admin,member").split(",");
const widths = opt("widths", "390,1024,1440").split(",").map(Number);
const chatMode = opt("chat", "default");
const MAX = Number(opt("max", "0.01"));
const NAV_RUNS = Number(opt("nav-runs", "5"));
const verbose = args.includes("--verbose");
// A timed load must END on its target. The preview's pause page (/__dev-walk, "Resume this preview") is not the
// target: click Resume, load the target again, and only then count the run. A run that never reaches the target throws,
// which fails the walk (it is never a zero).
async function gotoTarget(page, href) {
  const want = new URL(href).pathname;
  for (let i = 0; i < 4; i++) {
    await page.goto(href, { timeout: 240_000 });
    const paused = page.url().includes("__dev-walk") || (await page.getByText("Resume this preview").count()) > 0;
    if (!paused && new URL(page.url()).pathname.startsWith(want)) return;
    if (paused) {
      await page.getByRole("button", { name: "Resume this preview" }).click({ timeout: 30_000 }).catch(() => {});
      await page.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180_000 }).catch(() => {});
    }
  }
  throw new Error(`never reached ${want} (ended on ${page.url()})`);
}
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
  for (const width of widths) for (const route of routes) {
    const out = [];
    for (let i = 0; i < runs; i++) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, storageState: state });
      if (chatMode !== "default") {
        const host = new URL(origin).hostname;
        const family = (route.split("/").filter(Boolean)[0] ?? "home");
        await ctx.addCookies([
          { name: `canvas-workspace:page:${family}:chat`, value: chatMode === "open" ? "side" : "side:closed", domain: host, path: "/" },
          { name: "side-panel:canvas-chat:width", value: "484", domain: host, path: "/" },
        ]);
      }
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
      // A dev server that recompiles mid-load reloads the page: a run that lost its context is retried.
      for (let attempt = 0; ; attempt++) {
        try {
          await gotoTarget(page, `${origin}${route}`);
          await page.waitForTimeout(9000);
          const r = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts, url: location.pathname, paused: document.body.innerText.includes("Resume this preview") }));
          if (r.paused || r.url.includes("__dev-walk")) throw new Error(`${route} paused mid-run (ended on ${r.url})`);
          out.push(r);
          break;
        } catch (e) {
          if (attempt >= 2) throw e;
        }
      }
      await ctx.close();
    }
    console.log(`${seat} ${width}px ${route}: CLS per run = ${out.map((r) => r.cls.toFixed(4)).join(", ")} (landed ${out[0].url})`);
    const worst = out.reduce((a, b) => (b.cls > a.cls ? b : a));
    if (worst.cls > MAX) bad = true;
    if (worst.cls > MAX || verbose) console.log(JSON.stringify(worst.shifts, null, 1));
  }
}

// Client navigation: /chat/new -> /notes by a real mouse click on the in-app link (no page.goto between).
for (const seat of ["admin", "member"].filter((x) => seats.includes(x))) {
  const login = execSync(`pnpm -s dev-login ${seat === "member" ? "--member " : ""}'/dashboard'`, { encoding: "utf8" });
  const url = login.match(/OPEN\s*:\s*(\S+)/)?.[1];
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
  for (const width of widths.filter((w) => w >= 1024)) {
  const navRuns = [];
  for (let run = 0; run < NAV_RUNS; run++) for (let attempt = 0; attempt < 3; attempt++) try {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, storageState: state });
    const page = await ctx.newPage();
    await gotoTarget(page, `${origin}/chat/new`);
    await page.waitForTimeout(6000);
    await page.evaluate(() => {
      window.__cls = 0; window.__shifts = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) {
        window.__cls += e.value;
        window.__shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), n: e.sources.map((s) => `${s.node?.nodeName ?? "?"} [${Math.round(s.previousRect.x)},${Math.round(s.previousRect.y)} ${Math.round(s.previousRect.width)}x${Math.round(s.previousRect.height)}] -> [${Math.round(s.currentRect.x)},${Math.round(s.currentRect.y)} ${Math.round(s.currentRect.width)}x${Math.round(s.currentRect.height)}] "${(s.node?.textContent ?? "").slice(0, 30).replace(/\n/g, " ")}"`) });
      } }).observe({ type: "layout-shift", buffered: false });
    });
    const link = page.locator('a[href="/notes"]:visible').first();
    await link.waitFor({ state: "attached", timeout: 30_000 }).catch(() => {});
    const box = await link.boundingBox().catch(() => null);
    if (!box) { console.log(`${seat} ${width}px client-nav /chat/new -> /notes: SKIPPED (no visible /notes link; open the nav)`); await ctx.close(); run = NAV_RUNS; break; }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForURL(/\/notes(\?|$)/, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(9000);
    const r = await page.evaluate(() => ({ cls: window.__cls, shifts: window.__shifts, url: location.pathname }));
    navRuns.push(r.cls);
    if (r.url !== "/notes" || r.cls > MAX) bad = true;
    if (r.cls > MAX || verbose) console.log(JSON.stringify(r.shifts, null, 1));
    await ctx.close();
    break;
  } catch (e) {
    // A dev server that recompiles mid-click destroys the page context: retry the case.
    if (attempt >= 2) throw e;
  }
  if (navRuns.length) console.log(`${seat} ${width}px client-nav /chat/new -> /notes: CLS per run = ${navRuns.map((c) => c.toFixed(4)).join(", ")} (every run must be <= ${MAX})`);
  }
}
await browser.close();
process.exit(bad ? 1 : 0);

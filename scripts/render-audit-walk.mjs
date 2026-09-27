// LANE RENDER-AUDIT — headless render census of the record-store table page.
//
// Installs a minimal React DevTools hook before any page script (scripts/lib/render-counter.js),
// signs in as admin@admin.com through the login form (credentials from .env.local, never printed),
// opens /data-v2/<table>, and for each action counts which components rendered and why:
// page load, a cell edit, a realtime patch written by ANOTHER client, opening the Settings rail,
// typing in search, scrolling, a toast. Writes one JSON per run to <outDir>.
//
// Usage: node scripts/render-audit-walk.mjs <outDir> <tableId> <label> [actions=load,edit,realtime,settings,search,scroll,toast]
// The cell edit and the realtime patch write ONE disposable test record the admin account owns
// (a Harbor Dental Group table the admin created); each write puts back the value it found.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { signIn, sleep } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_0-9]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.RA_ORIGIN ?? "http://render-audit.localhost:3001";
const [OUT = "/tmp", TABLE, LABEL = "run", ACTIONS = "load,edit,realtime,settings,search,scroll,toast"] = process.argv.slice(2);
const actions = new Set(ACTIONS.split(","));
mkdirSync(OUT, { recursive: true });
const COUNTER = readFileSync(resolve(ROOT, "scripts/lib/render-counter.js"), "utf8");
const REGIONS = [
  // RA_REGIONS=A,B adds regions nearest-first (lane RENDER-2: TableToolbar, TableHeader, SheetBodyRow …)
  ...(process.env.RA_REGIONS ? process.env.RA_REGIONS.split(",") : []),
  "Toaster",
  "HeaderChooseOrgButton",
  "Header",
  "Sidebar",
  "RouteHeader",
  "EditableTableCell",
  "MatrxDataTableCore",
  "Grid",
  "SheetLayout",
  "TablePage",
  "RecordsMount",
  "UnifiedDataTableRoute",
  "AppShell",
];
const TRACK = process.env.RA_TRACK ?? "^(Header|Sidebar)$";

const report = { table: TABLE, label: LABEL, origin: ORIGIN, at: new Date().toISOString(), phases: [] };
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addInitScript({
    content: `window.__rcRegions = ${JSON.stringify(REGIONS)}; window.__rcTrack = new RegExp(${JSON.stringify(TRACK)}); window.__rcDumpSource = ${process.env.RA_DUMP_SOURCE ? "true" : "false"};\n${COUNTER}`,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => (report.pageErrors ??= []).push(String(e).slice(0, 300)));
  report.seat = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");

  let rpcs = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/rest/v1/")) rpcs.push(u.split("/rest/v1/")[1].split("?")[0]);
  });
  const take = async (label) => {
    const t = await page.evaluate(() => window.__rc.take());
    const err = await page.evaluate(() => window.__rcErr ?? null);
    const top = Object.entries(t.counts)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.n - a.n);
    const reads = {};
    for (const r of rpcs) reads[r] = (reads[r] ?? 0) + 1;
    const ran = top.reduce((s, c) => s + (c.ran ?? 0), 0);
    const phase = { label, commits: t.commits, regions: t.regions, ranRegions: t.ranRegions, total: top.reduce((s, c) => s + c.n, 0), ran, requests: rpcs.length, reads, top, err };
    report.phases.push(phase);
    console.log(`\n== ${label}: ${t.commits} commits, ${phase.total} component renders (${ran} ran)`);
    console.log("   regions:", JSON.stringify(t.regions));
    console.log("   ran by region:", JSON.stringify(t.ranRegions));
    console.log("   requests:", rpcs.length, JSON.stringify(reads).slice(0, 400));
    for (const c of top.slice(0, 25)) console.log(`   ${String(c.n).padStart(5)} ran ${String(c.ran ?? "").padStart(5)}  ${c.name}  ${JSON.stringify(c.reasons).slice(0, 160)}`);
    return phase;
  };
  const mark = (label) => {
    rpcs = [];
    return page.evaluate((l) => window.__rc.mark(l), label);
  };
  const settle = async (ms = 4000) => {
    // quiet: no commits for 1.5s, at most ms
    const start = Date.now();
    let last = -1;
    let still = 0;
    while (Date.now() - start < ms) {
      await sleep(500);
      const c = await page.evaluate(() => window.__rc.take().commits);
      if (c === last) still += 500;
      else still = 0;
      last = c;
      if (still >= 1500) break;
    }
  };

  // ── PAGE LOAD ─────────────────────────────────────────────
  rpcs = [];
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.evaluate(() => window.__rc.mark("load"));
  await page.waitForSelector("table tbody tr td", { timeout: 180000 }).catch(() => undefined);
  await settle(30000);
  await take("load");
  if (process.env.RA_DUMP_SOURCE) writeFileSync(`${OUT}/${LABEL}-sources.json`, JSON.stringify(await page.evaluate(() => window.__rcSrc ?? {}), null, 1));
  await page.screenshot({ path: `${OUT}/${LABEL}-load.png` });
  await mark("idle");
  await sleep(3000);
  await take("idle-3s");

  // ── A CELL EDIT ───────────────────────────────────────────
  if (actions.has("edit")) {
    const cell = page.locator("table tbody tr").first().locator("td").nth(Number(process.env.RA_COL ?? 2));
    await cell.click();
    await sleep(600);
    const before = (await cell.innerText()).trim();
    report.editedCellBefore = before;
    await mark("edit");
    await page.keyboard.press("Enter");
    await sleep(500);
    await page.keyboard.press("End");
    await page.keyboard.type("x");
    await page.keyboard.press("Enter");
    await settle(8000);
    await take("cell-edit");
    await page.screenshot({ path: `${OUT}/${LABEL}-after-edit.png` });
    // put it back
    await cell.click();
    await sleep(400);
    await mark("edit-back");
    await page.keyboard.press("Enter");
    await sleep(500);
    await page.keyboard.press("End");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await settle(8000);
    await take("cell-edit-back");
    report.editedCellAfter = (await cell.innerText()).trim();
  }

  // ── A REALTIME PATCH FROM ANOTHER CLIENT ─────────────────
  if (actions.has("realtime")) {
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const other = createClient(url, key, { auth: { persistSession: false } });
    const signed = await other.auth.signInWithPassword({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD });
    if (signed.error) report.realtimeError = signed.error.message;
    else {
      const rowId = process.env.RA_RT_ROW ?? (await page.evaluate(() => document.querySelector("table tbody tr[data-row-id]")?.getAttribute("data-row-id") ?? null));
      report.realtimeRow = rowId;
      const field = process.env.RA_RT_FIELD ?? null;
      if (rowId && field) {
        const ORG = process.env.RA_ORG;
        const read = await other.schema("custom").rpc("read_record", { p_organization_id: ORG, p_record_id: rowId });
        const doc = Array.isArray(read.data) ? read.data[0] : read.data;
        const was = doc?.data?.[field] ?? doc?.document?.data?.[field] ?? doc?.[field] ?? null;
        report.realtimeRead = read.error ? read.error.message : Object.keys(doc ?? {}).slice(0, 12);
        report.realtimeWas = was;
        await mark("realtime");
        const upd = await other.schema("custom").rpc("record_update", { p_organization_id: ORG, p_record_id: rowId, p_patch: { [field]: `${was ?? ""} ` } });
        report.realtimeUpdate = upd.error ? upd.error.message : "ok";
        await settle(12000);
        await take("realtime-patch");
        await other.schema("custom").rpc("record_update", { p_organization_id: ORG, p_record_id: rowId, p_patch: { [field]: was } });
        await settle(8000);
      }
    }
  }

  // ── OPENING THE SETTINGS RAIL (the table's one menu → Settings) ──
  report.headerButtons = await page.evaluate(() =>
    [...document.querySelectorAll("header button")].map((b) => b.getAttribute("aria-label") || b.textContent.trim().slice(0, 30)),
  );
  if (actions.has("settings")) {
    // Leave whatever the earlier phases left open (an editor, a selection) the way a person would.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.mouse.click(1200, 900);
    await sleep(800);
    const menus = page.getByRole("button", { name: /^table menu$/i });
    const n = await menus.count();
    let opened = false;
    for (let i = n - 1; i >= 0 && !opened; i--) {
      await menus.nth(i).click().catch(() => undefined);
      await sleep(2000);
      const item = page.locator('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]', { hasText: /^Settings$/ }).first();
      if (await item.count()) {
        await mark("settings");
        await item.click();
        opened = true;
      } else await page.keyboard.press("Escape");
    }
    report.settingsOpened = opened;
    report.settingsMenuButtons = n;
    report.settingsItemsSeen = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent.trim().slice(0, 30)));
    if (opened) {
      await settle(10000);
      await take("open-settings-rail");
      await page.screenshot({ path: `${OUT}/${LABEL}-settings.png` });
      await page.keyboard.press("Escape");
      await settle(4000);
    }
  }

  // ── TYPING IN SEARCH ─────────────────────────────────────
  if (actions.has("search")) {
    const box = page.locator("main input[placeholder*='earch'], input[placeholder^='Search table'], input[placeholder^='Search records'], input[placeholder='Search…']").first();
    if (await box.count()) {
      await box.click();
      await mark("search");
      await box.pressSequentially("hyg", { delay: 120 });
      await settle(8000);
      await take("type-search-3-chars");
      await box.fill("");
      await settle(6000);
    } else report.searchMissing = true;
  }

  // ── SCROLLING ─────────────────────────────────────────────
  if (actions.has("scroll")) {
    await page.mouse.move(800, 600);
    await mark("scroll");
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 200);
      await sleep(150);
    }
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -200);
      await sleep(150);
    }
    await settle(4000);
    await take("scroll-12-wheels");
  }

  // ── A TOAST ───────────────────────────────────────────────
  // One the page raises itself: the page-capture menu's plain Copy says "Copied".
  if (actions.has("toast")) {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN }).catch(() => undefined);
    const capture = page.getByRole("button", { name: /copy, transform or export/i }).first();
    report.toastButton = (await capture.count()) ? await capture.getAttribute("aria-label") : null;
    if (await capture.count()) {
      await capture.click();
      await sleep(2000);
      report.toastMenu = await page.evaluate(() =>
        [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent.trim().slice(0, 40)),
      );
      const copy = page.locator("[data-radix-popper-content-wrapper] button", { hasText: /Everything on this page/ }).first();
      await mark("toast");
      if (await copy.count()) await copy.click();
      await settle(6000);
      report.toastSeen = await page.locator("[data-sonner-toast]").count().catch(() => 0);
      await take("toast");
    }
  }
} finally {
  writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(`\nwrote ${OUT}/${LABEL}.json`);

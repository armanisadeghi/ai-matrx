// scripts/drill-table-primitive-walk.mjs — lane DRILL-TABLE-PRIMITIVE (D3 of DRILL-DOWN-DESIGN), the
// owner-seat walk of the table primitive's four drill abilities on a real custom Table.
//
// Signs in through the app's own login form as admin@admin.com (scripts/lib/seat-browser.mjs,
// headless) on the shared preview (live database, read-only here) and walks
// Cedar Ridge Physical Therapy → "Clinic Equipment Log" (46ae8d53…, native, admin's test org):
//
//   PHASE=before  the grid's page-scoped group-by as published before the lane
//   PHASE=after   1 group by Condition (server groups, whole-table counts, a Measure subtotal, total)
//                 2 the group-by menu (Group by / Then by / Across the top) and a second level
//                 3 pivot "Last Serviced by month" across the top
//                 4 the measure picker ("Show")
//                 5 drill on a condition → by Room, the trail; the row menu → See these records
//                 6 the root crumb zooms back out; Back undoes one step
//                 7 390 px and dark
//   Every step records the record_aggregate calls it caused (the store answered the groups).
//
//   ORIGIN=http://drill.localhost:3001 PHASE=after node scripts/drill-table-primitive-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://drill.localhost:3001";
const PHASE = process.env.PHASE ?? "after";
const SHOTS =
  process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-29/drill-table-primitive";
mkdirSync(SHOTS, { recursive: true });
const TABLE = "46ae8d53-4068-4593-9439-fb2b656767f1";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const out = { origin: ORIGIN, phase: PHASE, started: new Date().toISOString(), steps: [], console_errors: [], frictions: [] };
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 500));
};
const friction = (what) => {
  out.frictions.push(what);
  console.log(`  ✗ FRICTION: ${what}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
let counting = false;
let aggregates = [];
page.on("request", (r) => {
  if (r.url().includes("/rpc/record_aggregate")) {
    try {
      aggregates.push(JSON.parse(r.postData() ?? "{}"));
    } catch {
      aggregates.push({});
    }
  }
});
page.on("console", (m) => {
  if (m.type() !== "error" || !counting) return;
  const t = m.text();
  if (/_next\/hmr|WebSocket connection/.test(t)) return;
  out.console_errors.push({ at: page.url().replace(ORIGIN, ""), text: t.slice(0, 300) });
});
page.on("pageerror", (e) => out.console_errors.push({ at: page.url().replace(ORIGIN, ""), text: `PAGEERROR ${String(e).slice(0, 300)}` }));
const shot = (name) => page.screenshot({ path: join(SHOTS, `${PHASE}-${name}.png`) });
const asked = () => {
  const got = aggregates.map((a) => ({ by: a.p_group_by, bucket: a.p_bucket, filter: a.p_filter }));
  aggregates = [];
  return got;
};

async function resumeWalk() {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
  await page
    .evaluate(async () => {
      const body = new FormData();
      body.set("returnTo", "/login");
      await fetch("/__dev-walk", { method: "POST", body, redirect: "manual" });
    })
    .catch(() => {});
}

async function open(query = "", { width = 1600, height = 1000, dark = false } = {}) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
  await page.goto(`${ORIGIN}/data-v2/${TABLE}${query}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  if (page.url().includes("__dev-walk")) {
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(6000);
    await page.goto(`${ORIGIN}/data-v2/${TABLE}${query}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  }
  const ready = await until("the grid", async () => (await page.locator("thead th").count()) > 1, 240000);
  if (!ready.v) throw new Error("the table did not draw");
  await sleep(3000);
}

const groupRows = (level = 0) =>
  page.evaluate(
    (l) => [...document.querySelectorAll(`[data-matrx-drill-level="${l}"]`)].map((r) => r.innerText.replace(/\s+/g, " ").trim()),
    level,
  );
const trail = () => page.evaluate(() => document.querySelector("[data-matrx-drill-trail]")?.innerText.replace(/\s+/g, " ").trim() ?? null);
const total = () => page.evaluate(() => document.querySelector("[data-matrx-drill-total]")?.innerText.replace(/\s+/g, " ").trim() ?? null);
const search = () => new URL(page.url()).search;

try {
  await resumeWalk();
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}, not the test seat`);
  counting = true;
  step("signed in", { as: out.signed_in_as });

  if (PHASE === "before") {
    await open();
    await shot("01-grid");
    const select = page.locator("[data-matrx-table-group-by]").first();
    step("group-by control before", { present: (await select.count()) > 0, text: (await select.count()) ? await select.innerText() : null });
    if (await select.count()) {
      await select.click();
      await sleep(800);
      await shot("02-group-by-open");
      const opt = page.getByRole("option", { name: /Condition/ }).first();
      if (await opt.count()) {
        await opt.click();
        await sleep(3000);
      }
      await shot("03-grouped-by-condition");
      step("grouped before", {
        rows: await page.evaluate(() => [...document.querySelectorAll("[data-matrx-table-group-row]")].map((r) => r.innerText.replace(/\s+/g, " ").trim())),
        aggregate_calls: asked().length,
      });
    }
  }

  if (PHASE === "after") {
    // ── 1 · group by Condition — the store's groups ─────────────────────────────────────────────
    asked();
    await open("?by=condition&show=count,sum_quantity");
    await until("groups", async () => (await groupRows()).length > 0, 60000);
    await shot("01-grouped-by-condition");
    const g1 = await groupRows();
    step("1 grouped by condition", { rows: g1, total: await total(), store_asked: asked() });
    if (g1.length === 0) friction("no server groups drew for ?by=condition");

    // ── 2 · the group-by menu and a second level ────────────────────────────────────────────────
    await page.locator("[data-matrx-table-group-by]").first().click();
    await sleep(900);
    await shot("02-group-by-menu");
    const menuItems = await page.evaluate(() => [...document.querySelectorAll("[role=menu] [data-matrx-drill-level-menu]")].map((m) => m.innerText.replace(/\s+/g, " ").trim()));
    step("2 group-by menu", { items: menuItems });
    const thenBy = page.locator('[data-matrx-drill-level-menu="1"]');
    if (await thenBy.count()) {
      await thenBy.hover();
      await sleep(700);
      await shot("02b-then-by");
      await page.locator('[data-matrx-drill-option="room"]').first().click();
      await sleep(3500);
    } else friction("no Then by in the group-by menu");
    await page.keyboard.press("Escape");
    await sleep(500);
    await shot("02c-condition-then-room");
    step("2 nested", { level0: await groupRows(0), level1: (await groupRows(1)).slice(0, 8), url: search(), store_asked: asked() });

    // ── 3 · pivot Last Serviced by month across the top ─────────────────────────────────────────
    await open("?by=condition&across=last_serviced:month&show=sum_quantity");
    await until("pivot", async () => (await page.locator("[data-matrx-drill-pivot-column]").count()) > 0, 60000);
    await shot("03-pivot-by-month");
    step("3 pivot", {
      columns: await page.evaluate(() => [...document.querySelectorAll("[data-matrx-drill-pivot-column]")].map((c) => c.innerText.trim())),
      rows: await groupRows(),
      store_asked: asked(),
    });

    // ── 4 · what to display ─────────────────────────────────────────────────────────────────────
    await open("?by=condition&show=count");
    await until("groups", async () => (await groupRows()).length > 0, 60000);
    await page.locator("[data-matrx-drill-measures]").first().click();
    await sleep(900);
    await shot("04-measure-picker");
    const measures = await page.evaluate(() => [...document.querySelectorAll("[data-matrx-drill-measure]")].map((m) => m.innerText.trim()));
    step("4 measures offered", { measures });
    const avg = page.locator('[data-matrx-drill-measure="avg_quantity"]');
    if (await avg.count()) {
      await avg.click();
      await sleep(3000);
    } else friction("Average Quantity not offered");
    await page.keyboard.press("Escape");
    await sleep(400);
    await shot("04b-count-and-average");
    step("4 shown", {
      headers: await page.evaluate(() => [...document.querySelectorAll("[data-matrx-drill-sort]")].map((h) => h.innerText.trim())),
      url: search(),
      rows: await groupRows(),
    });

    // ── 5 · drill on a condition, the trail, See these records ──────────────────────────────────
    await open("?by=condition&show=count,sum_quantity");
    await until("groups", async () => (await groupRows()).length > 0, 60000);
    asked();
    const good = page.locator('[data-matrx-drill-level="0"] [data-matrx-drill-into]').first();
    const goodLabel = (await good.innerText()).trim();
    await good.click();
    await until("drilled", async () => new URL(page.url()).searchParams.get("by") === "room", 20000);
    await until("room groups", async () => (await groupRows()).length > 0, 60000);
    await sleep(1500);
    await shot("05-drilled-into-condition");
    step("5 drilled", { clicked: goodLabel, url: search(), trail: await trail(), rows: await groupRows(), total: await total(), store_asked: asked() });
    const menu = page.locator('[data-matrx-drill-level="0"] [data-matrx-drill-menu]').first();
    await menu.click();
    await sleep(800);
    await shot("05b-drill-menu");
    step("5 drill menu", { items: await page.evaluate(() => [...document.querySelectorAll("[role=menu] [role=menuitem]")].map((m) => m.innerText.trim())) });
    await page.locator('[data-matrx-drill-action="records"]').first().click();
    await sleep(4000);
    await shot("05c-see-these-records");
    step("5 records", {
      url: search(),
      trail: await trail(),
      record_rows: await page.evaluate(() => [...document.querySelectorAll("tbody tr")].length),
    });

    // ── 6 · zoom back out; Back undoes one step ────────────────────────────────────────────────
    await page.locator('[data-matrx-drill-crumb="-1"]').first().click();
    await sleep(3500);
    await shot("06-zoomed-out");
    step("6 root crumb", { url: search(), trail: await trail(), rows: await groupRows() });
    await page.goBack();
    await sleep(3500);
    step("6 back", { url: search(), trail: await trail() });

    // ── 7 · phone and dark ──────────────────────────────────────────────────────────────────────
    await open("?by=condition&show=count,sum_quantity&f.room=Gym%20A", { width: 390, height: 844 });
    await sleep(1500);
    await shot("07-phone-390");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    step("7 phone", { horizontal_overflow_px: overflow, trail: await trail(), rows: await groupRows() });
    if (overflow > 1) friction(`the page scrolls sideways by ${overflow}px at 390`);
    await open("?by=condition,room&show=count,sum_quantity", { dark: true });
    await sleep(1500);
    await shot("07b-dark-1600");
    step("7 dark", { rows: await groupRows(0) });
  }
} catch (error) {
  friction(`walk stopped: ${String(error).slice(0, 400)}`);
  await shot("zz-stopped").catch(() => {});
} finally {
  out.finished = new Date().toISOString();
  writeFileSync(join(SHOTS, `walk-${PHASE}.json`), JSON.stringify(out, null, 2));
  console.log(`frictions ${out.frictions.length}, console errors ${out.console_errors.length}`);
  await browser.close();
}

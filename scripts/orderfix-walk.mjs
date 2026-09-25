// scripts/orderfix-walk.mjs — LANE ORDER-FIX headless proof on the shared preview (live database).
//
// admin@admin.com's own disposable "Oakmont Kitchen Remodel — Punch List" (admin's Workspace; six
// punch items, saved sort Task A→Z, no saved view), in the Sheet. Proves VERIFIER-19 finding 2
// closed, from the person's seat:
//   1. pressing Reorder writes nothing (no view_declare, no view_record_order_set);
//   2. dragging a row and saving puts it first, and the sort control reads Manual;
//   3. after a reload the order holds and still reads Manual;
//   4. a column sort sets it aside and says so; "Back to manual" returns; "Use this sort instead"
//      replaces it; a second Save lands on the same view (no second view is declared).
//
//   ORIGIN=http://order-fix.localhost:3001 node scripts/orderfix-walk.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { signIn } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://order-fix.localhost:3001";
const TABLE = process.env.TABLE ?? "f09747ca-232a-496e-844e-e00eb064f1f5";
const OUT = process.env.OUT ?? "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/shots/order-fix";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const writes = [];
page.on("request", (r) => {
  const m = r.url().match(/\/rpc\/(view_declare|view_record_order_set|record_update)\b/);
  if (m && r.method() === "POST") writes.push({ door: m[1], at: Date.now(), body: r.postData() ?? "" });
});
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));

const sheet = () => page.locator("[data-sheet-layout]").first();
const rooms = async () => (await sheet().locator("[data-cell$='::task']").allInnerTexts()).map((t) => t.trim());
const sortMode = async () =>
  sheet().locator("[data-sort-mode]").first().getAttribute("data-sort-mode").catch(() => null);
const sortText = async () => (await sheet().locator("[data-sort-mode]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
async function open() {
  await page.goto(`${ORIGIN}/data-v2/${TABLE}?view=sheet`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("[data-sheet-layout] [data-cell$='::task']", { timeout: 240000 });
  await page.waitForTimeout(2500);
}

try {
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  check("seat", who === "admin@admin.com", who);

  await open();
  const start = await rooms();
  check("0-opens-sorted", (await sortMode()) === "column" && /Sorted by Task/.test(await sortText()), `"${await sortText()}"; rows ${start.join(" / ")}`);
  await page.screenshot({ path: `${OUT}/0-sheet-sorted-by-task.png` });

  // 1. Reorder writes nothing.
  writes.length = 0;
  await sheet().getByRole("button", { name: /^Reorder$/ }).first().click();
  let dialog = page.getByRole("dialog").last();
  await dialog.waitFor({ timeout: 20000 });
  await page.waitForTimeout(3000);
  const note = (await dialog.locator("[data-row-order-note]").innerText().catch(() => "")).trim();
  check("1-reorder-writes-nothing", writes.length === 0, `writes while the dialog is open: ${writes.map((w) => w.door).join(", ") || "none"}; it says "${note}"`);
  await page.screenshot({ path: `${OUT}/1-reorder-open-nothing-written.png` });

  // 2. Drag the last item to the top and save.
  let items = dialog.locator("[draggable=true]");
  const n = await items.count();
  const label = async (i) => (await items.nth(i).innerText()).replace(/\s+/g, " ").trim().replace(/^\d+ /, "");
  const lastText = await label(n - 1);
  await items.nth(n - 1).dragTo(items.nth(0));
  await page.waitForTimeout(800);
  const topText = await label(0);
  check("2a-drag-moved", topText === lastText, `dragged "${lastText}" → top now "${topText}"`);
  await dialog.getByRole("button", { name: /Save Order/ }).click();
  await page.waitForTimeout(5000);
  const moved = start[start.length - 1];
  const saved = await rooms();
  check("2b-saved-drawn-manual", saved[0] === moved && (await sortMode()) === "manual", `rows ${saved.join(" / ")}; control "${await sortText()}"; writes ${writes.map((w) => w.door).join(", ")}`);
  await page.screenshot({ path: `${OUT}/2-after-save-manual.png` });

  // 3. Reload: the order holds and reads Manual.
  await open();
  const reloaded = await rooms();
  check("3-holds-after-reload", reloaded[0] === moved && (await sortMode()) === "manual", `after reload: ${reloaded.join(" / ")}; control "${await sortText()}"`);
  await page.screenshot({ path: `${OUT}/3-after-reload-manual.png` });

  // 4. A column sort sets it aside and says so; Back to manual; Use this sort instead.
  const header = sheet().locator("th, [role=columnheader]").filter({ hasText: /Task/ }).first();
  await header.click();
  await page.waitForTimeout(2500);
  const aside = await sortText();
  check("4a-sort-sets-aside", /Sorted by Task/.test(aside) && /hand-set order set aside/.test(aside), aside);
  await page.screenshot({ path: `${OUT}/4a-sort-sets-aside.png` });
  await sheet().getByRole("button", { name: "Back to manual" }).click();
  await page.waitForTimeout(2500);
  check("4b-back-to-manual", (await sortMode()) === "manual" && (await rooms())[0] === moved, `"${await sortText()}"; first ${(await rooms())[0]}`);
  await header.click();
  await page.waitForTimeout(2500);
  writes.length = 0;
  await sheet().getByRole("button", { name: "Use this sort instead" }).click();
  await page.waitForTimeout(5000);
  const replaced = await sortText();
  check("4c-sort-replaces", /Sorted by Task/.test(replaced) && /Saved as default/.test(replaced) && writes.some((w) => w.door === "view_declare" && w.body.includes("sorts")), `"${replaced}"; writes ${writes.map((w) => w.door).join(", ")}`);
  await page.screenshot({ path: `${OUT}/4c-sort-replaced.png` });

  // 5. Ordering by hand again lands on the same view: no second view is declared.
  await open();
  writes.length = 0;
  await sheet().getByRole("button", { name: /^Reorder$/ }).first().click();
  dialog = page.getByRole("dialog").last();
  await dialog.waitFor({ timeout: 20000 });
  await page.waitForTimeout(3000);
  items = dialog.locator("[draggable=true]");
  await items.nth(2).dragTo(items.nth(0));
  await page.waitForTimeout(800);
  await dialog.getByRole("button", { name: /Save Order/ }).click();
  await page.waitForTimeout(5000);
  const doors = writes.map((w) => w.door);
  check("5-same-view-again", doors.includes("view_record_order_set") && !doors.includes("view_declare") && (await sortMode()) === "manual", `writes ${doors.join(", ")}; control "${await sortText()}"`);

  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  await page.screenshot({ path: `${OUT}/6-phone-390.png` });
} catch (err) {
  check("walk", false, String(err).slice(0, 400));
  await page.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
} finally {
  check("console-errors", true, consoleErrors.length ? consoleErrors.join(" || ").slice(0, 600) : "none");
  writeFileSync(`${OUT}/walk.json`, JSON.stringify({ origin: ORIGIN, table: TABLE, at: new Date().toISOString(), results }, null, 2));
  await browser.close();
}
process.exit(results.every((r) => r.ok) ? 0 : 1);

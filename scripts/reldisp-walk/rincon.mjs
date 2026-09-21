/**
 * THE RINCON PLUMBING WALK — lane RELATION-DISPLAY-2, 2026-09-21.
 *
 * THE USE CASE, named before a single value is touched (the no-fake-test-data law):
 * Rincon Plumbing Co is a plumbing contractor on the Ventura coast. Its Jobs table
 * points at Customers, and it has TWO customers called Maria Chen — one in Rincon
 * and one in Ojai. On the board they were two identical chips, so a dispatcher had
 * to open a job to find out whose it was. Nothing here is invented: the org, the
 * tables, the 41 jobs and both Maria Chens are the real ones already on the store.
 *
 * WHAT IT PROVES: a person opens the Customer column's settings, ticks "Show
 * different columns, or more than one", picks two columns and a separator, saves —
 * and the GRID, the BOARD and the RECORD VIEW all read the joined words, because
 * all three go through the one resolver.
 *
 * Headless only. node scripts/reldisp-walk/rincon.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "http://reldisp2.localhost:3001";
const OUT = process.env.WALK_OUT ?? resolve(process.cwd(), "../common-docs/operations/for-arman/2026-09-21");
mkdirSync(OUT, { recursive: true });
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163";
const results = { ranAt: new Date().toISOString(), origin: ORIGIN, steps: {} };
const shot = (p, n) => p.screenshot({ path: resolve(OUT, `reldisp-${n}.png`) });
const txt = (p) => p.evaluate(() => document.body.innerText);

/** What the CUSTOMER column of the grid actually reads, row by row. */
const customerCells = (p) =>
  p.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-label="Edit Customer"]'))
      .map((b) => (b.textContent ?? "").trim())
      .filter((t) => t && t !== "—"));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });

const who = await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD, "admin");
results.identity = who;
console.log("identity the app itself reports:", who);
await setOrganization(page, "Rincon Plumbing Co");
await page.keyboard.press("Escape");
await page.evaluate(() => {
  for (const id of ["#menu-group-organization", "#shell-sidebar-toggle"]) {
    const el = document.querySelector(id);
    if (el instanceof HTMLInputElement && el.checked) el.click();
  }
});

// ── 1. BEFORE ────────────────────────────────────────────────────────────────
await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(10000);
results.steps.before = await customerCells(page);
console.log("1. BEFORE — the customer column reads:", results.steps.before.slice(0, 6));
console.log("   how many say exactly 'Maria Chen':", results.steps.before.filter((c) => c === "Maria Chen").length);
await shot(page, "01-grid-before");

// ── 2. THE BUILDER, AS A PERSON MEETS IT ─────────────────────────────────────
await page.evaluate(() => {
  const bs = Array.from(document.querySelectorAll("button")).filter((x) => (x.textContent ?? "").trim() === "Settings");
  bs[bs.length - 1]?.click();
});
await sleep(4000);
const opened = await page.evaluate(() => {
  for (const e of Array.from(document.querySelectorAll("button")).filter((b) => (b.textContent ?? "").trim() === "Edit")) {
    let row = e.parentElement;
    for (let i = 0; i < 5 && row; i++) {
      const t = row.textContent ?? "";
      if (t.startsWith("Customer") && t.includes("Points at another record")) { e.click(); return true; }
      row = row.parentElement;
    }
  }
  return false;
});
if (!opened) throw new Error("could not open the Customer column's settings");
await sleep(4500);
const panel = await txt(page);
results.steps.defaultShownAs = /Shown as\s*\n\s*(.+)/.exec(panel)?.[1] ?? null;
console.log("2. THE BUILDER says the honest default out loud:", results.steps.defaultShownAs);
await shot(page, "02-builder-default");

// ── 3. TICK IT, PICK TWO COLUMNS, CHOOSE THE SEPARATOR ───────────────────────
await page.evaluate(() => {
  const c = document.querySelector('[aria-label="Show more than one column"]');
  if (c instanceof HTMLElement) c.click();
});
await sleep(2500);
for (const key of ["customer_name", "city"]) {
  const ok = await page.evaluate((k) => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent ?? "").trim() === k);
    if (!b) return false; b.click(); return true;
  }, key);
  console.log(`   picked ${key}:`, ok);
  await sleep(1200);
}
await page.evaluate(() => {
  const i = document.querySelector('[aria-label="What goes between the columns"]');
  if (!(i instanceof HTMLInputElement)) return;
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  set?.call(i, ", ");
  i.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(2500);
const withSpec = await txt(page);
const at = withSpec.indexOf("It will read");
results.steps.preview = withSpec.slice(at, at + 160).split("\n").slice(1, 5);
console.log("3. THE LIVE PREVIEW, on that table's real rows:", results.steps.preview);
await shot(page, "03-builder-two-columns");

// ── 4. SAVE ──────────────────────────────────────────────────────────────────
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent ?? "").trim() === "Save field");
  b?.click();
});
await sleep(7000);
await shot(page, "04-saved");

// ── 5. THE GRID ──────────────────────────────────────────────────────────────
await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(11000);
results.steps.gridAfter = await customerCells(page);
console.log("5. THE GRID now reads:", results.steps.gridAfter.slice(0, 6));
await shot(page, "05-grid-after");

// ── 6. THE BOARD ─────────────────────────────────────────────────────────────
await page.goto(`${ORIGIN}/data-v2/${JOBS}?view=kanban`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(11000);
const board = await txt(page);
results.steps.boardMentionsJoined = /Maria Chen, (Rincon|Ojai)/.test(board);
results.steps.boardSample = (board.match(/[A-Z][a-z]+ [A-Z][a-z]+, [A-Z][a-z]+/g) ?? []).slice(0, 6);
console.log("6. THE BOARD reads joined words:", results.steps.boardMentionsJoined, results.steps.boardSample);
await shot(page, "06-board-after");

// ── 7. THE RECORD VIEW ───────────────────────────────────────────────────────
await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(10000);
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('[aria-label="Edit Job Number"]')).find((x) => (x.textContent ?? "").trim().startsWith("RPC-"));
  b?.click();
});
await sleep(6000);
const rec = await txt(page);
results.steps.recordMentionsJoined = /[A-Za-z]+ [A-Za-z]+, (Rincon|Ojai|Ventura|Carpinteria|Oxnard|Goleta|Camarillo|Fillmore|Moorpark)/.test(rec);
results.steps.recordSample = (rec.match(/[A-Z][a-z]+ [A-Z][a-z]+, [A-Z][a-z]+/g) ?? []).slice(0, 4);
console.log("7. THE RECORD VIEW reads joined words:", results.steps.recordMentionsJoined, results.steps.recordSample);
await shot(page, "07-record-after");

writeFileSync(resolve(OUT, "reldisp-walk-results.json"), JSON.stringify(results, null, 2));
console.log("\nwrote", resolve(OUT, "reldisp-walk-results.json"));
await browser.close();

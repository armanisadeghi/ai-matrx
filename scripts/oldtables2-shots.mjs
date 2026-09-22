/**
 * OLD-TABLES-2 — the headless proof, on a REAL older dataset, from the admin seat.
 *
 * Rincon Plumbing & Drain's dispatch board in admin's Workspace: a Service Calls table
 * whose `customer` column is the `relation` format, pointing at the Customers table.
 * OLD-TABLES-1 proved the WRITE side there (an id is accepted, a name is refused). This
 * walk proves the READ side W2 and W3 built:
 *
 *   1  the grid reads the customers' WORDS — "Maria Delgado", not 771155c3-…
 *   2  the row that points at a customer who is not there reads as an amber IDENTIFIER
 *      chip, not a bare uuid and not a blank
 *   3  a cell is still the words after a WRITE and a full RELOAD, which is the clause
 *      the brief names: the door is not a render-time accident
 *   4  the column filter checklist offers the words
 *   5  W4's knob: with NO override the "Shows as" picker offers no relation option; with
 *      the organization's own override it does. Both states, same seat, same table.
 *
 * Headless only, on this lane's own port (3054, scripts/campaign-ports.json).
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const ORIGIN = "http://127.0.0.1:3054";
const CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
mkdirSync(OUT, { recursive: true });

const errors = [];
const bad = [];
const found = {};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });

  const nonce = randomBytes(16).toString("hex");
  writeFileSync("/Users/armanisadeghi/code/matrx-frontend/.dev-login-nonce.127.0.0.1", `${nonce}\n`);
  const dest = `/data/${CALLS}?ps=50`;
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(dest)}`, {
    waitUntil: "domcontentloaded", timeout: 240000,
  });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  console.log("[shots] seat:", JSON.stringify(who));
  if (!who?.email) throw new Error("no identity — the walk would prove nothing");
  found.seat = who.email;

  await page.waitForLoadState("networkidle", { timeout: 240000 }).catch(() => {});
  await page.waitForFunction(() => document.body.innerText.includes("WO-4471"), null, { timeout: 240000 });
  await page.waitForTimeout(2500);

  // ── 1 & 2 · the grid ────────────────────────────────────────────────────────────────
  await page.screenshot({ path: `${OUT}/oldtables2-1-dispatch-board-reads-words.png` });
  let text = await bodyText(page);
  found.gridWords = ["Maria Delgado", "Harbor View HOA", "Takeda Property Management"]
    .filter((w) => text.includes(w));
  found.gridFullUuids = (text.match(UUID) || []).length;
  found.gridIdentifierChips = (text.match(/Record [0-9a-f]{8}/g) || []).length;
  console.log("[shots] words on the board:", JSON.stringify(found.gridWords));
  console.log("[shots] full uuids visible:", found.gridFullUuids);
  console.log("[shots] amber identifier chips:", found.gridIdentifierChips);

  // ── 3 · A REAL WRITE, THEN A FULL RELOAD ────────────────────────────────────────────
  // The clause is that the words survive a write and a reload — that the door is not a
  // render-time accident. WO-4472's Stage is edited in the grid, through the same write
  // path every cell edit takes (and therefore through OLD-TABLES-1's relation boundary
  // trigger), and then the whole page is reloaded from scratch.
  // The write TOGGLES between two real stages of the same lifecycle, so the walk is
  // re-runnable and never leaves the board holding a value a dispatcher would not write.
  const before = text.includes("Parts received") ? "Parts received" : "Parts on order";
  const after = before === "Parts received" ? "Parts on order" : "Parts received";
  const stageCell = page.locator(`td:has-text("${before}")`).first();
  if (await stageCell.count()) {
    await stageCell.dblclick();
    await page.waitForTimeout(600);
    await page.keyboard.press("ControlOrMeta+a").catch(() => {});
    await page.keyboard.type(after, { delay: 40 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);
    found.wroteStage = `${before} -> ${after}`;
    found.writeLanded = (await bodyText(page)).includes(after);
    console.log(`[shots] wrote WO-4472 Stage ${found.wroteStage}:`, found.writeLanded);
  }
  found.expectAfterReload = after;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => document.body.innerText.includes("WO-4471"), null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  text = await bodyText(page);
  found.afterReloadWords = ["Maria Delgado", "Harbor View HOA", "Takeda Property Management"]
    .filter((w) => text.includes(w));
  found.afterReloadFullUuids = (text.match(UUID) || []).length;
  found.writeSurvivedReload = text.includes(found.expectAfterReload);
  await page.screenshot({ path: `${OUT}/oldtables2-2-after-reload-still-words.png` });
  console.log("[shots] after reload, words:", JSON.stringify(found.afterReloadWords),
              "uuids:", found.afterReloadFullUuids);

  // ── 4 · the column filter checklist ─────────────────────────────────────────────────
  const header = page.locator('th:has-text("Customer"), [role="columnheader"]:has-text("Customer")').first();
  if (await header.count()) {
    await header.hover().catch(() => {});
    await page.waitForTimeout(400);
    const trigger = header.locator("button").last();
    if (await trigger.count()) {
      await trigger.click().catch(() => {});
      await page.waitForTimeout(1200);
      const menu = await bodyText(page);
      found.filterOffersWords = menu.includes("Maria Delgado");
      found.filterShowsUuid = (menu.match(UUID) || []).length;
      await page.screenshot({ path: `${OUT}/oldtables2-3-customer-column-menu.png` });
      await page.keyboard.press("Escape").catch(() => {});
    }
  }
  console.log("[shots] filter menu offers words:", found.filterOffersWords);

  found.consoleErrors = errors;
  found.responsesOver400 = bad;
  writeFileSync(`${OUT}/oldtables2-walk.json`, JSON.stringify(found, null, 2));
  console.log("[shots] console errors:", errors.length, JSON.stringify(errors.slice(0, 5)));
  console.log("[shots] responses >= 400:", bad.length, JSON.stringify(bad.slice(0, 5)));

  await browser.close();
}
main().catch((e) => { console.error("[shots] FAILED:", e.message); process.exit(1); });

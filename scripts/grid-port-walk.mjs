/**
 * GRID-PORT — the headless walk of the /data grid over the RECORD STORE.
 *
 *   node scripts/grid-port-walk.mjs [--seat admin|test] [--only <clause,clause>]
 *
 * Needs a dev server on this lane's port (scripts/campaign-ports.json, "GRID-PORT")
 * already running and pointed at the database under test, and the seat's email and
 * password in GRID_PORT_EMAIL / GRID_PORT_PASSWORD (never printed). It signs in
 * through the REAL login form, chooses admin's Workspace through the same picker a
 * person uses, opens the moved tables at /data/<id> — the older grid's own route —
 * and proves each clause of the owner's capability list it is asked about, each one
 * a PASS or a FAIL with what the screen actually showed.
 *
 * Headless only (never the owner's screen). Screenshots land in the lane's handoff
 * folder. Exit 0 only when every clause it ran passes.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const PORT = JSON.parse(readFileSync(resolve(ROOT, "scripts/campaign-ports.json"), "utf8")).lanes["GRID-PORT"];
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/shots";
mkdirSync(OUT, { recursive: true });

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};
const SEAT = arg("seat") ?? "admin";
const ONLY = arg("only")?.split(",") ?? null;
const EMAIL = process.env.GRID_PORT_EMAIL ?? "";
const PASSWORD = process.env.GRID_PORT_PASSWORD ?? "";
if (!EMAIL || !PASSWORD) {
  console.error("GRID_PORT_EMAIL and GRID_PORT_PASSWORD must hold the seat's sign-in (they are never printed).");
  process.exit(2);
}

export const TABLES = {
  calls: "dbc7cd48-7b46-4402-ac9d-e459a95f4598", // Rincon Plumbing — Service Calls
  customers: "415c3e23-2f90-4c66-9040-b246fa1c4b36", // Rincon Plumbing — Customers
  parity: "fc007161-f1c5-4ea9-9548-eefda0bc7d72", // Grid Parity Fixture
  defects: "8c67a085-197d-44c0-b2bb-ceeea9555303", // matrx-frontend (LCP test) — Known defects
};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const clauses = {};
const pass = (name, ok, saw) => {
  clauses[name] = { ok: Boolean(ok), saw };
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${saw}`);
};
const wants = (name) => !ONLY || ONLY.includes(name);

async function signIn(page) {
  await page.goto(`${ORIGIN}/login?redirectTo=${encodeURIComponent("/data")}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120000 });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  if (who?.email !== EMAIL) throw new Error(`wrong seat after sign-in — the walk would prove nothing`);
  console.log(`seat ${SEAT} signed in through the login form`);
}

async function chooseWorkspace(page) {
  // THE ORGANIZATION IS CHOSEN, NEVER ASSUMED: a fresh session has none, and the
  // header's "Choose org" is the same control a person uses.
  await page.goto(`${ORIGIN}/data`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const choose = page.getByText("Choose org", { exact: true }).first();
  await choose.waitFor({ timeout: 60000 }).catch(() => {});
  if ((await choose.count()) === 0) {
    console.log("an organization is already chosen");
    return;
  }
  await choose.click();
  const option = page.getByRole("option").filter({ hasText: "admin's Workspace" }).first();
  await option.waitFor({ timeout: 30000 });
  await option.click();
  await page.waitForTimeout(2500);
  console.log("organization chosen: admin's Workspace");
}

/** Open one submenu of an open context menu, the way a keyboard user does. */
async function openSubmenu(page, name) {
  const item = page.getByRole("menuitem", { name }).first();
  if ((await item.count()) === 0) return false;
  // A submenu opens on POINTER MOVEMENT over its trigger, not on a jump to it.
  await item.hover();
  const box = await item.boundingBox();
  if (box) await page.mouse.move(box.x + box.width - 12, box.y + box.height / 2, { steps: 6 });
  await page.waitForTimeout(900);
  return true;
}

/** Open a table at the OLDER grid's route and wait until a known cell is drawn. */
async function openGrid(page, tableId, mustSee) {
  await page.goto(`${ORIGIN}/data/${tableId}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction((t) => document.body.innerText.includes(t), mustSee, { timeout: 180000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return page.evaluate(() => document.body.innerText);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const bad = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });

    await signIn(page);
    await chooseWorkspace(page);

    if (wants("read")) {
      const text = await openGrid(page, TABLES.calls, "WO-4471");
      const stayed = page.url().includes(`/data/${TABLES.calls}`) && !page.url().includes("/data-v2/");
      await page.screenshot({ path: `${OUT}/gridport-${SEAT}-1-service-calls-in-the-grid.png` });
      pass("read-stays-on-the-grid", stayed, page.url().replace(ORIGIN, ""));
      pass("read-rows", ["WO-4471", "WO-4472", "WO-4473"].every((w) => text.includes(w)), "work orders WO-4471..4473 on screen");
      pass("read-columns", ["Work order", "Customer", "Stage"].every((w) => text.includes(w)), "headers Work order / Customer / Stage");
      const grid = await page.locator("table").first().innerText().catch(() => "");
      const uuids = (grid.match(UUID) || []).length;
      pass("read-relation-words", /Maria Delgado|Harbor View|Takeda/.test(grid) && uuids === 0, `customers as names, ${uuids} bare ids in the grid`);
      const parity = await openGrid(page, TABLES.parity, "Job 120");
      await page.screenshot({ path: `${OUT}/gridport-${SEAT}-2-parity-fixture-in-the-grid.png` });
      pass("read-parity-fixture", /of 120 rows/.test(parity) && parity.includes("Amount") && parity.includes("Job 0"), "Grid Parity Fixture: 120 rows, its Amount column, its jobs");
    }

    // ── WRITES: a real edit to a real service call, undone, persisted, put back ─────
    if (wants("write")) {
      const ROW = "e5d565a8-24aa-471c-94d9-f93e78c91994"; // WO-4475, stage "Scheduled"
      const cell = () => page.locator(`[data-cell="${ROW}::stage"]`).first();
      const stageText = async () => (await cell().innerText().catch(() => "")).trim();
      const typeInto = async (value) => {
        await cell().dblclick();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type(value);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2500);
      };
      await openGrid(page, TABLES.calls, "WO-4475");
      const before = await stageText();
      await typeInto("Scheduled - customer confirmed by phone");
      const edited = await stageText();
      pass("write-cell", edited.includes("customer confirmed"), `stage "${before}" → "${edited}"`);
      const undo = page.locator('button[title^="Undo last cell change"]').first();
      const undoShown = (await undo.count()) > 0;
      if (undoShown) {
        await undo.click();
        await page.waitForTimeout(2500);
      }
      const undone = await stageText();
      pass("write-undo", undoShown && undone === before, `undo button ${undoShown ? "shown" : "absent"}; stage now "${undone}"`);
      await openGrid(page, TABLES.calls, "WO-4475");
      const afterReload = await stageText();
      pass("write-undo-persists", afterReload === before, `after reload the stage reads "${afterReload}"`);
      await typeInto("Scheduled - customer confirmed by phone");
      await openGrid(page, TABLES.calls, "WO-4475");
      const persisted = await stageText();
      pass("write-persists", persisted.includes("customer confirmed"), `after reload "${persisted}"`);
      await page.screenshot({ path: `${OUT}/gridport-${SEAT}-3-edited-cell.png` });

      // ── history: the row's own versions, from the store ──────────────────────────
      await cell().click({ button: "right" });
      await page.waitForTimeout(800);
      const openedRow = await openSubmenu(page, /^Row ·/);
      if (!openedRow) console.log("the row submenu trigger was not found");
      const historyItem = page.getByRole("menuitem", { name: /Row history/ }).first();
      const hasHistory = (await historyItem.count()) > 0;
      if (hasHistory) await historyItem.click();
      await page.waitForTimeout(3000);
      const panel = await page.evaluate(() => document.body.innerText);
      const restoreButtons = await page.getByRole("button", { name: /Restore|Revert/ }).count();
      pass("history-panel", hasHistory && restoreButtons > 0 && /customer confirmed/.test(panel), hasHistory ? `Row history drawn with ${restoreButtons} restore/revert control(s)` : "no Row history item");
      await page.screenshot({ path: `${OUT}/gridport-${SEAT}-4-row-history.png` });
      await page.keyboard.press("Escape");

      // put the real value back, the way a person would
      await openGrid(page, TABLES.calls, "WO-4475");
      await typeInto(before);
      await openGrid(page, TABLES.calls, "WO-4475");
      const restored = await stageText();
      pass("write-put-back", restored === before, `stage back to "${restored}"`);
    }

    // ── COLORS: hand-highlight a cell, see it after a reload, clear it ──────────
    if (wants("colors")) {
      const ROW = "cfc72430-2dbf-40d6-980d-f6e5efdeab3d"; // WO-4471
      const target = () => page.locator(`[data-cell="${ROW}::stage"]`).first();
      const pick = async (label) => {
        await openGrid(page, TABLES.calls, "WO-4471");
        await target().click({ button: "right" });
        await page.waitForTimeout(800);
        if (!(await openSubmenu(page, /^Highlight cell/))) return false;
        const choice = page.getByRole("menuitem", { name: label }).first();
        if ((await choice.count()) === 0) return false;
        await choice.click();
        await page.waitForTimeout(2500);
        return true;
      };
      const picked = await pick(/^Amber/);
      await openGrid(page, TABLES.calls, "WO-4471");
      const painted = await target().evaluate((el) => `${el.className} ${el.closest("td")?.className ?? ""}`);
      pass("colors-cell-highlight", picked && /amber/.test(painted), picked ? `the cell paints: ${(painted.match(/\S*amber\S*/g) ?? []).slice(0, 3).join(" ")}` : "no Amber in Highlight cell");
      await page.screenshot({ path: `${OUT}/gridport-${SEAT}-5-cell-highlight.png` });
      const cleared = await pick(/^Clear highlight/);
      await openGrid(page, TABLES.calls, "WO-4471");
      const after = await target().evaluate((el) => `${el.className} ${el.closest("td")?.className ?? ""}`);
      pass("colors-clear", cleared && !/amber/.test(after), cleared ? "the highlight is gone after a reload" : "no Clear highlight");
    }

    const onClone = String(process.env.GRID_PORT_ON_CLONE || "") === "1";
    const python = /https:\/\/(server\.app|files)\.matrxserver\.com\//;
    const excused = onClone ? bad.filter((b) => b.startsWith("401 ") && python.test(b.slice(4))) : [];
    const counted = bad.filter((b) => !excused.includes(b));
    const countedErrors = onClone ? errors.filter((e) => !/status of 401/.test(e)) : errors;
    pass("quiet", countedErrors.length === 0 && counted.length === 0,
      `console errors ${countedErrors.length}, responses>=400 ${counted.length}` +
      (excused.length ? ` (plus ${excused.length} expected 401s from production's Python server refusing a clone-minted session)` : ""));
    if (countedErrors.length) console.log(countedErrors.slice(0, 8).join("\n"));
    if (counted.length) console.log(counted.slice(0, 8).join("\n"));
  } finally {
    await browser.close();
  }
  writeFileSync(`${OUT}/gridport-${SEAT}-walk.json`, JSON.stringify({ clauses, errors: errors.slice(0, 20), bad: bad.slice(0, 20) }, null, 2));
  const failed = Object.entries(clauses).filter(([, c]) => !c.ok).map(([n]) => n);
  console.log(failed.length ? `FAILED: ${failed.join(", ")}` : "ALL CLAUSES PASS");
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(2); });

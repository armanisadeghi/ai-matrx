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
// WHICH SURFACE THE GRID IS WALKED ON. "data" = the older route /data/<id>; "sheet" = the
// owner's ruling of 2026-09-23 — the ported grid as the Sheet layout of the one table page,
// /data-v2/<id>?view=sheet. The older example table is always walked at /data (the older half).
const SURFACE = arg("surface") ?? "data";
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
  // An OLDER table (workbench.udt_*): the platform's example, read-only for everyone.
  // (A table made in admin's Workspace for this is moved into the record store by the
  // mover's next run on the clone — which is how "Parts on order" became one.)
  olderExample: "437ad3e2-0b61-4cc2-938c-db22fc5c5220", // Example: Product Catalog
  // Harbor Point Plumbing & Drain — Service calls (scripts/grid-port-seed-harbor-point.sql).
  harborCalls: process.env.GRID_PORT_HARBOR_CALLS ?? "",
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
  await page.waitForTimeout(500);
  // A nested submenu does not always open on a pointer jump; the keyboard way
  // (focus the trigger, ArrowRight) always does, and is how a keyboard user opens it.
  await item.focus().catch(() => {});
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(800);
  return true;
}

/** Where a table's grid lives on the surface under walk. */
function tableUrl(tableId) {
  return SURFACE === "sheet" && tableId !== TABLES.olderExample
    ? `${ORIGIN}/data-v2/${tableId}?view=sheet`
    : tableUrl(tableId);
}
/** Is the page showing this table's grid on the surface under walk? */
function onTable(url, tableId) {
  return SURFACE === "sheet" && tableId !== TABLES.olderExample
    ? url.includes(`/data-v2/${tableId}`) && /[?&]view=sheet\b/.test(url)
    : url.includes(`/data/${tableId}`) && !url.includes("/data-v2/");
}

/** Open a table at the OLDER grid's route and wait until a known cell is drawn. */
async function openGrid(page, tableId, mustSee) {
  await page.goto(tableUrl(tableId), { waitUntil: "domcontentloaded", timeout: 240000 });
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
      const stayed = onTable(page.url(), TABLES.calls);
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-1-service-calls-in-the-grid.png` });
      pass("read-stays-on-the-grid", stayed, page.url().replace(ORIGIN, ""));
      pass("read-rows", ["WO-4471", "WO-4472", "WO-4473"].every((w) => text.includes(w)), "work orders WO-4471..4473 on screen");
      pass("read-columns", ["Work order", "Customer", "Stage"].every((w) => text.includes(w)), "headers Work order / Customer / Stage");
      const grid = await page.locator("table").first().innerText().catch(() => "");
      const uuids = (grid.match(UUID) || []).length;
      pass("read-relation-words", /Maria Delgado|Harbor View|Takeda/.test(grid) && uuids === 0, `customers as names, ${uuids} bare ids in the grid`);
      const parity = await openGrid(page, TABLES.parity, "Job 120");
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-2-parity-fixture-in-the-grid.png` });
      pass("read-parity-fixture", /of 120 rows/.test(parity) && parity.includes("Amount") && /Job \d{3}/.test(parity), "Grid Parity Fixture: 120 rows, its Amount column, its jobs");
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
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-3-edited-cell.png` });

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
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-4-row-history.png` });
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
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-5-cell-highlight.png` });
      const cleared = await pick(/^Clear highlight/);
      await openGrid(page, TABLES.calls, "WO-4471");
      const after = await target().evaluate((el) => `${el.className} ${el.closest("td")?.className ?? ""}`);
      pass("colors-clear", cleared && !/amber/.test(after), cleared ? "the highlight is gone after a reload" : "no Clear highlight");
    }

    /** Right-click a cell and choose one item of its column's submenu. */
    const columnMenu = async (rowId, fieldName, itemName) => {
      // Menus open on pointer and focus timing; a second try is what a person does.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.keyboard.press("Escape");
        await page.locator(`[data-cell="${rowId}::${fieldName}"]`).first().click({ button: "right" });
        await page.waitForTimeout(900);
        await openSubmenu(page, /^Column ·/);
        const item = page.getByRole("menuitem", { name: itemName }).first();
        if ((await item.count()) === 0) continue;
        const clicked = await item.click({ timeout: 5000 }).then(() => true).catch(() => false);
        if (!clicked) continue;
        await page.waitForTimeout(1200);
        return true;
      }
      return false;
    };
    /** The same, for the row's submenu. */
    const rowMenu = async (cell, itemName) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.keyboard.press("Escape");
        await cell.click({ button: "right" });
        await page.waitForTimeout(900);
        await openSubmenu(page, /^Row ·/);
        const item = page.getByRole("menuitem", { name: itemName }).first();
        if ((await item.count()) === 0) continue;
        const clicked = await item.click({ timeout: 5000 }).then(() => true).catch(() => false);
        if (!clicked) continue;
        await page.waitForTimeout(1000);
        return true;
      }
      return false;
    };
    const dialog = () => page.getByRole("dialog").last();

    // ── RULES: the store refuses a value its column's rules forbid ───────────────
    if (wants("rules")) {
      const ROW = "d950805d-e25f-46c7-8aa1-0ab772f06167"; // WO-4472, work order must match ^WO-[0-9]{4}$
      await openGrid(page, TABLES.calls, "WO-4472");
      const cellWO = page.locator(`[data-cell="${ROW}::work_order"]`).first();
      await cellWO.dblclick();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("WO-12345");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);
      const said = await page.evaluate(() => document.body.innerText);
      const refusedOnScreen = /was not accepted/i.test(said) && /Must match the pattern/.test(said);
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-6-rule-refusal.png` });
      await page.keyboard.press("Escape");
      await openGrid(page, TABLES.calls, "WO-4472");
      const kept = (await cellWO.innerText().catch(() => "")).trim();
      pass("rules-refuse", kept === "WO-4472" && refusedOnScreen, `after the refused edit the work order still reads "${kept}"`);
    }

    // ── FORMULA: the text goes to the store and the store works the value out ────
    if (wants("formula")) {
      const JOB120 = "e3519c02-ebab-4d83-84ae-15f801480f20"; // amount 4653, qty 1
      await openGrid(page, TABLES.parity, "Job 0");
      await page.getByPlaceholder(/Search table/).first().fill("Job 120");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2500);
      const opened = await columnMenu(JOB120, "total", /Column settings/);
      let saved = false;
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-7a-formula-settings.png` });
      if (!opened) console.log("the Total column's settings did not open");
      if (opened) {
        // The formula opens in its own editor, from the button that shows it.
        const trigger = page.locator('button[title*="{Amount}"]').first();
        if ((await trigger.count()) > 0) {
          await trigger.click();
          await page.waitForTimeout(600);
        }
        const box = page.locator("#formula-expression").first();
        if ((await box.count()) === 0) console.log("the formula editor did not open");
        if ((await box.count()) > 0) {
          // Typed again, as a person re-saving the formula would.
          await box.fill("{Amount}*{Qty}");
          await page.waitForTimeout(400);
          await page.keyboard.press("Escape");
          await page.waitForTimeout(400);
          await page.getByRole("button", { name: /^Save$/ }).last().click();
          await page.waitForTimeout(3000);
          saved = true;
        }
      }
      await openGrid(page, TABLES.parity, "Job 0");
      await page.getByPlaceholder(/Search table/).first().fill("Job 120");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2500);
      const total = (await page.locator(`[data-cell="${JOB120}::total"]`).first().innerText().catch(() => "")).trim();
      pass("formula-store-computes", saved && /4,?653/.test(total), `Total for Job 120 (4653 × 1) reads "${total}"`);
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-7-formula.png` });
    }

    // ── COLUMNS: add one, change what it holds, remove it ────────────────────────
    if (wants("columns")) {
      const ROW = "cfc72430-2dbf-40d6-980d-f6e5efdeab3d";
      await openGrid(page, TABLES.calls, "WO-4471");
      if ((await page.locator(`[data-cell="${ROW}::minutes_on_site"]`).count()) > 0) {
        // A run that stopped half-way left its column; take it away first.
        if (await columnMenu(ROW, "minutes_on_site", /Delete column/)) {
          await page.getByRole("button", { name: /Remove column/ }).first().click().catch(() => {});
          await page.waitForTimeout(3000);
        }
        await openGrid(page, TABLES.calls, "WO-4471");
      }
      await page.getByRole("button", { name: /^Column$/ }).first().click();
      await page.waitForTimeout(800);
      await page.locator("#displayName").fill("Minutes on site");
      await dialog().getByRole("button", { name: /Add Column/ }).click();
      await page.waitForTimeout(3000);
      const text = await openGrid(page, TABLES.calls, "Minutes on site");
      pass("columns-add", text.includes("Minutes on site"), "a new column appears in the grid");
      // retype text → number
      let retyped = false;
      if (await columnMenu(ROW, "minutes_on_site", /Column settings/)) {
        await dialog().getByRole("combobox").first().click();
        await page.getByRole("option", { name: /^Number$/ }).first().click();
        await dialog().getByRole("button", { name: /^Save$/ }).click();
        await page.waitForTimeout(1200);
        const change = page.getByRole("button", { name: /Change type/ }).first();
        if ((await change.count()) > 0) await change.click();
        await page.waitForTimeout(3000);
        retyped = true;
      }
      await openGrid(page, TABLES.calls, "Minutes on site");
      let stores = "";
      if (await columnMenu(ROW, "minutes_on_site", /Column settings/)) {
        stores = (await dialog().getByRole("combobox").first().innerText().catch(() => "")).trim();
        await page.keyboard.press("Escape");
      }
      pass("columns-retype", retyped && /Number/.test(stores), `the column now stores "${stores}"`);
      // remove it
      let removed = false;
      await openGrid(page, TABLES.calls, "Minutes on site");
      if (await columnMenu(ROW, "minutes_on_site", /Delete column/)) {
        const confirmBtn = page.getByRole("button", { name: /Remove column/ }).first();
        await confirmBtn.waitFor({ timeout: 5000 }).catch(() => {});
        if ((await confirmBtn.count()) > 0) {
          await confirmBtn.click();
          removed = true;
        }
        await page.waitForTimeout(3000);
      }
      if (!removed) await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-debug-column-remove.png` });
      const after = await openGrid(page, TABLES.calls, "WO-4471");
      pass("columns-remove", removed && !after.includes("Minutes on site"), removed ? "the column is gone after a reload" : "no Delete column");
    }

    // ── ROWS: add one through the form, archive it ───────────────────────────────
    if (wants("rows")) {
      await openGrid(page, TABLES.calls, "WO-4471");
      await page.getByRole("button", { name: /^Row$/ }).first().click();
      await page.waitForTimeout(1500);
      await page.locator("#work_order").fill("WO-4476");
      await page.locator("#stage").fill("Scheduled");
      await dialog().getByRole("button", { name: /Add Row/ }).click();
      await page.waitForTimeout(3000);
      const text = await openGrid(page, TABLES.calls, "WO-4476");
      pass("rows-add", text.includes("WO-4476"), "WO-4476 appears after a reload");
      const cellNew = page.locator("[data-cell$='::work_order']").filter({ hasText: "WO-4476" }).first();
      const key = await cellNew.getAttribute("data-cell").catch(() => null);
      let archived = false;
      let sentence = "";
      if (key) {
        await cellNew.click({ button: "right" });
        await page.waitForTimeout(900);
        await openSubmenu(page, /^Row ·/);
        const del = page.getByRole("menuitem", { name: /Delete row/ }).first();
        if ((await del.count()) > 0) {
          await del.click();
          await page.waitForTimeout(1000);
          sentence = (await dialog().innerText().catch(() => "")).replace(/\s+/g, " ");
          const confirmBtn = dialog().getByRole("button", { name: /^(Delete|Archive)/ }).first();
          if ((await confirmBtn.count()) > 0) {
            await confirmBtn.click();
            archived = true;
          }
          await page.waitForTimeout(3000);
        }
      }
      const after = await openGrid(page, TABLES.calls, "WO-4471");
      pass("rows-archive", archived && !after.includes("WO-4476"), archived ? "WO-4476 is gone after a reload" : "no Delete row");
      pass("rows-archive-says-so", /archived/.test(sentence) && !/cannot be undone/.test(sentence), `the question said: ${sentence.slice(0, 160)}`);
    }

    // ── SORT, DEFAULT SORT, SEARCH ────────────────────────────────────────────────
    if (wants("sort")) {
      const ROW = "cfc72430-2dbf-40d6-980d-f6e5efdeab3d";
      const order = async () =>
        page.evaluate(() =>
          [...document.querySelectorAll("[data-cell$='::work_order']")].map((e) => e.textContent?.trim()),
        );
      await openGrid(page, TABLES.calls, "WO-4471");
      await columnMenu(ROW, "stage", /Sort A→Z/);
      await page.waitForTimeout(2000);
      const sorted = await order();
      // Stage A→Z: Dispatched, Invoiced, On site, Parts on order, Scheduled.
      pass("sort-column", sorted.join(",") === "WO-4474,WO-4473,WO-4471,WO-4472,WO-4475", `A→Z by Stage: ${sorted.join(", ")}`);
      const saveDefault = page.getByRole("button", { name: /^Save as default$/ }).first();
      const canSave = (await saveDefault.count()) > 0 || (await page.getByText("Saved as default").count()) > 0;
      if ((await saveDefault.count()) > 0) {
        await saveDefault.click();
        await page.waitForTimeout(2500);
      }
      await page.goto(tableUrl(TABLES.calls), { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.waitForFunction(() => document.body.innerText.includes("WO-4471"), null, { timeout: 180000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const reopened = await order();
      const savedShown = (await page.getByText("Saved as default").count()) > 0;
      pass("sort-default", canSave && savedShown && reopened.join(",") === sorted.join(","), `reopened in ${reopened.join(", ")}${savedShown ? " with 'Saved as default'" : ""}`);
      const clear = page.locator('button[title="Clear saved sort"]').first();
      const canClear = (await clear.count()) > 0;
      if (canClear) {
        await clear.click();
        await page.waitForTimeout(2500);
      }
      await page.goto(tableUrl(TABLES.calls), { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.waitForFunction(() => document.body.innerText.includes("WO-4471"), null, { timeout: 180000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const stillSaved = (await page.getByText("Saved as default").count()) > 0;
      pass("sort-default-clear", canClear && !stillSaved, canClear ? "reopened with no saved sort" : "no Clear control");
      await openGrid(page, TABLES.calls, "WO-4471");
      await page.getByPlaceholder(/Search table/).first().fill("Invoiced");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2500);
      const found = await order();
      pass("search", found.join(",") === "WO-4473", `search "Invoiced" shows ${found.join(", ")}`);
    }

    // ── SUMMARIES: the sum under a column, over every row ─────────────────────────
    if (wants("summaries")) {
      const JOB = "e3519c02-ebab-4d83-84ae-15f801480f20";
      await openGrid(page, TABLES.parity, "Job 0");
      await page.getByPlaceholder(/Search table/).first().fill("Job 120");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2000);
      await columnMenu(JOB, "amount", /Column settings/);
      const summarySelect = page.getByRole("dialog").getByRole("combobox").last();
      await summarySelect.click();
      await page.getByRole("option", { name: /^Sum$/ }).first().click();
      await page.getByRole("button", { name: /^Save$/ }).last().click();
      await page.waitForTimeout(2500);
      // Every "Queued" job on one page (30 rows at 100 a page), so the sum is over
      // the whole answer and the footer does not say "page": 75,210 (the store says so).
      await page.getByPlaceholder(/Search table/).first().fill("Queued");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2000);
      await page.locator("button[role=combobox]").filter({ hasText: /^20$/ }).first().click().catch(() => {});
      await page.getByRole("option", { name: /^100$/ }).first().click().catch(() => {});
      await page.waitForTimeout(3000);
      const body = await page.evaluate(() => document.body.innerText);
      const footer = (body.match(/SUM[^\n]*\n?[^\n]*\$[0-9,.]+/i) ?? [""])[0].replace(/\s+/g, " ");
      pass("summaries-sum", /75,210/.test(footer) && !/page/i.test(footer), `the footer under Amount reads "${footer}" (expected $75,210.00 over 30 rows)`);
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-8-summary.png` });
    }

    // ── SAVED VIEWS: save one, open it by its address ─────────────────────────────
    if (wants("views")) {
      await openGrid(page, TABLES.calls, "WO-4471");
      await page.getByPlaceholder(/Search table/).first().fill("Invoiced");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2000);
      const saveAs = page.getByRole("button", { name: /Save as view/ }).first();
      let saved = false;
      if ((await saveAs.count()) > 0) {
        await saveAs.click();
        await page.getByPlaceholder("Name this view").fill("Invoiced calls");
        await page.getByRole("button", { name: /^Save$/ }).first().click();
        await page.waitForTimeout(3000);
        saved = true;
      }
      const address = page.url();
      await page.goto(tableUrl(TABLES.calls), { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.waitForTimeout(4000);
      await page.goto(address, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.waitForFunction(() => document.body.innerText.includes("WO-4473"), null, { timeout: 180000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const shown = await page.evaluate(() =>
        [...document.querySelectorAll("[data-cell$='::work_order']")].map((e) => e.textContent?.trim()).join(","),
      );
      const named = (await page.getByText("Invoiced calls").count()) > 0;
      pass("views-saved-and-addressed", saved && named && shown === "WO-4473", `${address.replace(ORIGIN, "")} opens "Invoiced calls" showing ${shown}`);
      // and delete it again, through its own menu
      let deleted = false;
      for (let i = 0; i < 5; i += 1) {
        const options = page.locator('[title="Options for Invoiced calls"]').first();
        if ((await options.count()) === 0) break;
        await options.click();
        await page.getByRole("menuitem", { name: /Delete view/ }).first().click();
        await page.waitForTimeout(600);
        const yes = page.getByRole("button", { name: /^Delete view$/ }).last();
        if ((await yes.count()) === 0) break;
        await yes.click();
        deleted = true;
        await page.waitForTimeout(2500);
      }
      await openGrid(page, TABLES.calls, "WO-4471");
      pass("views-delete", deleted && (await page.getByText("Invoiced calls").count()) === 0, deleted ? "the view is gone after a reload" : "no Delete view");
    }

    // ── PASTE ROWS: a block from a spreadsheet becomes rows, then goes to the archive ─
    if (wants("paste")) {
      await openGrid(page, TABLES.calls, "WO-4471");
      await page.getByRole("button", { name: /^Paste$/ }).first().click();
      await page.waitForTimeout(1000);
      await page.locator("#pasteData").fill("Work order\tStage\nWO-4477\tScheduled\nWO-4478\tDispatched");
      await page.getByRole("button", { name: /^Parse$/ }).click();
      await page.waitForTimeout(1500);
      const go = page.locator("[data-matrx-import-confirm]").first();
      if ((await go.count()) > 0) await go.click();
      await page.waitForTimeout(3500);
      const text = await openGrid(page, TABLES.calls, "WO-4477");
      pass("paste-rows", text.includes("WO-4477") && text.includes("WO-4478"), "two pasted rows are in the table after a reload");
      // archive both through the row menu
      for (const wo of ["WO-4477", "WO-4478"]) {
        await openGrid(page, TABLES.calls, wo);
        const c = page.locator("[data-cell$='::work_order']").filter({ hasText: wo }).first();
        if ((await c.count()) === 0) continue;
        await c.click({ button: "right" });
        await page.waitForTimeout(900);
        await openSubmenu(page, /^Row ·/);
        const del = page.getByRole("menuitem", { name: /Delete row/ }).first();
        if ((await del.count()) === 0) continue;
        await del.click();
        await page.waitForTimeout(800);
        await page.getByRole("dialog").last().getByRole("button", { name: /^Delete/ }).first().click();
        await page.waitForTimeout(2500);
      }
      const after = await openGrid(page, TABLES.calls, "WO-4471");
      pass("paste-rows-archived", !after.includes("WO-4477") && !after.includes("WO-4478"), "the pasted rows are archived again");
    }

    // ── ROW ACTIONS: declare one, run it on a row (the store runs it), undo, remove ─
    if (wants("actions")) {
      const ROW = "71ce7ce1-7e8b-4e17-951d-d815708cb664"; // WO-4474, stage "Dispatched"
      const stage = async () => (await page.locator(`[data-cell="${ROW}::stage"]`).first().innerText().catch(() => "")).trim();
      await openGrid(page, TABLES.calls, "WO-4474");
      const before = await stage();
      await page.locator('[aria-label="Row actions for this table"]').first().click();
      await page.getByRole("menuitem", { name: /Add an action|Manage actions/ }).first().click();
      await page.waitForTimeout(1000);
      await page.getByRole("button", { name: /^Update action$/ }).first().click({ timeout: 15000 });
      await page.locator("#row-action-name").fill("Mark invoiced", { timeout: 15000 });
      await page.getByRole("button", { name: /Add a change/ }).first().click();
      await page.waitForTimeout(500);
      const step = page.locator('button[title="Remove this change"]').first().locator("xpath=..");
      await step.getByRole("combobox").first().click();
      await page.getByRole("option", { name: /^Stage$/ }).first().click();
      await page.waitForTimeout(400);
      await step.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: /^Set to$/ }).first().click();
      await page.waitForTimeout(400);
      await page.locator("#row-action-value-stage").fill("Invoiced", { timeout: 15000 });
      await page.getByRole("button", { name: /^Save action$/ }).first().click();
      await page.waitForTimeout(3000);
      const declared = (await page.getByText("Mark invoiced").count()) > 0;
      pass("actions-declare", declared, declared ? "the action is listed after saving" : "the action did not save");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);

      await openGrid(page, TABLES.calls, "WO-4474");
      // The row's own action button (one icon that opens the list), on WO-4474's row.
      const rowEl = page.locator("tr").filter({ has: page.locator(`[data-cell="${ROW}::stage"]`) }).first();
      await rowEl.locator('button[title="Run an action on this row"]').first().click();
      await page.waitForTimeout(700);
      const run = page.getByRole("menuitem", { name: /Mark invoiced/ }).first();
      const offered = (await run.count()) > 0;
      if (offered) await run.click();
      await page.waitForTimeout(3500);
      const ran = await stage();
      pass("actions-run", offered && ran === "Invoiced", `WO-4474 stage "${before}" → "${ran}" (run by the store)`);
      const undo = page.locator('button[title^="Undo last cell change"]').first();
      if ((await undo.count()) > 0) {
        await undo.click();
        await page.waitForTimeout(2500);
      }
      await openGrid(page, TABLES.calls, "WO-4474");
      const back = await stage();
      pass("actions-undo", back === before, `after Undo and a reload the stage reads "${back}"`);

      // remove the action again
      await page.locator('[aria-label="Row actions for this table"]').first().click();
      await page.getByRole("menuitem", { name: /Manage actions/ }).first().click();
      await page.waitForTimeout(1000);
      const remove = page.getByTitle('Remove "Mark invoiced"').first();
      if ((await remove.count()) > 0) {
        await remove.click();
        await page.waitForTimeout(800);
        const yes = page.getByRole("button", { name: /^(Remove|Delete)/ }).last();
        if ((await yes.count()) > 0) await yes.click();
        await page.waitForTimeout(2500);
      }
      await page.keyboard.press("Escape");
      await openGrid(page, TABLES.calls, "WO-4474");
      await page.locator('[aria-label="Row actions for this table"]').first().click();
      const leftover = await page.getByRole("menuitem", { name: /Manage actions/ }).count();
      await page.keyboard.press("Escape");
      pass("actions-remove", leftover === 0, leftover === 0 ? "no actions left on the table" : "the action is still there");
    }

    // ── SHARE (admin seat): Customers to test@test.com at the level GRID_PORT_SHARE_LEVEL ─
    if (wants("share")) {
      const level = process.env.GRID_PORT_SHARE_LEVEL || "Viewer";
      await openGrid(page, TABLES.customers, "Maria Delgado");
      await page.getByRole("button", { name: /^Share$/ }).first().click();
      await page.waitForTimeout(1500);
      const email = page.locator("#user-email").first();
      let shared = false;
      let said = "";
      if ((await email.count()) > 0) {
        await email.fill("test@test.com");
        await page.waitForTimeout(800);
        // A candidate list may be open under the field: close it by clicking the
        // level picker rather than pressing Enter over it.
        await page.locator("#user-permission").click();
        await page.getByRole("option", { name: new RegExp(`^${level}`) }).first().click();
        await page.waitForTimeout(400);
        await page.getByRole("button", { name: /Share with User/ }).first().click();
        await page.waitForTimeout(4000);
        said = (await page.getByRole("dialog").last().innerText().catch(() => "")).replace(/\s+/g, " ");
        shared = /test@test\.com|shared|granted|access/i.test(said);
      }
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-10-share-${level.toLowerCase()}.png` });
      pass(`share-${level.toLowerCase()}`, shared, shared ? `the dialog now lists test@test.com (${level})` : `the share did not go through: ${said.slice(0, 200)}`);
      await page.keyboard.press("Escape");
    }

    // ── THE OTHER SEAT (test@test.com): what a viewer and an editor may do ────────
    if (wants("seat")) {
      const ROW_CELL = page.locator("[data-cell$='::household']").filter({ hasText: "Maria Delgado" }).first();
      const text = await openGrid(page, TABLES.customers, "Maria Delgado");
      pass("seat-opens-shared-table", text.includes("Maria Delgado") && onTable(page.url(), TABLES.customers), "the shared table opens in the grid from the non-admin seat");
      const readOnly = /Shared Table/.test(text) && /read only/i.test(text);
      const expectEditor = (process.env.GRID_PORT_EXPECT || "viewer") === "editor";
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-11-${expectEditor ? "editor" : "viewer"}.png` });
      if (!expectEditor) {
        pass("seat-viewer-read-only", readOnly, readOnly ? "the grid says Shared Table (read only)" : "no read-only banner");
        await ROW_CELL.dblclick().catch(() => {});
        await page.keyboard.type("x");
        await page.waitForTimeout(1500);
        const after = await openGrid(page, TABLES.customers, "Maria Delgado");
        pass("seat-viewer-cannot-write", after.includes("Maria Delgado") && !after.includes("Maria Delgadox"), "typing into a cell changed nothing");
      } else {
        pass("seat-editor-not-read-only", !readOnly, readOnly ? "still read-only" : "no read-only banner for an editor");
        await ROW_CELL.dblclick();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type("Maria Delgado (tenant)");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2500);
        const edited = await openGrid(page, TABLES.customers, "Maria Delgado (tenant)");
        pass("seat-editor-writes", edited.includes("Maria Delgado (tenant)"), "an editor's edit persists");
        const again = page.locator("[data-cell$='::household']").filter({ hasText: "Maria Delgado (tenant)" }).first();
        await again.dblclick();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type("Maria Delgado");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2500);
        const back = await openGrid(page, TABLES.customers, "Maria Delgado");
        pass("seat-editor-put-back", back.includes("Maria Delgado") && !back.includes("(tenant)"), "the household name is put back");
      }
    }

    // ── LIVE: an edit in one window appears in another without a reload ──────────
    if (wants("live")) {
      const ROW = "e5d565a8-24aa-471c-94d9-f93e78c91994"; // WO-4475
      const other = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
      other.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await signIn(other);
      await chooseWorkspace(other);
      await openGrid(other, TABLES.calls, "WO-4475");
      await openGrid(page, TABLES.calls, "WO-4475");
      const cellA = page.locator(`[data-cell="${ROW}::stage"]`).first();
      const before = (await cellA.innerText()).trim();
      await cellA.dblclick();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("Scheduled - tech en route");
      await page.keyboard.press("Enter");
      const seen = await other
        .waitForFunction((r) => document.querySelector(`[data-cell="${r}::stage"]`)?.textContent?.includes("tech en route"), ROW, { timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      pass("live-other-window", seen, seen ? "the other window shows the edit within 15 s, no reload" : "the other window never showed it");
      await other.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-12-live-other-window.png` });
      await cellA.dblclick();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type(before);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2500);
      await other.close();
    }

    // ── HISTORY RESTORE: put a row back to an earlier version from its history ────
    if (wants("restore")) {
      const ROW = "388a4759-6b92-4af4-90d4-0b0f3feef4ea"; // WO-4473, stage "Invoiced"
      const cellS = () => page.locator(`[data-cell="${ROW}::stage"]`).first();
      await openGrid(page, TABLES.calls, "WO-4473");
      const before = "Invoiced";
      if ((await cellS().innerText()).trim() !== before) {
        // A run that stopped half-way left its edit; put the real value back first.
        await cellS().dblclick();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type(before);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2500);
      }
      await cellS().dblclick();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("Invoiced - paid by check");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2500);
      await rowMenu(cellS(), /Row history/);
      await page.waitForTimeout(3000);
      // The newest entry is the edit just made; "Revert" on its Stage line puts the old value back.
      const revert = page.locator('button[title^="Set \\"Stage\\" back to"]').first();
      const offered = (await revert.count()) > 0;
      if (offered) {
        await revert.click();
        await page.waitForTimeout(3000);
      }
      await page.keyboard.press("Escape");
      await openGrid(page, TABLES.calls, "WO-4473");
      const after = (await cellS().innerText()).trim();
      pass("history-revert", offered && after === before, offered ? `after Revert the stage reads "${after}" (was "${before}")` : "no Revert in the row's history");
      if (after !== before) {
        await cellS().dblclick();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type(before);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2500);
      }
    }

    // ── COLOR BY A CHOICE COLUMN: every row wears its Status color, then stops ────
    if (wants("colorby")) {
      const JOB = "e3519c02-ebab-4d83-84ae-15f801480f20"; // Job 120, Status "Queued"
      const findJob = async () => {
        await openGrid(page, TABLES.parity, "Job 0");
        await page.getByPlaceholder(/Search table/).first().fill("Job 120");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2000);
      };
      await findJob();
      await columnMenu(JOB, "status", /^Color rows by this column/);
      await page.waitForTimeout(2500);
      await openGrid(page, TABLES.parity, "Job 0");
      const tinted = await page.evaluate(() =>
        [...document.querySelectorAll("tr")].filter((tr) => /bg-(green|amber|red|blue|violet|teal|slate)-(50|100)/.test(tr.className)).length,
      );
      pass("colorby-choice", tinted >= 10, `${tinted} rows wear their Status color after a reload`);
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-13-color-by-status.png` });
      await findJob();
      await columnMenu(JOB, "status", /^Stop coloring|^Color rows by this column/);
      await page.waitForTimeout(2500);
      await openGrid(page, TABLES.parity, "Job 0");
      const still = await page.evaluate(() =>
        [...document.querySelectorAll("tr")].filter((tr) => /bg-(green|amber|red|blue|violet|teal|slate)-(50|100)/.test(tr.className)).length,
      );
      pass("colorby-stop", still === 0, `${still} tinted rows after turning it off`);
    }

    // ── ROW LABEL: a column names the rows, then the work order does again ───────
    if (wants("rowlabel")) {
      const ROW = "cfc72430-2dbf-40d6-980d-f6e5efdeab3d"; // WO-4471, stage "On site"
      const setLabel = async (field, on) => {
        await openGrid(page, TABLES.calls, "WO-4471");
        await columnMenu(ROW, field, /Column settings/);
        const box = page.getByRole("dialog").last().locator("label").filter({ hasText: "Names the rows" }).locator("button[role=checkbox]").first();
        const checked = (await box.getAttribute("data-state")) === "checked";
        if (checked !== on) await box.click();
        await page.getByRole("button", { name: /^Save$/ }).last().click();
        await page.waitForTimeout(3000);
      };
      await setLabel("stage", true);
      await openGrid(page, TABLES.calls, "WO-4471");
      await page.locator(`[data-cell="${ROW}::stage"]`).first().click({ button: "right" });
      await page.waitForTimeout(900);
      const named = (await page.getByRole("menuitem", { name: /^Row · On site/ }).count()) > 0;
      await page.keyboard.press("Escape");
      pass("rowlabel-set", named, named ? 'the row is now named "On site" (its Stage)' : "the row is not named by Stage");
      await setLabel("work_order", true);
      await openGrid(page, TABLES.calls, "WO-4471");
      await page.locator(`[data-cell="${ROW}::stage"]`).first().click({ button: "right" });
      await page.waitForTimeout(900);
      const back = (await page.getByRole("menuitem", { name: /^Row · WO-4471/ }).count()) > 0;
      await page.keyboard.press("Escape");
      pass("rowlabel-back", back, back ? "the work order names the row again" : "the label did not come back");
    }

    // ── LAYOUT: row height from the Layout menu, kept in the address ──────────────
    if (wants("layout")) {
      const ROW = "cfc72430-2dbf-40d6-980d-f6e5efdeab3d";
      await openGrid(page, TABLES.calls, "WO-4471");
      const heightOf = async () =>
        page.locator(`[data-cell="${ROW}::stage"]`).first().evaluate((el) => el.closest("tr")?.getBoundingClientRect().height ?? 0);
      const normal = await heightOf();
      await page.getByRole("button", { name: /^Layout$/ }).first().click();
      await page.getByRole("radio", { name: /^Tall$/ }).first().click();
      await page.waitForTimeout(1500);
      await page.keyboard.press("Escape");
      const address = page.url();
      await page.goto(address, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.waitForFunction(() => document.body.innerText.includes("WO-4471"), null, { timeout: 180000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const tall = await heightOf();
      pass("layout-row-height", tall > normal + 4, `row ${Math.round(normal)}px → ${Math.round(tall)}px, kept in ${address.replace(ORIGIN, "")}`);
      await page.goto(tableUrl(TABLES.calls), { waitUntil: "domcontentloaded", timeout: 240000 });
    }

    // ── THE OLDER HALF STILL RUNS: an older table, through the older doors only ──
    if (wants("older")) {
      const doors = [];
      const listen = (r) => {
        const m = r.url().match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/);
        if (m) doors.push(`${r.headers()["content-profile"] ?? "public"}.${m[1]}`);
      };
      page.on("request", listen);
      const text = await openGrid(page, TABLES.olderExample, "Product");
      await page.waitForTimeout(2000);
      page.off("request", listen);
      // The route asks the record store WHERE the table lives before anything is read
      // (VERIFIER-16); those lookups are allowed. The grid's DATA must come from the older store.
      const lookupDoors = new Set(["custom.table_kernel_id", "custom.read_records_by_ids", "custom.record_resolve"]);
      const storeDoors = doors.filter((d) => d.startsWith("custom.") && !lookupDoors.has(d));
      console.log(`older table: store lookups ${doors.filter((d) => lookupDoors.has(d)).length}, other store doors: ${[...new Set(storeDoors)].join(", ")}`);
      pass("older-reads", /Example: Product Catalog/.test(text) && onTable(page.url(), TABLES.olderExample) && /of 8 rows/.test(text), "the older example table opens in the grid, 8 rows");
      pass("older-read-only-example", /Shared Table/.test(text) || /read only/i.test(text), "an example table stays read-only for everyone");
      pass("older-uses-older-doors", doors.includes("public.get_user_table_data_paginated_v2") && storeDoors.length === 0,
        `record-store doors: ${storeDoors.length}${storeDoors.length ? ` (${[...new Set(storeDoors)].join(", ")})` : ""}; older page door seen: ${doors.includes("public.get_user_table_data_paginated_v2")}`);
    }

    // ── EXPORT: the whole table as CSV, through the same read the grid uses ──────
    if (wants("export")) {
      await openGrid(page, TABLES.calls, "WO-4471");
      await page.evaluate(() => {
        window.__copied = [];
        navigator.clipboard.writeText = async (t) => { window.__copied.push(String(t)); };
        navigator.clipboard.write = async (items) => {
          for (const it of items) for (const type of it.types) window.__copied.push(await (await it.getType(type)).text());
        };
      });
      await page.locator('[aria-label^="Copy, transform or export"]').first().click();
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: /^Copy CSV$/ }).first().click();
      await page.waitForTimeout(2500);
      const copied = (await page.evaluate(() => window.__copied)).join("\n");
      const lines = copied.split(/\r?\n/).filter(Boolean);
      const hasAll = ["WO-4471", "WO-4472", "WO-4473", "WO-4474", "WO-4475"].every((w) => copied.includes(w));
      const words = /Maria Delgado|Harbor View|Takeda/.test(copied);
      pass("export-csv", hasAll && words && /Work order/.test(lines[0] ?? ""), `CSV of ${lines.length - 1} rows, headed "${(lines[0] ?? "").slice(0, 60)}", customers as names: ${words}`);
      await page.keyboard.press("Escape");
    }

    // ── COLOR RULES: "Stage is Invoiced → amber row", then removed ────────────────
    if (wants("colorrules")) {
      const ROW = "388a4759-6b92-4af4-90d4-0b0f3feef4ea"; // WO-4473, stage "Invoiced"
      const tintOf = async () =>
        page.locator(`[data-cell="${ROW}::stage"]`).first().evaluate((el) => el.closest("tr")?.className ?? "");
      await openGrid(page, TABLES.calls, "WO-4473");
      await page.getByRole("button", { name: /^Colors$/ }).first().click();
      await page.waitForTimeout(1000);
      await page.getByRole("button", { name: /^Add rule$/ }).first().click();
      await page.waitForTimeout(400);
      await page.locator('[aria-label="Column"]').last().click();
      await page.getByRole("option", { name: /^Stage$/ }).first().click();
      await page.waitForTimeout(400);
      await page.locator('input[aria-label="Value"]').last().fill("Invoiced");
      await page.getByRole("button", { name: /^Save rules$/ }).first().click();
      await page.waitForTimeout(3000);
      await openGrid(page, TABLES.calls, "WO-4473");
      const tinted = await tintOf();
      pass("colorrules-paint", /bg-amber-50/.test(tinted), /bg-amber-50/.test(tinted) ? "WO-4473 wears the rule's amber after a reload" : `row class: ${tinted.slice(0, 120)}`);
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-14-color-rule.png` });
      await page.getByRole("button", { name: /^Colors$/ }).first().click();
      await page.waitForTimeout(1000);
      for (let i = 0; i < 5; i += 1) {
        const rm = page.locator('[aria-label="Remove rule"]').first();
        if ((await rm.count()) === 0) break;
        await rm.click();
        await page.waitForTimeout(300);
      }
      await page.getByRole("button", { name: /^Save rules$/ }).first().click();
      await page.waitForTimeout(3000);
      await openGrid(page, TABLES.calls, "WO-4473");
      const cleared = await tintOf();
      pass("colorrules-remove", !/bg-amber-50/.test(cleared), "the rule is gone after a reload");
    }

    // ── A ROW CHANGE RUNS AN AGENT (G8): make the schedule from the grid, then fire it ─
    // Harbor Point's office manager asks for the invoice agent whenever a service call's
    // Status changes; closing CALL-2291 in the grid must queue exactly one run.
    if (wants("rowchange")) {
      if (!TABLES.harborCalls) throw new Error("GRID_PORT_HARBOR_CALLS must name Harbor Point's Service calls table");
      const hp = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
      hp.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      hp.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
      await signIn(hp);
      await hp.goto(`${ORIGIN}/data`, { waitUntil: "domcontentloaded", timeout: 240000 });
      const choose = hp.getByText("Choose org", { exact: true }).first();
      await choose.waitFor({ timeout: 60000 }).catch(() => {});
      await choose.click();
      await hp.getByRole("option").filter({ hasText: "Harbor Point Plumbing & Drain" }).first().click();
      await hp.waitForTimeout(2500);
      await openGrid(hp, TABLES.harborCalls, "CALL-2291");
      await hp.locator('[aria-label="Row actions for this table"]').first().click();
      const item = hp.getByRole("menuitem", { name: /When a row changes, run an agent/ }).first();
      const offered = (await item.count()) > 0;
      pass("rowchange-offered", offered, offered ? "the grid offers it on a record-store table (the store has G8)" : "the item is absent");
      if (offered) {
        await item.click();
        await hp.waitForURL(/\/schedules\/new/, { timeout: 120000 });
        await hp.waitForTimeout(3000);
        const url = hp.url();
        const formText = await hp.evaluate(() => document.body.innerText);
        pass("rowchange-form", url.includes(`entityType=custom_record%3A${TABLES.harborCalls}`) && /The table you opened this from/.test(formText) && /A row is changed/.test(formText),
          "the schedule form opens on this table with the store's change words");
        await hp.locator("#title").fill("Draft the invoice when a service call is complete");
        await hp.getByRole("checkbox").filter({ has: hp.locator("xpath=..") }).first().waitFor().catch(() => {});
        await hp.locator("label").filter({ hasText: "A row is changed" }).locator("button[role=checkbox]").first().click();
        await hp.locator("#ev-fields").fill("status");
        await hp.locator("#prompt").fill("The service call in this event changed status. If it now reads Complete, draft the invoice from its labor hours and parts used.");
        // The form posts the schedule to the Python server's /scheduler/tasks. The trigger it
        // sends is what this clause judges; on a clone-backed server that server is
        // production's and refuses a clone-minted session (401), so the SAME config is then
        // written the way that server writes it (GRID_PORT_SCHEDULE_OUT) and the grid half runs.
        let posted = null;
        hp.on("request", (r) => {
          if (/\/scheduler\/tasks$/.test(r.url()) && r.method() === "POST") {
            try { posted = JSON.parse(r.postData() ?? "null"); } catch { posted = null; }
          }
        });
        await hp.getByRole("button", { name: /Create schedule/ }).first().click();
        await hp.waitForTimeout(4000);
        const trig = posted?.trigger ?? posted?.triggers?.[0] ?? null;
        const cfg = trig?.config ?? trig ?? {};
        pass("rowchange-trigger-built", cfg.entity_type === `custom_record:${TABLES.harborCalls}` && cfg.table_id === TABLES.harborCalls && JSON.stringify(cfg.actions) === '["record.updated"]' && JSON.stringify(cfg.changed_fields) === '["status"]',
          `the form sends ${JSON.stringify(cfg).slice(0, 220)}`);
        if (process.env.GRID_PORT_SCHEDULE_OUT) writeFileSync(process.env.GRID_PORT_SCHEDULE_OUT, JSON.stringify(posted, null, 2));
        await hp.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-15-row-change-schedule.png` });
        if (process.env.GRID_PORT_STOP_AFTER_FORM === "1") {
          await hp.close();
          throw new Error("stopped after the form, as asked (GRID_PORT_STOP_AFTER_FORM)");
        }

        // A notes change must not fire it; CALL-2291 to Complete must.
        await openGrid(hp, TABLES.harborCalls, "CALL-2291");
        // The row id of a call, read off its Call cell, so every cell is addressed by its key.
        const idOf = async (call) =>
          hp.evaluate((c) => {
            const cell = [...document.querySelectorAll("[data-cell$='::call_number']")].find((e) => (e.textContent ?? "").includes(c));
            return cell?.getAttribute("data-cell")?.split("::")[0] ?? "";
          }, call);
        const callId = await idOf("CALL-2291");
        if (!callId) {
          const seen = await hp.evaluate(() => [...document.querySelectorAll("[data-cell$='::call_number']")].map((e) => JSON.stringify(e.textContent)).join(" | "));
          throw new Error(`CALL-2291 is not on the Harbor Point grid; call cells read: ${seen.slice(0, 300)}; url ${hp.url()}`);
        }
        const rowOf = () => ({ locator: (sel) => hp.locator(`[data-cell="${callId}::${sel.match(/::([a-z_]+)/)[1]}"]`) });
        const notes = rowOf("CALL-2291").locator("[data-cell$='::tech_notes']").first();
        await notes.dblclick();
        await hp.keyboard.press("ControlOrMeta+a");
        await hp.keyboard.type("Water heater T&P valve replaced; customer shown the shutoff");
        await hp.keyboard.press("Enter");
        await hp.waitForTimeout(2500);
        // A choice cell: the first click selects it, the second opens its chooser, and the
        // option is CLICKED — never Enter with a picker open (it types into the grid instead).
        const status = rowOf("CALL-2291").locator("[data-cell$='::status']").first();
        // Nothing else may be open first (the organization list stays in the page after it was used).
        await hp.keyboard.press("Escape");
        const chooserButton = status.locator("button").first();
        // One click selects the cell or, on a selected one, opens the chooser; a second only if needed.
        await chooserButton.click();
        await hp.waitForTimeout(900);
        if ((await hp.getByRole("option", { name: /^Complete$/ }).count()) === 0) {
          await status.locator("button").first().click();
          await hp.waitForTimeout(900);
        }
        const complete = hp.getByRole("option", { name: /^Complete$/ }).first();
        const picked = (await complete.count()) > 0;
        if (!picked) console.log("chooser shows:", await hp.evaluate(() => [...document.querySelectorAll("[cmdk-item],[role=combobox],[cmdk-empty]")].map((e) => (e.getAttribute("role") || "empty") + ":" + e.textContent?.trim().slice(0, 30)).join(" / ")));
        if (picked) await complete.click();
        else await hp.keyboard.press("Escape");
        await hp.waitForTimeout(3000);
        pass("rowchange-status-picked", picked, picked ? "Complete picked from the Status chooser" : "the Status chooser did not open");
        await openGrid(hp, TABLES.harborCalls, "CALL-2291");
        const now = (await rowOf("CALL-2291").locator("[data-cell$='::status']").first().innerText()).trim();
        pass("rowchange-status-written", /Complete/.test(now), `CALL-2291 status reads "${now}"`);
        await hp.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-16-call-complete.png` });
      }
      await hp.close();
    }

    // ── A TABLE THAT WAS NOT SHARED WITH YOU (test seat, VERIFIER-16 finding 1) ────
    if (wants("unshared")) {
      const olderReads = [];
      const listen = (r) => { if (/\/rpc\/get_full_table$/.test(r.url())) olderReads.push(r.url()); };
      page.on("request", listen);
      await page.goto(tableUrl(TABLES.calls), { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.waitForFunction(() => /not been shared with you|in neither|could not find out/.test(document.body.innerText), null, { timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(2000);
      page.off("request", listen);
      const text = await page.evaluate(() => document.body.innerText);
      await page.screenshot({ path: `${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-17-not-shared-with-you.png` });
      pass("unshared-says-so", /has not been shared with you/.test(text) && /nobody has shared it with you yet/.test(text), (text.match(/This table[^\n]*\n?[^\n]*/) ?? [""])[0].replace(/\s+/g, " ").slice(0, 200));
      pass("unshared-no-raw-id", !text.includes(TABLES.calls), text.includes(TABLES.calls) ? "the raw id is on the screen" : "no raw id on the screen");
      pass("unshared-no-older-read", olderReads.length === 0, `older get_full_table reads: ${olderReads.length}`);
      pass("unshared-no-deleted-sentence", !/may have been deleted|in neither/.test(text), "no sentence about deletion or 'in neither store'");
    }

    // ── /data REDIRECTS NOTHING (owner's ruling 2026-09-23: "don't redirect anything at all
    // right now"). The older route opens the older viewer; it never lands on /data-v2 and
    // never says a table moved — old and new are compared side by side.
    if (wants("noredirect")) {
      await page.goto(`${ORIGIN}/data/${TABLES.calls}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.waitForTimeout(12000);
      const url = page.url();
      const text = await page.evaluate(() => document.body.innerText);
      await page.screenshot({ path: `${OUT}/gridport-${SEAT}-19-data-redirects-nothing.png` });
      pass("noredirect-stays", url.includes(`/data/${TABLES.calls}`) && !url.includes("/data-v2"), url.replace(ORIGIN, ""));
      pass("noredirect-no-moved-sentence", !/moved to its new home|have moved to the new data home|has moved/i.test(text), "no sentence about a move");
      await page.goto(`${ORIGIN}/data`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.waitForTimeout(8000);
      const list = await page.evaluate(() => document.body.innerText);
      pass("noredirect-list-quiet", !/moved to the new data home/.test(list) && (await page.locator("[data-moved-tables]").count()) === 0, "the /data list says nothing about a move");
    }

    const onClone = String(process.env.GRID_PORT_ON_CLONE || "") === "1";
    const python = /https:\/\/(server\.app|files)\.matrxserver\.com\//;
    // By design, /data/<id> asks the OLDER store first; for a table only the record
    // store lets this person see, that door refuses (P0002, which PostgREST sends
    // as a 500) and the route then finds the table in the record store. Named here
    // so it is counted once as what it is and never hides anything else.
    const olderFirst = /^500 https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/rpc\/get_full_table$/;
    // The record store's own answer "this exists and you may not open it" is a 42501 from
    // custom.record_resolve, which PostgREST sends as 403 — the route's no-access lookup.
    const notSharedAnswer = /^403 https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/rpc\/record_resolve$/;
    const excused = bad.filter((b) => (onClone && b.startsWith("401 ") && python.test(b.slice(4))) || olderFirst.test(b) || notSharedAnswer.test(b));
    const counted = bad.filter((b) => !excused.includes(b));
    const countedErrors = errors.filter(
      (e) =>
        !(onClone && /status of 401|ambient\.page_guidance failed to resolve: Authentication required/.test(e)) &&
        !(excused.some((b) => b.startsWith("500 ")) && /status of 500/.test(e)) &&
        !(excused.some((b) => b.startsWith("403 ")) && /status of 403/.test(e)),
    );
    pass("quiet", countedErrors.length === 0 && counted.length === 0,
      `console errors ${countedErrors.length}, responses>=400 ${counted.length}` +
      (excused.length ? ` (plus ${excused.length} expected: production's Python server refusing a clone-minted session, and the older store's refusal of a table it does not hold)` : ""));
    if (countedErrors.length) console.log(countedErrors.slice(0, 8).join("\n"));
    if (counted.length) console.log(counted.slice(0, 8).join("\n"));
  } finally {
    await browser.close();
  }
  writeFileSync(`${OUT}/gridport-${SURFACE === "sheet" ? "sheet-" : ""}${SEAT}-walk.json`, JSON.stringify({ clauses, errors: errors.slice(0, 20), bad: bad.slice(0, 20) }, null, 2));
  const failed = Object.entries(clauses).filter(([, c]) => !c.ok).map(([n]) => n);
  console.log(failed.length ? `FAILED: ${failed.join(", ")}` : "ALL CLAUSES PASS");
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(2); });

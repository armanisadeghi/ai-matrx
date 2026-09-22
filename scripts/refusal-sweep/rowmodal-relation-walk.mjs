/**
 * REFUSAL-SWEEP item 3 — the headless proof, on the REAL Rincon Plumbing & Drain
 * dispatch board, from the admin seat.
 *
 * Rincon Plumbing & Drain is a 14-van plumbing contractor in Ventura County whose
 * dispatch board is one of the OLDER user-defined data tables (`workbench.udt_*`).
 * Its Service Calls table has a `customer` column in the `relation` format,
 * pointing at the Customers table. OLD-TABLES-2's W3 wave fixed the GRID, the
 * filter checklist and the agent scope; the ROW MODAL still showed the dispatcher
 * a raw uuid and offered a picker with no options in it.
 *
 * WHAT THIS WALK MEASURES, on the live store, signed in as admin@admin.com:
 *   1  the seat is the test admin (never Arman's account)
 *   2  the GRID's own relation picker — what names it offers
 *   3  the ROW MODAL's Customer field reads WORDS, not an identifier
 *   4  ZERO full uuids anywhere on screen while the modal is open
 *   5  the modal's picker opens and offers THE SAME names the grid's picker offers
 *
 * Headless only. It drives the ONE dev server this machine allows.
 *
 *   node scripts/refusal-sweep/rowmodal-relation-walk.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { signIn, sleep } from "../lib/seat-browser.mjs";

// The lane's allocated campaign port is 3057, but this machine allows exactly ONE
// Next dev server (a PreToolUse hook refuses a second: 16GB, two is a hard crash),
// and the live one is the shared `preview:start` server on 3001. The walk takes its
// OWN hostname so its cookie jar is its own and no other agent's session is evicted.
const PORT = process.env.WALK_PORT ?? "3001";
/** This walk's own hostname: cookies are per host, so a peer lane's session is never touched. */
const ORIGIN = `http://refusalsweep3.localhost:${PORT}`;
/** Rincon Plumbing & Drain — Service Calls (the dispatch board). */
const CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
const SHOT = `${OUT}/refusal-rowmodal-relation.png`;
mkdirSync(OUT, { recursive: true });

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Credentials come from the repo's env files; never printed. */
function adminCredentials() {
  const files = [".env.local", ".env", "../aidream/.env"];
  const out = {};
  for (const f of files) {
    let text;
    try {
      text = readFileSync(resolve(process.cwd(), f), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const m = /^\s*(AI_ADMIN_USERNAME|AI_ADMIN_PASSWORD)\s*=\s*(.*)$/.exec(line);
      if (m && !out[m[1]]) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return {
    email: process.env.AI_ADMIN_USERNAME || out.AI_ADMIN_USERNAME,
    password: process.env.AI_ADMIN_PASSWORD || out.AI_ADMIN_PASSWORD,
  };
}

/** The option names a cmdk list is currently offering. */
async function optionsOnScreen(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[cmdk-item]'))
      .map((el) => (el.textContent || "").trim())
      .filter(Boolean),
  );
}

const found = {};
const errors = [];
const bad = [];

async function main() {
  const { email, password } = adminCredentials();
  if (!email || !password) throw new Error("no admin credentials in the environment");

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });

  // ── 1 · the seat ────────────────────────────────────────────────────────────
  found.seat = await signIn(page, ORIGIN, email, password);
  console.log("[walk] seat:", found.seat);
  if (found.seat !== "admin@admin.com") throw new Error(`wrong seat: ${found.seat}`);

  await page.goto(`${ORIGIN}/data/${CALLS}?ps=50`, {
    waitUntil: "domcontentloaded",
    timeout: 240000,
  });
  await page.waitForFunction(() => document.body.innerText.includes("WO-4471"), null, {
    timeout: 240000,
  });
  await sleep(3000);

  const gridText = await page.evaluate(() => document.body.innerText);
  found.gridFullUuids = (gridText.match(UUID) || []).length;

  // ── 2 · WHAT THE GRID'S OWN PICKER OFFERS ───────────────────────────────────
  // The Customer cell of WO-4471, opened for editing: the same `ChoiceInput` the
  // row modal draws. Its option list is the bar the modal has to match.
  const customerColumn = await page.evaluate(() => {
    const heads = Array.from(document.querySelectorAll("table thead th"));
    return heads.findIndex((th) => (th.textContent || "").trim().startsWith("Customer"));
  });
  found.customerColumn = customerColumn;
  if (customerColumn < 0) throw new Error("no Customer column on the dispatch board");

  const gridCell = page.locator(`table tbody tr:has-text("WO-4471") td`).nth(customerColumn);
  found.gridCellText = (await gridCell.innerText()).trim();
  // A CHOICE COLUMN IS A DIRECT-CLICK EDITOR: the cell draws its own combobox in
  // the read view and opens on a single click (the <td>'s double-click handler
  // says so in as many words). NEVER a keyboard Enter here — with the list open
  // Enter PICKS the highlighted option, which is a real write to a real board.
  // A choice column is a DIRECT-CLICK editor: the cell draws its own control in
  // the read view and one click on it opens the picker. NEVER a keyboard Enter
  // here — with the list open Enter PICKS the highlighted option, which is a real
  // write to a real dispatch board (this walk did exactly that once, and the row
  // was put back through the product's own write path).
  const gridControl = gridCell.locator("button").first();
  await gridControl.click();
  await sleep(2200);
  found.gridPickerOptions = await optionsOnScreen(page);
  console.log("[walk] the grid's picker offers:", JSON.stringify(found.gridPickerOptions));
  // Closing without picking commits nothing: `commitEdit` skips a write when the
  // value is unchanged. Proven below by re-reading the cell.
  await page.keyboard.press("Escape");
  await sleep(1200);
  found.gridCellTextAfter = (await gridCell.innerText()).trim();

  // ── 3 & 4 · THE ROW MODAL ───────────────────────────────────────────────────
  const row = page.locator(`table tbody tr:has-text("WO-4471")`).first();
  await row.hover();
  await sleep(300);
  await row.locator('button[title="Edit Row"]').first().click();
  await page.waitForSelector('[role="dialog"]', { timeout: 60000 });
  await sleep(1800);

  found.modalCustomerField = (
    await page.locator('[role="dialog"] #customer').first().innerText()
  ).trim();
  const modalText = await page.evaluate(() => document.body.innerText);
  found.modalFullUuids = (modalText.match(UUID) || []).length;
  found.modalUuidSamples = (modalText.match(UUID) || []).slice(0, 3);
  console.log("[walk] the modal's Customer field reads:", JSON.stringify(found.modalCustomerField));
  console.log("[walk] full uuids on screen with the modal open:", found.modalFullUuids);

  await page.screenshot({ path: SHOT });
  console.log("[walk] shot:", SHOT);

  // ── 5 · THE MODAL'S PICKER, AGAINST THE GRID'S ──────────────────────────────
  await page.locator('[role="dialog"] #customer').first().click();
  await sleep(1500);
  found.modalPickerOptions = await optionsOnScreen(page);
  console.log("[walk] the modal's picker offers:", JSON.stringify(found.modalPickerOptions));

  const asSet = (a) => [...new Set(a)].sort();
  found.pickersAgree =
    asSet(found.modalPickerOptions).join("|") === asSet(found.gridPickerOptions).join("|");

  found.consoleErrors = errors.length;
  found.badResponses = bad.length;

  await browser.close();

  // ── the verdict ─────────────────────────────────────────────────────────────
  const clauses = [
    ["the seat is admin@admin.com", found.seat === "admin@admin.com"],
    [
      "the modal's Customer field reads WORDS, not an identifier",
      found.modalCustomerField.length > 0 &&
        !UUID.test(found.modalCustomerField) &&
        !/^Record [0-9a-f]{8}$/.test(found.modalCustomerField) &&
        found.modalCustomerField !== "Select…",
    ],
    ["0 full uuids on screen with the row modal open", found.modalFullUuids === 0],
    ["the grid's picker offered names at all", found.gridPickerOptions.length > 0],
    ["the modal's picker opened and offered names", found.modalPickerOptions.length > 0],
    ["both pickers offer THE SAME names", found.pickersAgree],
    [
      "the walk changed nothing on the board",
      found.gridCellTextAfter === found.gridCellText,
    ],
    ["0 responses >= 400", found.badResponses === 0],
  ];
  console.log("\n" + JSON.stringify(found, null, 2) + "\n");
  let failed = 0;
  for (const [what, ok] of clauses) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
    if (!ok) failed += 1;
  }
  if (errors.length) console.log("console errors:", JSON.stringify(errors.slice(0, 5)));
  if (bad.length) console.log("bad responses:", JSON.stringify(bad.slice(0, 5)));
  console.log(`\n${clauses.length - failed}/${clauses.length} clauses green`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[walk] FAILED:", e.message);
  process.exit(1);
});

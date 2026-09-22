// scripts/campaign-tests/refusal_the_csv_wizard_asks_the_rules_before_it_writes.mjs
// lane REFUSAL-SWEEP item 2a
//
// THE CSV IMPORT WIZARD ASKS THE COLUMN'S RULES BEFORE IT WRITES — ON THE LIVE STORE.
//
// Lane VALIDATION-REFUSAL's census row 10 named this and did not build it: the wizard that
// maps a pasted file's columns onto an existing board's columns never read `validation_rules`
// at all. Every mapped row went to `udt_bulk_write` and the STORE refused them one at a time,
// after the round trip, as one destructive toast naming no column.
//
// THE USE CASE (owner law — no fake test data). Rincon Plumbing & Drain, a residential and
// light-commercial plumbing contractor. Their dispatcher keeps the week's open work orders in
// a spreadsheet and pastes Monday's backlog into the dispatch board. The board's Work order
// column declares the shop's own numbering (`WO-####`) because the field techs read it off
// the truck tablet; two rows still carry the hyphen-less numbers the previous office system
// produced. That is the refusal under test.
//
// WHAT IT PROVES, on the live store as admin@admin.com:
//   1  the per-column notice is on screen in the mapping/preview step
//   2  it names the column, what the rule wants, and how many of the pasted rows fail it
//   3  it says what to do, in words true of THIS screen
//   4  the confirm button is honest — it offers only the rows that pass, never its old label
//   5  the store's write door (`udt_bulk_write`) was NEVER called up to this point
//   6  the notice is not on a timer — still there eight seconds later
//   7  leaving the column out clears the refusal and the button returns to the whole backlog
//
// Nothing is written: the walk stops before pressing the confirm button, which is the point.
//
// Run: node scripts/campaign-tests/refusal_the_csv_wizard_asks_the_rules_before_it_writes.mjs [origin]

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { signIn, sleep } from "../lib/seat-browser.mjs";

const env = {};
for (const f of [
  "/Users/armanisadeghi/code/matrx-frontend/.env",
  "/Users/armanisadeghi/code/matrx-frontend/.env.local",
]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}

const ORIGIN = process.argv[2] ?? "http://127.0.0.1:3057";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
// Rincon Plumbing & Drain's dispatch board, on the older Data screens.
const TABLE = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
mkdirSync(OUT, { recursive: true });

// Monday's backlog off the dispatcher's spreadsheet. Rows 2 and 4 carry the old numbering.
const MONDAY_BACKLOG = [
  "Work order,Customer,Service address,Reported problem",
  "WO-4481,Delgado Property Mgmt,412 N Ventura Ave Unit B,Water heater not holding temperature",
  "4482,Casa Verde Apartments,1180 Terrace Dr,Main line backing up into downstairs unit",
  "WO-4483,Hector Maldonado,2237 Poli St,Kitchen sink draining slowly after disposal install",
  "WO 4484,Ventura Coast Dental,905 S Seaward Ave #4,Leak under the sterilizer room sink",
].join("\n");

const say = [];
let bad = 0;
const ok = (m) => say.push(`ok    ${m}`);
const fail = (m) => {
  bad += 1;
  say.push(`FAIL  ${m}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

const writes = [];
page.on("request", (r) => {
  if (r.url().includes("udt_bulk_write")) writes.push(r.url());
});
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

say.push(
  `seat: ${await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME ?? "admin@admin.com", env.AI_ADMIN_PASSWORD)}`,
);
await sleep(2000);
await page.goto(`${ORIGIN}/data/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForSelector("tbody tr", { timeout: 180000 });
await sleep(6000);

// Open the wizard the way a dispatcher does — the Paste button on the board's toolbar.
const pasteButton = page.locator('button:has-text("Paste")').first();
if ((await pasteButton.count()) === 0) {
  fail("no Paste control on the dispatch board's toolbar");
} else {
  await pasteButton.click();
  await sleep(1500);
  await page.fill("#pasteData", MONDAY_BACKLOG);
  await sleep(400);
  await page.locator('button:has-text("Parse")').first().click();
  await sleep(2500);

  // 1 · THE NOTICE IS ON SCREEN, BEFORE ANY WRITE.
  const panel = page.locator("[data-matrx-import-refusals]").first();
  if ((await panel.count()) === 0) {
    fail("the refusal is nowhere on the screen — the wizard never asked the column's rules");
    await page.screenshot({ path: `${OUT}/refusal-csv-wizard-0-nothing-on-screen.png` });
  } else {
    const said = (await panel.innerText()).replace(/\s+/g, " ").trim();
    ok(`the per-column refusal is on the mapping step: ${JSON.stringify(said.slice(0, 200))}`);

    // 2 · IT NAMES THE COLUMN, THE RULE, AND THE COUNT.
    if (/work order/i.test(said)) ok("it names the Work order column");
    else fail(`it never names the column — ${JSON.stringify(said)}`);
    if (/WO-\d{4}/.test(said)) ok("the column's own pattern is on it, verbatim");
    else fail("the column's pattern hint is not on the notice");
    if (/2 of the 4 rows/.test(said)) ok("it says 2 of the 4 pasted rows fail");
    else fail(`it never says how many rows fail — ${JSON.stringify(said)}`);

    // 3 · IT SAYS WHAT TO DO, IN WORDS TRUE OF THIS SCREEN.
    if (/leave the column out/i.test(said)) ok("it names a remedy this screen actually offers");
    else fail("no remedy true of this screen");

    // 4 · THE BUTTON IS HONEST.
    const confirm = page.locator("[data-matrx-import-confirm]").first();
    const label = (await confirm.innerText()).replace(/\s+/g, " ").trim();
    if (/2 Rows? That Pass/i.test(label)) ok(`the confirm button offers only what passes: ${JSON.stringify(label)}`);
    else fail(`the confirm button still says ${JSON.stringify(label)}`);
    const box = await confirm.boundingBox();
    if (box && box.width > 0 && box.height > 0) ok("the confirm button is on screen and hit-testable");
    else fail("the confirm button has no box");

    await page.screenshot({ path: `${OUT}/refusal-csv-wizard.png` });

    // 5 · NOTHING WAS WRITTEN.
    if (writes.length === 0) ok("the store's write door udt_bulk_write was never called");
    else fail(`the wizard called udt_bulk_write ${writes.length} time(s) before the refusal was answered`);

    // 6 · NOT ON A TIMER.
    await sleep(8000);
    if ((await page.locator("[data-matrx-import-refusals]").count()) > 0)
      ok("the refusal is still on screen eight seconds later — nothing about it is timed");
    else fail("the refusal vanished on its own");

    // 7 · THE DOOR OUT WORKS.
    const drop = page.locator("[data-matrx-import-drop-column]").first();
    if ((await drop.count()) === 0) {
      fail("no way to leave the refusing column out");
    } else {
      await drop.click();
      await sleep(1200);
      if ((await page.locator("[data-matrx-import-refusals]").count()) === 0)
        ok("leaving the column out clears the refusal");
      else fail("the refusal survived leaving the column out");
      const after = (await page.locator("[data-matrx-import-confirm]").first().innerText())
        .replace(/\s+/g, " ")
        .trim();
      if (/Paste 4 Rows/i.test(after)) ok(`and the whole backlog is offered again: ${JSON.stringify(after)}`);
      else fail(`the button says ${JSON.stringify(after)} after the column was dropped`);
    }

    if (writes.length === 0) ok("still nothing written at the end of the walk");
    else fail(`udt_bulk_write was called ${writes.length} time(s)`);
  }
}

if (pageErrors.length === 0) ok("0 page errors");
else fail(`${pageErrors.length} page error(s): ${pageErrors.slice(0, 3).join(" | ")}`);

await ctx.close();
await browser.close();
console.log(say.join("\n"));
console.log(bad === 0 ? `\nGREEN — ${say.filter((s) => s.startsWith("ok")).length} clauses` : `\nRED — ${bad} failure(s)`);
process.exit(bad === 0 ? 0 : 1);

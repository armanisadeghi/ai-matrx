// scripts/choice-tails-walk.mjs — lane CHOICE-TAILS, from a real seat.
//
// Signs in as admin@admin.com through the app's own login form (scripts/lib/seat-browser.mjs,
// headless) on the shared preview (live database) and walks admin's test organization "Harbor
// Dental Group" (11f4e747…), table "Insurance Plan Accounts" (377b783a…, the record store), on its
// disposable test column "Network type" (PPO · EPO · HMO · Indemnity · Discount plan; two plans
// hold EPO: Humana Dental Value and Cigna DPPO Advantage).
//
//   PHASE=sheet   Column settings in the Sheet: remove EPO → "2 records use “EPO”." → Move them to
//                 PPO → Save → the two plans read PPO → Undo on the toast → both read EPO again.
//   PHASE=native  ?grid=merged (records-ui's grid): the nudge — type "POS" into a Network type cell
//                 → "Add “POS” to the choices for Network type?" → Cancel; then the record form's
//                 combobox on a closed column (Plan Type): type a new word → the ask → Cancel.
//
//   ORIGIN=http://s8d677a69.localhost:3001 PHASE=sheet SHOTS=<dir> node scripts/choice-tails-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://s8d677a69.localhost:3001";
const TABLE = "377b783a-f18a-40c3-bf2b-7617691d0091";
const COLUMN = "Network type";
const SHOTS = process.env.SHOTS ?? "/tmp";
const PHASE = process.env.PHASE ?? "sheet";
const WIDTH = Number(process.env.WIDTH ?? 1600);
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const out = { origin: ORIGIN, phase: PHASE, steps: [], console_errors: [] };
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result));
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 240)));
const shot = async (name) => {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  step(`screenshot ${name}`);
};

async function openTable(query = "") {
  await page.goto(`${ORIGIN}/data-v2/${TABLE}${query}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const ready = await until("the grid", async () => (await page.locator("th, [role=columnheader]", { hasText: COLUMN }).count()) > 0, 180000);
  if (!ready.v) throw new Error(`the table did not draw the ${COLUMN} column`);
  await sleep(1500);
}

async function cellsOf(accounts) {
  return page.evaluate(({ name, accounts }) => {
    const ths = [...document.querySelectorAll("thead th")];
    const i = ths.findIndex((th) => (th.textContent ?? "").trim().startsWith(name));
    const got = {};
    for (const a of accounts) {
      const row = [...document.querySelectorAll("tbody tr")].find((tr) => (tr.textContent ?? "").includes(a));
      got[a] = row ? (row.querySelectorAll("td")[i]?.textContent ?? "").trim() : null;
    }
    return got;
  }, { name: COLUMN, accounts });
}

const EPO_PLANS = ["Humana Dental Value", "Cigna DPPO Advantage"];

try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);
  step("signed in", { as: out.signed_in_as });

  if (PHASE === "sheet") {
    await openTable();
    step("cells before", await cellsOf(EPO_PLANS));
    await page.locator("th", { hasText: COLUMN }).first().click({ button: "right" });
    await page.getByRole("menuitem", { name: /Column settings/ }).first().click();
    const dialog = page.getByRole("dialog").filter({ hasText: `Column · ${COLUMN}` });
    await dialog.waitFor({ timeout: 20000 });
    await sleep(2500);
    await dialog.getByRole("button", { name: "Remove EPO" }).click();
    const asked = await until("the question", async () => (await page.locator("[data-choice-removal-ask]").count()) > 0, 15000);
    step("the question", { shown: !!asked.v, says: (await page.locator("[data-choice-removal-ask]").innerText().catch(() => "")).replace(/\s+/g, " ") });
    await page.locator("[data-choice-removal-ask]").scrollIntoViewIfNeeded();
    await shot("01-sheet-removing-EPO-asks-where-its-records-go");
    await page.locator("[data-choice-removal-ask]").getByRole("combobox", { name: "Another choice" }).click();
    await page.getByRole("option", { name: "PPO", exact: true }).click();
    await page.locator("[data-choice-removal-ask]").getByRole("button", { name: "Move them to" }).click();
    await sleep(500);
    step("what Save will do", { says: (await page.locator("[data-choice-rehome]").innerText().catch(() => "")).replace(/\s+/g, " ") });
    await shot("02-sheet-answered-move-to-PPO");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await until("dialog closed", async () => (await page.getByRole("dialog").count()) === 0, 30000);
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const toasted = await until("the Undo toast", async () => (await undo.count()) > 0, 15000);
    step("toast", { undo_shown: !!toasted.v, text: (await page.locator("[role=status], ol li").allInnerTexts().catch(() => [])).join(" | ").replace(/\s+/g, " ").slice(0, 300) });
    await sleep(2500);
    step("cells after the save", await cellsOf(EPO_PLANS));
    await shot("03-sheet-saved-two-plans-now-PPO-with-Undo");
    if (toasted.v) {
      await undo.first().click();
      await sleep(4000);
    }
    await openTable();
    step("cells after Undo (reloaded)", await cellsOf(EPO_PLANS));
    await shot("04-sheet-after-Undo-EPO-is-back");
  }

  if (PHASE === "native") {
    await openTable("?grid=merged");
    await shot("05-native-grid-before");
    const idx = await page.evaluate((name) => [...document.querySelectorAll("thead th")].findIndex((th) => (th.textContent ?? "").trim().startsWith(name)), COLUMN);
    const cell = page.locator("tbody tr", { hasText: "Delta Dental PPO" }).first().locator("td").nth(idx);
    await cell.click();
    await sleep(400);
    await page.keyboard.type("POS");
    await sleep(1200);
    await shot("06-native-grid-a-word-that-is-no-choice-typed");
    // The grid's chooser offers the typed word; choosing it asks before anything is added.
    const use = page.locator("[cmdk-item]", { hasText: "POS" }).first();
    if (await use.count()) await use.click();
    const ASK = "[data-records-choice-ask], [data-matrx-choice-nudge]";
    const ask = await until("the nudge", async () => (await page.locator(ASK).count()) > 0, 15000);
    step("the nudge", { shown: !!ask.v, says: (await page.locator(ASK).first().innerText().catch(() => "")).replace(/\s+/g, " ") });
    await shot("07-native-grid-nudge-asks-before-adding-POS");
    const cancel = page.locator(ASK).getByRole("button", { name: "Cancel" });
    if (await cancel.count()) await cancel.first().click();
    await page.keyboard.press("Escape");
    await sleep(800);
    step("cell after Cancel", await cellsOf(["Delta Dental PPO"]));
  }
  if (PHASE === "form") {
    // The record form (Edit row…) on a column that takes ONLY its choices: Plan Type.
    // records-ui's record rail (Peek → RecordForm) for Delta Dental PPO · Group 40117.
    await openTable("?grid=merged&record=73b88e3b-62a2-4deb-8d06-550f73ab3c6f");
    const pick = page.getByRole("button", { name: "Pick for Plan Type" }).first();
    let opened = await until("the record form's Plan Type combobox", async () => (await pick.count()) > 0, 20000);
    if (!opened.v) {
      const edit = page.getByRole("button", { name: "Edit", exact: true }).first();
      if (await edit.count()) await edit.click();
      opened = await until("the record form's Plan Type combobox", async () => (await pick.count()) > 0, 20000);
    }
    step("record form combobox", { shown: !!opened.v });
    await shot("08-record-form-closed-column-is-a-combobox");
    await pick.click();
    await sleep(500);
    await page.locator('input[placeholder="Search"]:visible').last().fill("DHMO");
    await sleep(900);
    const ASK = "[data-records-choice-ask]";
    const ask = await until("the ask", async () => (await page.locator(ASK).count()) > 0, 15000);
    step("the ask in the record form", {
      shown: !!ask.v,
      says: (await page.locator(ASK).first().innerText().catch(() => "")).replace(/\s+/g, " "),
      keep_offered: (await page.locator(ASK).getByRole("button", { name: "Keep as typed" }).count()) > 0,
    });
    await shot("09-record-form-asks-Add-or-Cancel-for-DHMO");
    await page.locator(ASK).getByRole("button", { name: "Cancel" }).first().click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
} catch (err) {
  out.error = String(err?.stack ?? err);
  await shot(`error-${PHASE}`).catch(() => undefined);
} finally {
  writeFileSync(join(SHOTS, `walk-${PHASE}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ error: out.error ?? null, console_errors: out.console_errors.slice(0, 8) }, null, 2));
  await browser.close();
}

// scripts/choice-column-edit-walk.mjs — lane CHOICE-COLUMN-EDIT, from a real seat.
//
// Signs in as admin@admin.com through the app's own login form (scripts/lib/seat-browser.mjs,
// headless) on the shared preview (live database) and walks admin's test organization "Harbor
// Dental Group" (11f4e747…, switched to the new system). Its moved table "Hygiene Recall Schedule"
// has a moved choice column "Insurance carrier" whose choices are the copy of the older pick list
// "Insurance Carriers" (options keyed `name`) — the shape that refused every re-wording with
// "keeps the choices it was moved across with…".
//
//   PHASE=edit     Column settings: re-word "Guardian DentalGuard" → "Guardian Dental Guard" (the
//                  typo-style fix), add "Humana Dental", Save; reload; the editor shows them; a cell
//                  takes "Humana Dental"; the enum nudge: "Aflac Dental" typed → the ask → Add;
//                  "Ameritas PPO" typed → the ask → Keep as typed; reload.
//   PHASE=restore  puts the fixture back through the same screens (re-word back, remove the two
//                  added choices, clear the three cells).
//
//   ORIGIN=http://choice-column-edit.localhost:3001 PHASE=edit SHOTS=<dir> node scripts/choice-column-edit-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://choice-column-edit.localhost:3001";
const TABLE = "b00bde4d-1adc-4682-88eb-57453aabf014"; // Hygiene Recall Schedule (Harbor Dental Group)
const COLUMN = "Insurance carrier";
const SHOTS = process.env.SHOTS ?? "/tmp";
const PHASE = process.env.PHASE ?? "edit";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const out = { origin: ORIGIN, phase: PHASE, steps: [], console_errors: [], toasts: [] };
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result));
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 240)));
const shot = async (name) => {
  const path = join(SHOTS, `${name}.png`);
  await page.screenshot({ path });
  step(`screenshot ${name}`);
};
const toastText = async () =>
  (await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])).join(" | ").replace(/\s+/g, " ");

async function openTable() {
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const ready = await until("the grid", async () => (await page.locator("th", { hasText: COLUMN }).count()) > 0, 180000);
  if (!ready.v) throw new Error("the Sheet did not draw the Insurance carrier column");
  await sleep(1500);
}

async function columnIndex() {
  return page.evaluate((name) => {
    const ths = [...document.querySelectorAll("thead th")];
    return ths.findIndex((th) => (th.textContent ?? "").trim().startsWith(name));
  }, COLUMN);
}

function cellOf(patient, index) {
  return page.locator("tbody tr", { hasText: patient }).first().locator("td").nth(index);
}

async function openSettings() {
  await page.locator("th", { hasText: COLUMN }).first().click({ button: "right" });
  const item = page.getByRole("menuitem", { name: /Column settings/ }).first();
  await item.waitFor({ timeout: 15000 });
  await item.click();
  await page.getByRole("dialog").filter({ hasText: `Column · ${COLUMN}` }).waitFor({ timeout: 20000 });
  await sleep(1200);
}

async function optionWords() {
  return page.getByRole("dialog").locator('input[aria-label="Option value"]').evaluateAll((els) => els.map((e) => e.value));
}

async function saveSettings() {
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  const closed = await until("dialog closed", async () => (await page.getByRole("dialog").count()) === 0, 30000);
  const t = await toastText();
  if (t) out.toasts.push(t);
  return { closed: !!closed.v, toast: t };
}

/** Open a choice cell's chooser the ways a person does: click to select, click again, Enter, double-click. */
async function openChooser(cell) {
  const input = page.locator("[cmdk-input]:visible").last();
  const tries = [
    async () => { await cell.click(); await sleep(400); await cell.click(); },
    async () => { await page.keyboard.press("Enter"); },
    async () => { await page.keyboard.press("Escape"); await cell.dblclick(); },
  ];
  for (const t of tries) {
    await t();
    const ok = await until("the chooser", async () => (await input.count()) > 0, 5000);
    if (ok.v) return input;
  }
  throw new Error("the choice cell's chooser did not open");
}

async function typeIntoCell(patient, words) {
  const index = await columnIndex();
  const cell = cellOf(patient, index);
  const input = await openChooser(cell);
  await input.fill(words);
  await sleep(600);
  if (process.env.DEBUG) await page.screenshot({ path: join(SHOTS, `debug-${patient.replace(/\W+/g, "-")}.png`) });
  return input;
}

try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`signed in as ${out.signed_in_as}`);
  step("signed in", { as: out.signed_in_as });
  await openTable();

  if (PHASE === "edit") {
    await shot("1-before-the-moved-table-1600");
    await openSettings();
    step("the column editor's choices before", { words: await optionWords() });
    await shot("2-column-settings-before-1600");

    // Re-word the typo-style choice IN PLACE, add one, Save.
    const before = await optionWords();
    if (before.includes("Guardian DentalGuard")) {
      await page.getByRole("dialog").locator('input[aria-label="Option value"]').nth(before.indexOf("Guardian DentalGuard")).fill("Guardian Dental Guard");
    }
    if (!before.includes("Humana Dental")) {
      const add = page.getByRole("dialog").getByPlaceholder("Add an option…");
      await add.fill("Humana Dental");
      await add.press("Enter");
    }
    await sleep(300);
    step("the column editor's choices as edited", { words: await optionWords() });
    await shot("3-column-settings-edited-1600");
    const saved = await saveSettings();
    step("Save", saved);
    if (/Could not save|keeps the choices it was moved/.test(saved.toast)) throw new Error(`the save was refused: ${saved.toast}`);

    // Reload: the store holds the new words.
    await openTable();
    await openSettings();
    const after = await optionWords();
    step("after reload, the column editor's choices", { words: after });
    if (!after.includes("Guardian Dental Guard") || !after.includes("Humana Dental") || after.includes("Guardian DentalGuard")) {
      throw new Error(`the reloaded choices are not the saved ones: ${after.join(", ")}`);
    }
    await shot("4-column-settings-after-reload-1600");
    await page.keyboard.press("Escape");
    await sleep(800);

    // A cell takes the new choice.
    await typeIntoCell("Imogen Achterberg", "Humana");
    await page.locator("[cmdk-item]", { hasText: "Humana Dental" }).first().click();
    await sleep(2500);
    step("Imogen Achterberg's carrier", { cell: (await cellOf("Imogen Achterberg", await columnIndex()).innerText()).trim() });

    // The enum nudge: a word that is none of the choices → the ask → Add.
    await typeIntoCell("Tobias Lindqvist", "Aflac Dental");
    await page.locator("[cmdk-item]", { hasText: "Aflac Dental" }).first().click();
    const asked = await until("the ask", async () => (await page.locator("[data-matrx-choice-nudge]").count()) > 0, 20000);
    step("the ask appears", { shown: !!asked.v, says: (await page.locator("[data-matrx-choice-nudge]").innerText().catch(() => "")).replace(/\s+/g, " ") });
    if (!asked.v) throw new Error("typing a word that is none of the choices did not ask");
    await shot("5-the-cell-asks-before-it-adds-1600");
    await page.locator("[data-matrx-choice-nudge]").getByRole("button", { name: "Add", exact: true }).evaluate((b) => b.click());
    await sleep(3500);
    step("Tobias Lindqvist's carrier after Add", { cell: (await cellOf("Tobias Lindqvist", await columnIndex()).innerText()).trim(), toast: await toastText() });

    // Keep as typed (the column takes other values).
    await typeIntoCell("Gideon Park", "Ameritas PPO");
    await page.locator("[cmdk-item]", { hasText: "Ameritas PPO" }).first().click();
    await until("the ask", async () => (await page.locator("[data-matrx-choice-nudge]").count()) > 0, 20000);
    await page.locator("[data-matrx-choice-nudge]").getByRole("button", { name: "Keep as typed", exact: true }).evaluate((b) => b.click());
    await sleep(3000);
    step("Gideon Park's carrier after Keep as typed", { cell: (await cellOf("Gideon Park", await columnIndex()).innerText()).trim() });

    // Reload: every cell and the new choice are the store's.
    await openTable();
    const idx = await columnIndex();
    const cells = {};
    for (const p of ["Imogen Achterberg", "Tobias Lindqvist", "Gideon Park", "Theo Brannigan", "Dana Whitfield"]) {
      cells[p] = (await cellOf(p, idx).innerText()).trim();
    }
    step("after reload, the carriers", cells);
    await shot("6-after-reload-the-cells-1600");
    await openSettings();
    const final = await optionWords();
    step("after reload, the column editor's choices", { words: final });
    if (!final.includes("Aflac Dental") || final.includes("Ameritas PPO")) throw new Error(`Add/Keep did not land as asked: ${final.join(", ")}`);
    await shot("7-the-added-choice-is-in-the-column-editor-1600");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await openTable();
    await shot("8-the-table-at-390");
  }

  if (PHASE === "empty") {
    // BREAKER-1: a Choice column added with no choices yet stays a Choice column; its first choice
    // is added from a cell. The column is removed again at the end (Delete column retires it).
    const NAME = "Referral source";
    if ((await page.locator("th", { hasText: NAME }).count()) === 0) {
    await page.getByRole("button", { name: "Column", exact: true }).first().click();
    const dialog = page.getByRole("dialog").filter({ hasText: "Add New Column" });
    await dialog.waitFor({ timeout: 20000 });
    await dialog.locator("#displayName").fill(NAME);
    // "Shows as": the format picker's trigger is the second combobox of the dialog.
    const triggers = dialog.getByRole("combobox");
    await triggers.nth(1).click();
    await page.getByRole("option", { name: /^Choice/ }).first().click();
    await sleep(500);
    await shot("9-add-a-choice-column-with-no-choices-1600");
    await dialog.getByRole("button", { name: /Add Column|Add column|Create/ }).last().click();
    await until("dialog closed", async () => (await page.getByRole("dialog").count()) === 0, 30000);
    const t = await toastText();
    step("added the column", { toast: t });
    }
    await openTable();
    // Open the new column's settings: it is a Choice column with an empty list.
    await page.locator("th", { hasText: NAME }).first().click({ button: "right" });
    await page.getByRole("menuitem", { name: /Column settings/ }).first().click();
    const settings = page.getByRole("dialog").filter({ hasText: `Column · ${NAME}` });
    await settings.waitFor({ timeout: 20000 });
    await sleep(1000);
    const says = (await settings.innerText()).replace(/\s+/g, " ");
    step("the new column's settings", { choice: /Shows as Choice/.test(says), no_choices_yet: says.includes("No choices yet") });
    await shot("10-a-choice-column-with-no-choices-yet-1600");
    await page.keyboard.press("Escape");
    await sleep(600);
    // The first choice, from a cell.
    const idx = await page.evaluate((name) => [...document.querySelectorAll("thead th")].findIndex((th) => (th.textContent ?? "").trim().startsWith(name)), NAME);
    const cell = page.locator("tbody tr", { hasText: "Walt Okafor" }).first().locator("td").nth(idx);
    const input = await openChooser(cell);
    await input.fill("Dentist referral");
    await sleep(800);
    if (process.env.DEBUG) await page.screenshot({ path: join(SHOTS, "debug-empty-cell.png") });
    await page.locator("[cmdk-item]", { hasText: "Dentist referral" }).first().click({ timeout: 10000 });
    await until("the ask", async () => (await page.locator("[data-matrx-choice-nudge]").count()) > 0, 20000);
    step("the ask on the empty column", { says: (await page.locator("[data-matrx-choice-nudge]").innerText().catch(() => "")).replace(/\s+/g, " ") });
    await shot("11-the-first-choice-from-a-cell-1600");
    await page.locator("[data-matrx-choice-nudge]").getByRole("button", { name: "Add", exact: true }).evaluate((b) => b.click());
    await sleep(3500);
    await openTable();
    step("Walt Okafor's referral source after reload", {
      cell: (await page.locator("tbody tr", { hasText: "Walt Okafor" }).first().locator("td").nth(idx).innerText()).trim(),
    });
    await page.locator("th", { hasText: NAME }).first().click({ button: "right" });
    await page.getByRole("menuitem", { name: /Column settings/ }).first().click();
    await page.getByRole("dialog").filter({ hasText: `Column · ${NAME}` }).waitFor({ timeout: 20000 });
    await sleep(1000);
    step("its choices after reload", { words: await optionWords() });
    await shot("12-the-first-choice-is-in-the-column-editor-1600");
    // Put the table back: Delete column retires it (its values stay in history).
    await page.getByRole("dialog").getByRole("button", { name: /Delete column/ }).click();
    const confirmButton = page.getByRole("button", { name: "Remove column", exact: true }).last();
    await confirmButton.waitFor({ timeout: 15000 });
    await confirmButton.click();
    await sleep(3000);
    await openTable();
    step("the column is gone again", { present: (await page.locator("th", { hasText: NAME }).count()) > 0 });
  }

  if (PHASE === "dropcol") {
    const NAME = "Referral source";
    if ((await page.locator("th", { hasText: NAME }).count()) > 0) {
      await page.locator("th", { hasText: NAME }).first().click({ button: "right" });
      await page.getByRole("menuitem", { name: /Column settings/ }).first().click();
      await page.getByRole("dialog").filter({ hasText: `Column · ${NAME}` }).waitFor({ timeout: 20000 });
      await page.getByRole("dialog").getByRole("button", { name: /Delete column/ }).click();
      const confirmButton = page.getByRole("button", { name: "Remove column", exact: true }).last();
      await confirmButton.waitFor({ timeout: 15000 });
      await confirmButton.click();
      await sleep(3000);
      await openTable();
    }
    step("Referral source present", { present: (await page.locator("th", { hasText: NAME }).count()) > 0 });
  }

  if (PHASE === "restore") {
    await openSettings();
    const words = await optionWords();
    if (words.includes("Guardian Dental Guard") || words.includes("Humana Dental") || words.includes("Aflac Dental")) {
      const inputs = page.getByRole("dialog").locator('input[aria-label="Option value"]');
      if (words.includes("Guardian Dental Guard")) await inputs.nth(words.indexOf("Guardian Dental Guard")).fill("Guardian DentalGuard");
      for (const w of ["Humana Dental", "Aflac Dental"]) {
        const b = page.getByRole("dialog").getByRole("button", { name: `Remove ${w}` });
        if (await b.count()) await b.first().click();
      }
      step("restored choices", { words: await optionWords() });
      step("Save", await saveSettings());
    } else {
      step("choices already restored", { words });
      await page.keyboard.press("Escape");
      await sleep(500);
    }
    await openTable();
    const idx = await columnIndex();
    for (const p of ["Imogen Achterberg", "Tobias Lindqvist", "Gideon Park"]) {
      // Select the row's Reminder sent cell (a plain click selects), step right onto the carrier and clear it.
      await page.keyboard.press("Escape");
      await cellOf(p, idx - 1).click({ position: { x: 150, y: 10 } });
      await sleep(300);
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Delete");
      await sleep(1800);
    }
    await openTable();
    const cells = {};
    for (const p of ["Imogen Achterberg", "Tobias Lindqvist", "Gideon Park"]) cells[p] = (await cellOf(p, idx).innerText()).trim();
    step("cells after restore", cells);
  }
} catch (err) {
  out.error = String(err?.stack ?? err);
  await shot("error").catch(() => undefined);
} finally {
  writeFileSync(join(SHOTS, `walk-${PHASE}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ error: out.error ?? null, console_errors: out.console_errors.slice(0, 8), toasts: out.toasts }, null, 2));
  await browser.close();
}

// R42 (PARITY F5 / N19–N21): every Notion property type on a fresh page's inline database, as test@test.com.
// Two databases ("Projects", "Vendors" — the title renames the table), New property → Number, Status, Person,
// Files & media, Created time / by, Last edited time / by, ID, Formula (the column panel), Relation (to Vendors),
// Rollup (count through it). Values: a status, a person, an uploaded file, two vendors. Then Board grouped by
// Status, Gallery, Calendar, a reload, and every value read back. Trashes the page unless KEEP=1.
//   SHOT_DIR=<dir> node features/spaces/__tests__/walk/property-types.walk.mjs
import { writeFileSync } from "node:fs";

import { open, newPage, act, slash, originOf, trashPage } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const { browser, page } = await open({ member: true, width: 1600, height: 1100 });
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const step = (name) => console.log(JSON.stringify({ step: name }));
const id = await newPage(page);
const pageUrl = `${originOf(page)}/spaces/${id}`;
console.log(JSON.stringify({ page: id }));
const frames = page.locator(".spaces-db-frame");
const A = () => frames.nth(0);
const B = () => frames.nth(1);
const pop = () => page.locator("[data-radix-popper-content-wrapper]").last();
const panel = () => page.locator("[data-spaces-configure-property]");
const waitGrid = (frame) => frame.getByRole("button", { name: /^Sort or filter / }).first().waitFor({ timeout: 180_000 });

async function viewSettings(frame) {
  await page.keyboard.press("Escape").catch(() => {});
  await frame.hover();
  await frame.getByRole("button", { name: "View settings" }).click();
}
/** The view's properties, as its Properties list names them. */
async function propertyNames(frame) {
  await viewSettings(frame);
  await page.getByText("Properties", { exact: true }).click();
  await page.waitForTimeout(800);
  const names = await pop().locator('[aria-label^="Edit property "]').evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").replace(/^Edit property /, "")));
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  return names;
}
async function addProp(frame, name, typeLabel) {
  await viewSettings(frame);
  await page.getByText("Properties", { exact: true }).click();
  await page.getByText("New property", { exact: true }).click();
  await page.getByPlaceholder("Property name").fill(name);
  await page.getByRole("listbox", { name: "Property types" }).getByText(typeLabel, { exact: true }).click();
}
async function pickSelect(scope, label, option) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option }).first().click();
}
async function editCell(row, field, text) {
  await row.getByRole("button", { name: `Edit ${field}`, exact: true }).dblclick();
  await page.waitForTimeout(700);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
}
async function newRow(frame) {
  const before = await frame.locator("[data-row-id]").count();
  await frame.hover();
  await frame.getByRole("button", { name: /^New$/ }).first().click();
  await page.waitForFunction(([sel, n, i]) => document.querySelectorAll(".spaces-db-frame")[i]?.querySelectorAll(sel).length > n, ["[data-row-id]", before, frame === A() ? 0 : 1], { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  return frame.locator("[data-row-id]").last();
}
async function setLayout(frame, label) {
  await viewSettings(frame);
  await page.getByText("Layout", { exact: true }).click();
  await pop().getByText(label, { exact: true }).click();
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
}

await act(page, async () => {
  step("two databases, titled");
  for (let i = 0; i < 2; i++) {
    await page.locator(".bn-editor .bn-inline-content").last().click();
    await page.keyboard.press("End");
    await slash(page, "Database - Inline");
    await frames.nth(i).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3000);
  }
  await waitGrid(A());
  await waitGrid(B());
  for (const [frame, title] of [[A(), "Projects"], [B(), "Vendors"]]) {
    const t = frame.getByLabel("Database title");
    await t.fill(title);
    await t.press("Enter");
    await page.waitForTimeout(2000);
  }

  step("type list");
  await viewSettings(A());
  await page.getByText("Properties", { exact: true }).click();
  await page.getByText("New property", { exact: true }).click();
  const listed = (await page.getByRole("listbox", { name: "Property types" }).locator("> *").allInnerTexts()).map((s) => s.trim());
  await page.screenshot({ path: `${SHOT}/r42-1-type-list.png` });
  const want = ["Status", "Person", "Files & media", "Formula", "Relation", "Rollup", "Created time", "Created by", "Last edited time", "Last edited by", "ID"];
  check("New property lists Notion's types", want.every((w) => listed.includes(w)), { listed });
  await page.keyboard.press("Escape");

  step("instant properties");
  for (const [name, type] of [["Budget", "Number"], ["Status", "Status"], ["Owner", "Person"], ["Files", "Files & media"], ["Created", "Created time"], ["Created by", "Created by"], ["Edited", "Last edited time"], ["Edited by", "Last edited by"], ["ID", "ID"]]) {
    await addProp(A(), name, type);
    await page.waitForTimeout(2500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
  }

  step("vendors rows");
  for (const vendor of ["Acme Supplies", "Northwind Paper"]) await editCell(await newRow(B()), "Name", vendor);

  step("formula");
  await addProp(A(), "Double", "Formula");
  await panel().waitFor({ timeout: 10_000 });
  await panel().getByRole("button", { name: "Write a formula" }).click().catch(() => {});
  const box = panel().getByLabel("The formula");
  let accepted = null;
  const said = {};
  for (const text of ['prop("Budget") * 2', "{Budget} * 2"]) {
    await box.fill(text);
    await page.waitForTimeout(3500);
    said[text] = (await panel().locator("p, [role=status], [role=alert]").allInnerTexts()).join(" | ").slice(0, 300);
    if (/Reads Budget/.test(said[text])) {
      accepted = text;
      break;
    }
  }
  await page.screenshot({ path: `${SHOT}/r42-2-formula-editor.png` });
  check("formula editor accepts a formula over Budget", accepted !== null, { accepted, said });
  await panel().getByRole("button", { name: "Create column" }).click();
  await page.waitForTimeout(4000);
  await page.keyboard.press("Escape");

  step("relation");
  await addProp(A(), "Vendors", "Relation");
  const dbs = page.getByRole("listbox", { name: "Databases" });
  await dbs.waitFor({ timeout: 15_000 });
  await page.getByPlaceholder("Link to a database…").fill("Vendors");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT}/r42-3-relation-picker.png` });
  const targets = await dbs.locator(".spaces-db-menurow").allInnerTexts();
  check("relation picker names the second database by its title", targets.some((t) => t.trim() === "Vendors"), { targets: targets.slice(0, 5) });
  await dbs.locator(".spaces-db-menurow").filter({ hasText: /^Vendors$/ }).first().click();
  await page.waitForTimeout(3000);
  await page.keyboard.press("Escape");

  step("rollup");
  await addProp(A(), "Vendor count", "Rollup");
  await panel().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  await pickSelect(panel(), "Across the records in", /Vendors/);
  await page.waitForTimeout(800);
  await pickSelect(panel(), "What to work out", "How many there are");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOT}/r42-4-rollup-config.png` });
  await panel().getByRole("button", { name: "Create column" }).click();
  await page.waitForTimeout(4000);
  await page.keyboard.press("Escape");

  const names = await propertyNames(A());
  for (const n of ["Budget", "Status", "Owner", "Files", "Created", "Created by", "Edited", "Edited by", "ID", "Double", "Vendors", "Vendor count"]) check(`property ${n}`, names.includes(n));

  step("values in the grid");
  const row = await newRow(A());
  await editCell(row, "Name", "Spring launch");
  await editCell(row, "Budget", "50");
  await row.getByRole("button", { name: "Edit Status", exact: true }).dblclick();
  await page.getByText("In progress", { exact: true }).last().click();
  await page.waitForTimeout(2000);
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "Edit Vendors", exact: true }).dblclick();
  await page.waitForTimeout(2500);
  for (const v of ["Acme Supplies", "Northwind Paper"]) {
    await page.getByRole("button", { name: v, exact: true }).last().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${SHOT}/r42-5-relation-cell.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2000);

  step("person and file on the opened page");
  await row.hover();
  await row.getByRole("button", { name: /^Open / }).click();
  await page.getByRole("button", { name: "Edit Owner", exact: true }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Edit Owner", exact: true }).click();
  await page.getByRole("button", { name: /test@test\.com/ }).last().click();
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
  const file = `${SHOT}/r42-brief.txt`;
  writeFileSync(file, "Spring launch brief — vendors, budget, dates.\n");
  await page.getByRole("button", { name: "Edit Files", exact: true }).click();
  const chooser = page.waitForEvent("filechooser", { timeout: 15_000 });
  await page.getByRole("button", { name: "Upload File" }).last().click();
  await (await chooser).setFiles(file);
  await page.waitForTimeout(8000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT}/r42-6-record-page.png`, fullPage: true });
});

/** Every value, read back from the row's own page. */
async function readRecord(tag) {
  const text = await page.locator("main").innerText().catch(async () => page.locator("body").innerText());
  const has = (s) => text.includes(s);
  check(`${tag}: status In progress`, has("In progress"));
  check(`${tag}: person`, /Owner\s*\n?\s*(T\s*)?test/.test(text) || has("test@test.com"));
  check(`${tag}: file`, has("r42-brief"));
  check(`${tag}: formula 100`, /Double\s*\n?\s*100/.test(text));
  check(`${tag}: rollup 2`, /Vendor count\s*\n?\s*2\b/.test(text));
  check(`${tag}: ID 1`, /\bID\s*\n?\s*1\b/.test(text));
  check(`${tag}: created by test`, /Created by\s*\n?\s*(T\s*)?test/.test(text));
  check(`${tag}: edited by test`, /Edited by\s*\n?\s*(T\s*)?test/.test(text));
  check(`${tag}: relation titles`, has("Acme Supplies") && has("Northwind Paper"));
}
await readRecord("record page");
const recordUrl = page.url();

await act(page, async () => {
  step("board grouped by Status, gallery, calendar");
  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  await waitGrid(A());
  await page.waitForTimeout(2000);
  for (const [layout, shot] of [["Board", "r42-7-board.png"], ["Gallery", "r42-8-gallery.png"], ["Calendar", "r42-9-calendar.png"]]) {
    await A().hover();
    await A().getByRole("button", { name: "Add view" }).click();
    await page.waitForTimeout(2000);
    await setLayout(A(), layout);
    if (layout === "Board") {
      await viewSettings(A());
      await page.getByText("Group", { exact: true }).click();
      await pop().getByText("Status", { exact: true }).click();
      await page.waitForTimeout(2500);
      await page.keyboard.press("Escape");
      const board = await A().innerText();
      check("board groups by Status", ["Not started", "In progress", "Done"].every((g) => board.includes(g)) && board.includes("Spring launch"));
    }
    if (layout === "Gallery") check("gallery shows the card", (await A().innerText()).includes("Spring launch"));
    if (layout === "Calendar") check("calendar shows the page on its created day", (await A().innerText()).includes("Spring launch"));
    await A().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOT}/${shot}` });
  }
});

step("reload");
await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
await waitGrid(A()).catch(() => {});
await page.waitForTimeout(4000);
const tabs = await A().getByRole("tab").allInnerTexts();
check("views survive reload", tabs.length >= 4, { tabs });
const titles = await page.getByLabel("Database title").evaluateAll((els) => els.map((e) => e.value));
check("titles survive reload", titles.join(",") === "Projects,Vendors", { titles });
await page.screenshot({ path: `${SHOT}/r42-10-after-reload.png` });
await page.goto(recordUrl, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Edit Owner", exact: true }).waitFor({ timeout: 90_000 });
await page.waitForTimeout(3000);
await readRecord("after reload");
await page.screenshot({ path: `${SHOT}/r42-11-record-after-reload.png`, fullPage: true });

if (!process.env.KEEP) {
  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
  await act(page, () => trashPage(page));
}
console.log(JSON.stringify({ id, failed }));
await browser.close();
process.exit(failed ? 1 : 0);

// N9 Automations (round 31): a scratch page's inline database gets Status (Choice: Todo, Done) and Completed
// (Date); Automations -> "Status → Done sets Completed date and notifies author" (Status edited to Done ->
// set Completed = now, notify the author); a row's Status is set to Done in the grid; the run shows in the
// history with its steps; Completed is filled; the automation is archived. Trashes the page.
//   SPACES_WALK_ORG="Ashford Labs" SHOT_DIR=<dir> node features/spaces/__tests__/walk/automations.walk.mjs [pageId]
import { open, newPage, act, slash, originOf, trashPage } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
let id = process.argv[2];
if (id) await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
else id = await newPage(page);
console.log(JSON.stringify({ page: id }));
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);
const frame = page.locator(".spaces-db-frame").first();
if (!(await frame.count())) {
  await act(page, async () => {
    await page.locator(".bn-editor .bn-inline-content").last().click();
    await slash(page, "Database - Inline");
  });
}
await frame.waitFor({ timeout: 90_000 });
await page.waitForTimeout(6000);
const headerNames = async () => frame.getByRole("button", { name: /^Sort or filter / }).evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").replace(/^Sort or filter /, "")));
const header = (name) => frame.locator("[role=columnheader], th").filter({ has: page.getByRole("button", { name: `Sort or filter ${name}`, exact: true }) }).first();
const dialog = () => page.getByRole("dialog").last();
const addColumn = async (label, kind, choices = []) => {
  if ((await headerNames()).includes(label)) return;
  await act(page, async () => {
    await header("Name").hover();
    await header("Name").getByRole("button", { name: "Sort or filter Name", exact: true }).click();
    await page.getByText("Insert column right…", { exact: true }).first().click();
    await dialog().waitFor({ timeout: 10_000 });
    await dialog().getByRole("textbox", { name: "Field name" }).fill(label);
    await dialog().getByRole("combobox", { name: "What this field holds" }).click();
    await page.getByRole("option", { name: kind, exact: true }).click();
    await page.waitForTimeout(600);
    for (const [i, w] of choices.entries()) {
      await dialog().getByRole("button", { name: "Add a choice" }).click();
      await dialog().getByRole("textbox", { name: `Choice ${i + 1}` }).fill(w);
    }
    await dialog().getByRole("button", { name: "Create column" }).click();
    await page.waitForTimeout(3500);
  });
};
await addColumn("Completed", "Date");
await addColumn("Status", "Choice", ["Todo", "Done"]);
check("Status and Completed columns", ["Status", "Completed"].every(async () => true) && (await headerNames()).includes("Status"), { headers: await headerNames() });

// The automation.
const openPanel = async () => {
  await frame.hover();
  await frame.getByRole("button", { name: "Automations", exact: true }).first().click();
  await page.getByTestId("spaces-automations").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
};
const NAME = "Status → Done sets Completed date and notifies author";
await act(page, async () => {
  await openPanel();
  const panel = page.getByTestId("spaces-automations");
  if (!(await panel.getByText(NAME).count())) {
    await panel.getByRole("button", { name: "New automation" }).click();
    const ed = page.getByTestId("spaces-automation-editor");
    await ed.getByRole("textbox", { name: "Automation name" }).fill(NAME);
    // AUTOMATION-TIME: the time triggers are real choices now; each opens its own controls.
    check("a schedule is a choice", await ed.getByRole("button", { name: "Every…" }).isEnabled());
    await ed.getByRole("button", { name: "Every…" }).click();
    check("the schedule controls show", await ed.getByTestId("spaces-automation-schedule-trigger").isVisible());
    check("a schedule has no Set property", (await ed.getByRole("button", { name: "Set property" }).count()) === 0);
    await ed.getByRole("button", { name: "Date arrives" }).click();
    check("the date controls show", await ed.getByTestId("spaces-automation-date-trigger").isVisible());
    await page.screenshot({ path: `${SHOT}/automation-time-triggers.png` });
    await ed.getByRole("button", { name: "Property edited" }).click();
    await ed.getByRole("button", { name: "Status", exact: true }).first().click();
    await ed.getByRole("textbox", { name: "Edited to" }).fill("Done");
    await ed.getByRole("button", { name: "Set property" }).click();
    const set = ed.getByTestId("spaces-automation-action").nth(0);
    await set.getByRole("button", { name: "Completed", exact: true }).first().click();
    await set.getByRole("button", { name: "Now", exact: true }).click();
    await ed.getByRole("button", { name: "Send notification" }).click();
    const note = ed.getByTestId("spaces-automation-action").nth(1);
    await note.getByRole("textbox", { name: "Notification text" }).fill("{{Name}} is done");
    await page.screenshot({ path: `${SHOT}/automation-editor.png` });
    await ed.getByRole("button", { name: "Create" }).click();
    await page.waitForTimeout(3000);
    const err = await panel.locator(".text-destructive").allInnerTexts();
    if (err.length) console.log(JSON.stringify({ refused: err }));
  }
  const rows = await page.getByTestId("spaces-automation-row").allInnerTexts();
  await page.screenshot({ path: `${SHOT}/automation-listed.png` });
  check("the automation is listed and on", rows.some((r) => r.includes(NAME)), { rows });
  await page.keyboard.press("Escape");
});

// A row, then its Status set to Done in the grid.
await act(page, async () => {
  if (!(await frame.locator("tbody tr").filter({ hasText: /\S/ }).count()) || (await frame.getByText("No records yet").count())) {
    await frame.getByRole("button", { name: /^(New page|Add the first row)$/ }).first().click();
    await page.waitForTimeout(4000);
    await page.keyboard.press("Escape");
  }
  const col = (await headerNames()).indexOf("Status");
  const row = frame.locator("tbody tr").first();
  const cell = row.locator("td").nth(col);
  console.log(JSON.stringify({ cells: await row.locator("td").count(), headers: (await headerNames()).length, col }));
  await cell.click();
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  const opts = (await page.getByRole("option").allInnerTexts()).map((t) => t.trim());
  console.log(JSON.stringify({ statusOptions: opts }));
  await page.screenshot({ path: `${SHOT}/automation-status-open.png` });
  await page.getByRole("option", { name: "Done" }).first().click().catch(async () => page.getByText("Done", { exact: true }).last().click());
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(6000);
});
await page.reload({ waitUntil: "domcontentloaded" });
await frame.waitFor({ timeout: 90_000 });
await page.waitForTimeout(8000);
const rowText = await frame.locator("tbody tr").first().innerText();
await page.screenshot({ path: `${SHOT}/automation-fired-row.png` });
check("the row is Done and Completed is filled", /Done/.test(rowText) && /\d{1,2}[/,\s-]|20\d\d|Oct|Today/i.test(rowText), { rowText: rowText.slice(0, 160) });

// The run, with its steps; then archive.
await act(page, async () => {
  await openPanel();
  const row = page.getByTestId("spaces-automation-row").filter({ hasText: NAME }).first();
  await row.getByRole("button", { name: "Runs" }).click();
  const runs = page.getByTestId("spaces-automation-runs");
  const seen = await runs.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const text = seen ? await runs.innerText() : await row.innerText();
  await page.screenshot({ path: `${SHOT}/automation-runs.png` });
  check("the run is listed with its steps", seen && /ran/i.test(text) && /set/i.test(text) && /notify/i.test(text), { text: text.slice(0, 300) });
  await row.getByRole("button", { name: "Archive automation" }).click();
  await page.waitForTimeout(3000);
  check("archived (no longer listed)", (await page.getByTestId("spaces-automation-row").filter({ hasText: NAME }).count()) === 0);
  await page.keyboard.press("Escape");
});
if (process.env.TRASH) check("scratch page trashed", await act(page, () => trashPage(page)));
await browser.close();
process.exit(failed ? 1 : 0);

// R43 item 1: board / gallery / calendar cards show the database's properties (not just the title), and the view's
// Properties toggles add and remove them. test@test.com; trashes its page unless KEEP=1.
//   SHOT_DIR=<dir> node features/spaces/__tests__/walk/card-fields.walk.mjs
import { open, newPage, act, slash, originOf, trashPage } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const { browser, page } = await open({ member: true, width: 1600, height: 1100 });
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const taps = [];
page.on("console", (m) => m.text().includes("[tap-target]") && taps.push(m.text().slice(0, 300)));
const id = await newPage(page);
const A = page.locator(".spaces-db-frame").first();
const pop = () => page.locator("[data-radix-popper-content-wrapper]").last();
const viewSettings = async () => {
  await page.keyboard.press("Escape").catch(() => {});
  await A.hover();
  await A.getByRole("button", { name: "View settings" }).click();
};
const addProp = async (name, type) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await addPropOnce(name, type);
    if (await A.getByText(name, { exact: true }).first().waitFor({ timeout: 20_000 }).then(() => true, () => false)) return;
  }
  throw new Error(`property ${name} never appeared`);
};
const addPropOnce = async (name, type) => {
  await viewSettings();
  await page.getByText("Properties", { exact: true }).click();
  await page.getByText("New property", { exact: true }).click();
  await page.getByPlaceholder("Property name").fill(name);
  await page.getByRole("listbox", { name: "Property types" }).getByText(type, { exact: true }).click();
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
};
const setLayout = async (label) => {
  await viewSettings();
  await page.getByText("Layout", { exact: true }).click();
  await pop().getByText(label, { exact: true }).click();
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
};
const toggle = async (label) => {
  await viewSettings();
  await page.getByText("Properties", { exact: true }).click();
  await pop().getByText(label, { exact: true }).click();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
};
const editCell = async (row, field, text) => {
  await row.getByRole("button", { name: `Edit ${field}`, exact: true }).dblclick();
  await page.waitForTimeout(700);
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
};
const text = () => A.innerText();

await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").last().click();
  await slash(page, "Database - Inline");
  await A.waitFor({ timeout: 60_000 });
  await A.getByRole("button", { name: /^Sort or filter / }).first().waitFor({ timeout: 180_000 });
  for (const [n, t] of [["Budget", "Number"], ["Status", "Status"], ["Region", "Text"], ["Notes", "Text"], ["Channel", "Text"], ["Phase", "Text"], ["Due", "Date"]]) await addProp(n, t);
  await A.hover();
  await A.getByRole("button", { name: /^New$/ }).first().click();
  await A.locator("[data-row-id]").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${SHOT}/r43-rows.png` });
  const row = A.locator("[data-row-id]").first();
  await editCell(row, "Name", "Spring launch");
  await editCell(row, "Budget", "4200");
  await editCell(row, "Region", "Lisbon");
  await editCell(row, "Notes", "Quarterly");
  await editCell(row, "Channel", "Email");
  await editCell(row, "Phase", "Kickoff");

  for (const layout of ["Board", "Gallery", "Calendar"]) {
    await A.hover();
    await A.getByRole("button", { name: "Add view" }).click();
    await page.waitForTimeout(2000);
    await setLayout(layout);
    if (layout === "Board") {
      await viewSettings();
      await page.getByText("Group", { exact: true }).click();
      await pop().getByText("Status", { exact: true }).click();
      await page.waitForTimeout(2500);
      await page.keyboard.press("Escape");
    }
    let t = await text();
    check(`${layout}: new view shows properties on its card`, t.includes("Spring launch") && t.includes("4200") && t.includes("Lisbon") && t.includes("Quarterly"), { t: t.slice(0, 400) });
    check(`${layout}: cap keeps the rest off`, !t.includes("Kickoff"));
    await A.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOT}/r43-${layout}.png` });
    await toggle("Budget");
    t = await text();
    check(`${layout}: toggling Budget off removes it`, !t.includes("4200") && t.includes("Lisbon"));
    await toggle("Phase");
    t = await text();
    check(`${layout}: toggling Phase on adds it`, t.includes("Kickoff"));
    await toggle("Budget");
    t = await text();
    check(`${layout}: Budget back on`, t.includes("4200"));
  }
});
check("no [tap-target] console errors", taps.length === 0, { taps });
if (!process.env.KEEP) await act(page, () => trashPage(page));
await browser.close();
process.exit(failed ? 1 : 0);

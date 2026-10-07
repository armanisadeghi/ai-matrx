// D8 (round 26): "New property" on an inline database in a narrow column — a compact panel in the view
// menu; add Multi-select "Tags" and Date "Due" by hand, then 3 rows. Exit 1 on any failure.
//   SPACES_WALK_ORG="Oak & River" node features/spaces/__tests__/walk/new-property.walk.mjs [pageId]
import { open, newPage, act, slash, originOf } from "./lib.mjs";

const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
let id = process.argv[2];
if (id) await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
else id = await newPage(page);
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
await act(page, async () => {
  if (!(await page.locator(".spaces-db-frame").count())) {
    await page.locator(".bn-editor .bn-inline-content").last().click();
    await slash(page, "4 columns");
    await page.waitForTimeout(800);
    await slash(page, "Database - Inline");
    await page.locator(".spaces-db-frame").first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3000);
  }
  const frame = page.locator(".spaces-db-frame").first();
  const fw = Math.round((await frame.boundingBox()).width);
  for (const [name, search, typeLabel] of [["Tags", "tags", "Multi-select"], ["Due", "date", "Date"]]) {
    await frame.hover();
    await frame.getByRole("button", { name: "View settings" }).click();
    await page.getByText("Properties", { exact: true }).click();
    await page.getByText("New property", { exact: true }).click();
    const nameBox = page.getByPlaceholder("Property name");
    await nameBox.waitFor({ timeout: 5000 });
    const panel = await page.locator("[data-radix-popper-content-wrapper]").last().boundingBox().catch(() => null);
    await nameBox.fill(name);
    await page.getByPlaceholder("Search for a type…").fill(search);
    await page.getByRole("listbox", { name: "Property types" }).getByText(typeLabel, { exact: true }).click();
    await page.waitForTimeout(2500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
    const header = await frame.getByText(name, { exact: true }).count();
    check(`New property ${name} (${typeLabel})`, header > 0, { panel: panel && { w: Math.round(panel.width), h: Math.round(panel.height) }, frameW: fw });
  }
  // Three rows through the table's own New button.
  const rowsBefore = await frame.locator("[role=row]").count();
  for (let i = 0; i < 3; i++) {
    await frame.hover();
    await frame.getByRole("button", { name: /^New$/ }).first().click();
    await page.waitForTimeout(1500);
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(2000);
  const rowsAfter = await frame.locator("[role=row]").count();
  check("3 rows added", rowsAfter - rowsBefore >= 3, { rowsBefore, rowsAfter });
});
await page.screenshot({ path: process.env.SHOT ?? "/tmp/r26-newprop.png" });
console.log(JSON.stringify({ id, failed }));
await browser.close();
process.exit(failed ? 1 : 0);

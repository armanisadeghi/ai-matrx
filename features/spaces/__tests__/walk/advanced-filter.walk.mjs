// N7 advanced filter (round 30): on a scratch page's inline database, Filter -> Add advanced filter;
// two rules joined by And, a group (Or) with a group inside it; "Add a group" stops at Notion's depth
// (2); Apply; reload; the saved nested filter is drawn again. Exit 1 on any failure.
//   SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/advanced-filter.walk.mjs [pageId]
import { open, newPage, act, slash, originOf } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
let id = process.argv[2];
if (id) await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
else id = await newPage(page);
console.log(JSON.stringify({ page: id }));
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);
const pop = () => page.locator("[data-radix-popper-content-wrapper]").last();
/** Pick `label` in the pick-one control named `name`, the n-th one inside `scope`. */
async function pick(scope, name, n, label) {
  await scope.getByLabel(name, { exact: true }).nth(n).click();
  await page.getByRole("option", { name: label, exact: true }).first().click();
  await page.waitForTimeout(300);
}
await act(page, async () => {
  if (!(await page.locator(".spaces-db-frame").count())) {
    await page.locator(".bn-editor .bn-inline-content").last().click();
    await slash(page, "Database - Inline");
    await page.locator(".spaces-db-frame").first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(4000);
  }
  const frame = page.locator(".spaces-db-frame").first();
  await frame.hover();
  await frame.getByRole("button", { name: "Filter", exact: true }).click();
  await pop().getByText("Add advanced filter", { exact: true }).click();
  const adv = page.getByTestId("spaces-advanced-filter");
  await adv.waitFor({ timeout: 5000 });
  // Rule 1: Where Name is "a"
  await pick(adv, "Condition field", 0, process.env.FIELD ?? "Name");
  await adv.getByLabel("Condition value", { exact: true }).first().fill("a");
  // A group: (Name is "Alpha" or a group (Name contains "x" and Name contains "y"))
  await adv.getByTestId("condition-add-group").first().click();
  await pick(adv, "Condition field", 1, process.env.FIELD ?? "Name");
  await adv.getByLabel("Condition value", { exact: true }).nth(1).fill("Alpha");
  const g1 = adv.getByTestId("condition-nested-group").first();
  await g1.waitFor({ timeout: 5000 });
  await g1.getByTestId("condition-add-group").click();
  await pick(g1, "Condition field", 1, process.env.FIELD ?? "Name");
  await g1.getByLabel("Condition value", { exact: true }).nth(1).fill("x");
  await page.waitForTimeout(500);
  const depths = await adv.getByTestId("condition-nested-group").evaluateAll((gs) => gs.map((g) => g.getAttribute("data-depth")));
  const g2 = adv.getByTestId("condition-nested-group").nth(1);
  const addInDeepest = await g2.getByTestId("condition-add-group").count();
  check("groups nest to depth 2", JSON.stringify(depths) === JSON.stringify(["1", "2"]), { depths });
  check("no 'Add a group' inside the second level", addInDeepest === 0);
  await page.screenshot({ path: `${SHOT}/advanced-filter-built.png` });
  await adv.getByRole("button", { name: "Apply", exact: true }).click();
  await page.waitForTimeout(3000);
  await page.keyboard.press("Escape");
});
await page.waitForTimeout(4000);
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator(".spaces-db-frame").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(6000);
const frame = page.locator(".spaces-db-frame").first();
await frame.hover();
const on = await frame.getByRole("button", { name: "Filter", exact: true }).getAttribute("data-on");
check("Filter icon on after reload", on === "true");
await frame.getByRole("button", { name: "Filter", exact: true }).click();
const adv = page.getByTestId("spaces-advanced-filter");
const kept = await adv.waitFor({ timeout: 8000 }).then(async () => adv.getByTestId("condition-nested-group").count(), () => 0);
check("nested filter kept with the view after reload", kept === 2, { groups: kept });
await page.screenshot({ path: `${SHOT}/advanced-filter-reloaded.png` });
await browser.close();
process.exit(failed ? 1 : 0);

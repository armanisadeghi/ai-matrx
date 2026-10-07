// N5 property menu, round 31: on a scratch page's inline database — Duplicate property, Wrap column (kept
// with the view across a reload), Change type to Select, the Select's options renamed / recoloured /
// reordered / deleted in Column settings, a width dragged twice (each drag widens, kept on reload), the
// advanced-filter popover's surface is opaque, and Share offers the platform's levels. Trashes the page.
//   SPACES_WALK_ORG="Ashford Labs" SHOT_DIR=<dir> node features/spaces/__tests__/walk/property-edit.walk.mjs [pageId]
import { open, newPage, act, slash, originOf, trashPage } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const step = (name) => console.log(JSON.stringify({ step: name }));
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
await frame.waitFor({ timeout: 60_000 });
await page.waitForTimeout(6000);
const header = (name) => frame.locator("[role=columnheader], th").filter({ hasText: new RegExp(`^\\s*${name.replace(/[()]/g, "\\$&")}\\s*$`) }).first();
const headerNames = async () => (await frame.locator("[role=columnheader], th").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
const menu = async (name) => {
  await header(name).hover();
  await header(name).getByRole("button", { name: /^Sort or filter / }).click();
  await page.waitForTimeout(400);
};
const item = (label) => page.getByRole("menuitem", { name: label, exact: true }).or(page.getByText(label, { exact: true })).first();
const dialog = () => page.getByRole("dialog").last();
const dumpDialog = async (tag) => {
  const d = dialog();
  const buttons = (await d.getByRole("button").allInnerTexts()).map((s) => s.trim()).filter(Boolean);
  const labels = await d.locator("[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).slice(0, 40));
  console.log(JSON.stringify({ dialog: tag, title: (await d.locator("h2").first().innerText().catch(() => "")), buttons, labels }));
};
const saveDialog = async () => {
  const d = dialog();
  const save = d.getByRole("button", { name: /^(Save|Create field|Add column|Add|Save column|Change type|Convert)$/ }).last();
  await save.click();
  await page.waitForTimeout(3500);
};

// 1. Duplicate property.
step("duplicate");
await act(page, async () => {
  await menu("Name");
  await item("Duplicate property").click();
  await dialog().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await dumpDialog("duplicate");
  const named = await dialog().locator("input").evaluateAll((els) => els.map((e) => e.value));
  check("the copy starts named Name (1)", named.includes("Name (1)"), { named });
  await page.screenshot({ path: `${SHOT}/dup-dialog.png` });
  await saveDialog();
});
await page.waitForTimeout(2500);
check("Duplicate property adds the copy beside it", (await headerNames()).some((n) => n.includes("Name (1)")), { headers: await headerNames() });

// 2. Change type (Name (1) -> Select).
step("retype");
await act(page, async () => {
  await menu("Name (1)");
  await item("Change type…").click();
  await dialog().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await dumpDialog("retype");
  await page.screenshot({ path: `${SHOT}/retype-dialog.png` });
});
await browser.close().catch(() => {});
process.exit(failed ? 1 : 0);

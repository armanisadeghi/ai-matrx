// N6 (round 29): Notion's calculation row on an inline database. On a NEW page as test@test.com: a new
// inline database, a Number property "Budget", two rows (one with a budget); pick Sum under Budget and
// Percent empty under Name; reload; the footer still says both. Exit 1 on any failure.
//   node features/spaces/__tests__/walk/calc-row.walk.mjs
import { open, newPage, act, slash, trashPage } from "./lib.mjs";

const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
const id = await newPage(page);
await page.waitForTimeout(2000);
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const frame = page.locator(".spaces-db-frame").first();
const footer = () => page.evaluate(() => [...document.querySelectorAll(".spaces-db-frame tfoot [data-records-summary]")].map((b) => ({ key: b.getAttribute("data-records-summary"), text: b.textContent?.trim() })));
await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").last().click();
  await slash(page, "Database - Inline");
  await frame.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  await frame.hover();
  await frame.getByRole("button", { name: "View settings" }).click();
  await page.getByText("Properties", { exact: true }).click();
  await page.getByText("New property", { exact: true }).click();
  await page.getByPlaceholder("Property name").fill("Budget");
  await page.getByPlaceholder("Search for a type…").fill("number");
  await page.getByRole("listbox", { name: "Property types" }).getByText("Number", { exact: true }).click();
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  for (let i = 0; i < 2; i++) {
    await frame.hover();
    await frame.getByRole("button", { name: /^New( page)?$/ }).first().click();
    await page.waitForTimeout(1800);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
});
await page.waitForTimeout(2000);
const before = await footer();
check("every column has a Calculate cell", before.length >= 2 && before.every((c) => c.text === "Calculate"), { before });
const budgetKey = before.find((c) => /budget/i.test(c.key ?? ""))?.key ?? before[1]?.key;
const nameKey = before[0]?.key;
// A value in one row's Budget so Sum has something to add.
await act(page, async () => {
  const cell = frame.locator(`tbody [data-matrx-cell-col="${budgetKey}"]`).first();
  await cell.dblclick();
  await page.keyboard.type("1250");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  for (const [key, op] of [[budgetKey, "sum"], [nameKey, "percent_empty"]]) {
    // A real click (no force): the footer cell shows its "Calculate" button on hover, as in Notion.
    const cellBtn = frame.locator(`tfoot [data-records-summary="${key}"]`);
    await cellBtn.scrollIntoViewIfNeeded();
    await cellBtn.hover();
    await page.waitForTimeout(300);
    await cellBtn.click();
    const item = page.locator(`[data-records-summary-choice="${op}"]`);
    await item.waitFor({ timeout: 10_000 });
    await item.click();
    await page.waitForTimeout(1500);
  }
});
const picked = await footer();
console.log(JSON.stringify({ picked }));
await page.waitForTimeout(5000);
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator(".spaces-db-frame tfoot [data-records-summary]").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(5000);
const after = await footer();
const at = (k) => after.find((c) => c.key === k)?.text ?? "";
check("Sum kept under Budget after reload", /^Sum\s*\$?1,?250/.test(at(budgetKey)), { budget: at(budgetKey) });
check("Percent empty kept under Name after reload", /^Empty\s*\d+(\.\d+)?%$/.test(at(nameKey)), { name: at(nameKey) });
console.log(JSON.stringify({ id, failed }));
if (!process.env.KEEP) console.log("trashed", await trashPage(page));
await browser.close();
process.exit(failed ? 1 : 0);

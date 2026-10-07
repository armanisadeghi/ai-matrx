// spaces-agents lane: save mandate test cases through the mandate page's own "Add test case" form (admin).
import { readFileSync } from "node:fs";
import { open, shot } from "./lib.mjs";
const [mandateKey, casesFile, shotPath] = process.argv.slice(2);
const cases = JSON.parse(readFileSync(casesFile, "utf8"));
const { browser, page } = await open({ next: `/administration/intelligence/mandates/${mandateKey}` });
await page.waitForTimeout(4000);
await page.getByRole("tab", { name: "Test" }).or(page.getByRole("button", { name: "Test", exact: true })).first().click({ timeout: 180_000 });
await page.waitForTimeout(4000);
const add = page.getByRole("button", { name: /Add test case/ }).first();
await add.waitFor({ timeout: 180_000 }).catch(async (e) => { await page.screenshot({ path: shotPath }); throw e; });
for (const c of cases) {
  if (!(await page.getByLabel("Test case name").isVisible().catch(() => false))) await add.click();
  await page.getByLabel("Test case name").fill(c.label);
  await page.getByLabel("Test variables as JSON").fill(JSON.stringify(c.variables, null, 2));
  await page.getByPlaceholder("User message (optional)").fill(c.user_input ?? "");
  await page.getByRole("button", { name: "Save test case" }).click();
  await page.getByText("Test case saved.").first().waitFor({ timeout: 30_000 }).catch(async (e) => { await page.screenshot({ path: shotPath }); console.log((await page.locator("[data-sonner-toast]").allTextContents()).join(" || ")); throw e; });
  console.log("saved:", c.label);
  await page.waitForTimeout(800);
}
if (shotPath) await page.screenshot({ path: shotPath, fullPage: false });
console.log("url:", page.url());
await browser.close();

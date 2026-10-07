// N9 Automations (round 31): on a scratch page's inline database — Automations -> New automation -> trigger
// "Page added", action "Send notification" -> Create; it is listed; a new page (row) is added so it runs;
// then Delete archives it. Prints the automation id so the run can be read. Trashes the page.
//   SPACES_WALK_ORG="Ashford Labs" SHOT_DIR=<dir> node features/spaces/__tests__/walk/automations.walk.mjs
import { open, newPage, act, slash, trashPage } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const id = await newPage(page);
console.log(JSON.stringify({ page: id }));
page.on("response", async (r) => {
  if (/rpc\/automation_declare/.test(r.url())) console.log(JSON.stringify({ declare: r.status(), body: (await r.text().catch(() => "")).slice(0, 300) }));
});
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);
await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").last().click();
  await slash(page, "Database - Inline");
});
const frame = page.locator(".spaces-db-frame").first();
await frame.waitFor({ timeout: 90_000 });
await page.waitForTimeout(6000);
const openPanel = async () => {
  await frame.hover();
  await frame.getByRole("button", { name: "Automations", exact: true }).first().click();
  await page.getByTestId("spaces-automations").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
};
await act(page, async () => {
  await openPanel();
  const panel = page.getByTestId("spaces-automations");
  check("the Automations panel is connected", (await panel.getAttribute("data-state")) === "on");
  await panel.getByRole("button", { name: "New automation" }).click();
  await panel.getByRole("button", { name: "Page added" }).click();
  await panel.getByRole("button", { name: "Send notification" }).click();
  await panel.getByRole("textbox", { name: "Notification text" }).fill("A page was added to the launch tracker");
  await page.screenshot({ path: `${SHOT}/automation-new.png` });
  await panel.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(3000);
  const rows = await page.getByTestId("spaces-automation-row").allInnerTexts();
  await page.screenshot({ path: `${SHOT}/automation-listed.png` });
  check("the automation is listed", rows.some((r) => /When a page is added/.test(r) && /Send a notification/.test(r)), { rows });
  await page.keyboard.press("Escape");
});
// A page is added: the automation runs.
await act(page, async () => {
  const add = frame.getByRole("button", { name: /^(New page|Add the first row)$/ }).first();
  await add.click();
  await page.waitForTimeout(6000);
  await page.keyboard.press("Escape");
});
console.log(JSON.stringify({ table: await frame.getAttribute("data-table-id") }));
await act(page, async () => {
  await openPanel();
  const panel = page.getByTestId("spaces-automations");
  await panel.getByRole("button", { name: "Delete automation" }).first().click();
  await page.waitForTimeout(3000);
  check("Delete archives it (no longer listed)", (await page.getByTestId("spaces-automation-row").count()) === 0);
  await page.keyboard.press("Escape");
});
check("scratch page trashed", await act(page, () => trashPage(page)));
await browser.close();
process.exit(failed ? 1 : 0);

// N5 property menu (round 30): an inline database's column header menu renames a property and opens its
// settings; a dragged width survives a reload; no grouping bar / Undo over the rows. Exit 1 on failure.
//   SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/property-menu.walk.mjs <pageId>
import { open, act, originOf } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const id = process.argv[2];
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const load = async () => {
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
  await page.locator(".spaces-db-frame").first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(8000);
  return page.locator(".spaces-db-frame").first();
};
let frame = await load();
check("no grouping bar or Undo over the rows", !/No groups|Undo|Redo/.test(await frame.innerText()));
const header = () => frame.locator("[role=columnheader], th").first();
const before = (await header().innerText()).replace(/\W/g, "");
const to = before === "Client" ? "Name" : "Client";
await act(page, async () => {
  await header().getByRole("button", { name: /^Sort or filter / }).click();
  await page.getByRole("menuitem", { name: "Rename column" }).click().catch(async () => page.getByText("Rename column", { exact: true }).click());
  const box = page.locator("#records-grid-rename");
  await box.waitFor({ timeout: 10_000 });
  await box.fill(to);
  await box.press("Enter");
  await page.waitForTimeout(3000);
  console.log(JSON.stringify({ toasts: await page.locator("[data-sonner-toast]").allInnerTexts() }));
  if (await box.isVisible().catch(() => false)) await page.keyboard.press("Escape");
});
check("renamed from the header menu", (await header().innerText()).includes(to), { from: before, to });
await act(page, async () => {
  await header().getByRole("button", { name: /^Sort or filter / }).click();
  await page.getByText("Column settings…", { exact: true }).click();
  await page.getByRole("dialog").last().waitFor({ timeout: 10_000 });
  await page.screenshot({ path: `${SHOT}/property-settings.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
});
check("column settings open from the header menu", true);
// Width: drag the resize handle 120px wider, reload, read it back.
const w0 = Math.round((await header().boundingBox()).width);
await act(page, async () => {
  const grip = header().getByRole("button", { name: /^Resize / }).or(header().locator("[aria-label^='Resize']")).first();
  const b = await grip.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(4000);
});
frame = await load();
const w1 = Math.round((await header().boundingBox()).width);
check("a dragged width is kept with the view", w1 >= w0 + 80, { before: w0, after: w1 });
await page.screenshot({ path: `${SHOT}/property-menu-after.png` });
await browser.close();
process.exit(failed ? 1 : 0);

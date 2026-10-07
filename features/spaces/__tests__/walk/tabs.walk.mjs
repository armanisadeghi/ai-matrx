// N1 Tabs (round 29): on a NEW page as test@test.com, "/Tabs" makes a Tabs block; type a different
// block into each tab, rename a tab, add a third, drag it first; reload; every tab, name, order and
// block is kept. Exit 1 on any loss.  node features/spaces/__tests__/walk/tabs.walk.mjs
import { open, newPage, act, slash, trashPage } from "./lib.mjs";

const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
const id = await newPage(page);
await page.waitForTimeout(1500);
const tag = Math.random().toString(36).slice(2, 6);
const strip = () => page.locator(".spaces-tabs-strip").first();
const tabNames = () => strip().locator(".spaces-tabs-tab").allTextContents();
const visibleText = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".bn-editor .bn-inline-content")].filter((n) => n.offsetParent !== null).map((n) => n.textContent).join("|"),
  );

await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").first().click();
  await slash(page, "Tabs");
  await page.waitForTimeout(800);
  // The caret lands in tab 1's first line.
  await page.keyboard.type(`alpha-${tag}`);
  await strip().locator(".spaces-tabs-tab").nth(1).click();
  await page.waitForTimeout(300);
  await page.locator(".bn-editor .bn-inline-content").filter({ visible: true }).last().click();
  await page.keyboard.type(`[] beta-${tag}`);
  // Rename tab 2.
  await strip().locator(".spaces-tabs-tab").nth(1).dblclick();
  const input = page.locator(".spaces-tabs-rename");
  await input.fill(`Notes ${tag}`);
  await input.press("Enter");
  await page.waitForTimeout(500);
  if (process.env.DEBUG) console.log("after rename", await tabNames(), await visibleText());
  // Add a third tab, type into it, drag it first.
  await page.getByRole("button", { name: "Add tab" }).click();
  await page.waitForTimeout(500);
  await page.keyboard.type(`gamma-${tag}`);
  if (process.env.DEBUG) { console.log("after add", await tabNames(), await visibleText()); await page.screenshot({ path: "/private/tmp/claude-501/-Users-armanisadeghi-code/db806665-ddea-4e74-9a56-5c7d29379e0a/scratchpad/tabs.png" }); }
  await strip().locator(".spaces-tabs-tab").nth(2).dragTo(strip().locator(".spaces-tabs-tab").nth(0));
});
await page.waitForTimeout(800);
const before = { names: await tabNames(), shown: await visibleText() };
await page.waitForTimeout(4000);
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator(".spaces-tabs-strip").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);
const names = await tabNames();
const contents = [];
for (let i = 0; i < names.length; i++) {
  await strip().locator(".spaces-tabs-tab").nth(i).click();
  await page.waitForTimeout(250);
  contents.push(await visibleText());
}
const todoInBeta = await page.evaluate(() => !!document.querySelector('.bn-block-content[data-content-type="checkListItem"]'));
const expectNames = ["Tab 3", "Tab 1", `Notes ${tag}`];
let failed = 0;
if (JSON.stringify(names) !== JSON.stringify(expectNames)) failed++;
if (!contents[0]?.includes(`gamma-${tag}`) || contents[0]?.includes(`alpha-${tag}`)) failed++;
if (!contents[1]?.includes(`alpha-${tag}`) || contents[1]?.includes(`beta-${tag}`)) failed++;
if (!contents[2]?.includes(`beta-${tag}`) || contents[2]?.includes(`gamma-${tag}`)) failed++;
if (!todoInBeta) failed++;
console.log(JSON.stringify({ id, before, after: { names, contents, todoInBeta }, failed }));
if (!process.env.KEEP) console.log("trashed", await trashPage(page));
await browser.close();
process.exit(failed ? 1 : 0);

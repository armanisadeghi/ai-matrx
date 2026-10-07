// A database in a narrow column (round 22, item 2): 4 columns, a Table view of Tasks in the first.
// Measures the frame, its toolbar and its body against the column; screenshots before trash.
//   node features/spaces/__tests__/walk/narrow-database.walk.mjs [pageId]
import { open, newPage, act, slash, originOf, trashPage } from "./lib.mjs";

const OUT = process.env.WALK_OUT ?? "/tmp";
const { browser, page } = await open();
let id = process.argv[2];
if (id) {
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
  await page.locator(".spaces-db-frame").first().waitFor({ timeout: 90_000 });
} else {
  id = await newPage(page);
  await act(page, async () => {
    await page.locator(".bn-block-content").first().click();
    await slash(page, "4 columns");
    await page.waitForTimeout(800);
    await slash(page, "Table view");
    const dlg = page.getByRole("dialog");
    await dlg.getByRole("button", { name: /^Tasks$/ }).first().click();
  });
  await page.locator(".spaces-db-frame").first().waitFor({ timeout: 60_000 });
}
await page.waitForTimeout(4000);
const m = await page.evaluate(() => {
  const r = (el) => (el ? (({ x, width, right }) => ({ x: Math.round(x), w: Math.round(width), right: Math.round(right) }))(el.getBoundingClientRect()) : null);
  const frame = document.querySelector(".spaces-db-frame");
  const col = frame?.closest(".bn-block-outer");
  const bar = frame?.querySelector(".spaces-db-bar");
  const tools = frame?.querySelector(".spaces-db-tools");
  const body = frame?.querySelector(".spaces-db-body");
  return { col: r(col), frame: r(frame), bar: r(bar), tools: r(tools), body: r(body), bodyScrollW: body?.scrollWidth, bodyClientW: body?.clientWidth };
});
console.log(JSON.stringify({ id, ...m }));
await page.screenshot({ path: `${OUT}/narrow-db.png` });
if (process.env.WALK_TRASH) console.log("trashed", await trashPage(page));
await browser.close();

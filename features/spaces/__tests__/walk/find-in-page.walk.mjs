// Find in page (round 29, N4): a new page with "apple" on a line and inside a CLOSED toggle; Cmd+F, type
// "apple": the count reads 1/2; Enter steps to the toggle's match and opens the toggle. Trashes the page.
//   MEMBER=1 SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/find-in-page.walk.mjs
import { open, newPage, slash, act, shot, trashPage } from "./lib.mjs";

const { browser, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
const id = await newPage(page);
console.log("page", id);
await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").last().click();
  await page.keyboard.type("An apple a day", { delay: 15 });
  await page.keyboard.press("Enter");
  await slash(page, "Toggle list");
  await page.keyboard.type("Fruit", { delay: 15 });
  // The next line, indented with Tab, sits inside the toggle.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(300);
  await page.keyboard.type("Hidden apple pie", { delay: 15 });
});
// Close the toggle.
await act(page, async () => {
  await page.locator(".bn-toggle-button").first().click();
});
await page.waitForTimeout(400);
const hiddenBefore = await page.getByText("Hidden apple pie").isVisible();
await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").first().click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+f" : "Control+f");
});
const box = page.getByRole("searchbox", { name: "Find in page" }).or(page.getByLabel("Find in page"));
await box.first().waitFor({ timeout: 5000 });
await box.first().fill("apple");
await page.waitForTimeout(500);
const count1 = await page.locator(".spaces-find-count").textContent();
await box.first().press("Enter");
await page.waitForTimeout(600);
const count2 = await page.locator(".spaces-find-count").textContent();
const hiddenAfter = await page.getByText("Hidden apple pie").isVisible();
const painted = await page.evaluate(() => (CSS.highlights?.get("spaces-find")?.size ?? 0));
await shot(page, process.env.SHOT ?? "/tmp/find-in-page.png");
console.log(JSON.stringify({ hiddenBefore, count1, count2, hiddenAfter, painted }));
await page.keyboard.press("Escape");
console.log("trashed:", await trashPage(page));
await browser.close();
const ok = hiddenBefore === false && count1 === "1/2" && count2 === "2/2" && hiddenAfter === true && painted === 2;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);

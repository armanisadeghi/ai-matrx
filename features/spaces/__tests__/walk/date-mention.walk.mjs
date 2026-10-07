// Date mentions (round 29, N2): on a new page "@tomorrow" offers Tomorrow under Date; picking it inserts a
// date mention that reads "@Tomorrow" and is still there after the page saves and reloads. Trashes the page.
//   MEMBER=1 SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/date-mention.walk.mjs
import { open, newPage, act, shot, trashPage, originOf } from "./lib.mjs";

const { browser, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
const id = await newPage(page);
console.log("page", id);
await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").last().click();
  await page.keyboard.type("Launch on @tomorrow", { delay: 30 });
});
const item = page.locator(".bn-suggestion-menu-item, [role=option]").filter({ hasText: /^\s*Tomorrow/ }).first();
await item.waitFor({ timeout: 10_000 });
await act(page, () => item.click());
await page.waitForTimeout(3500);
const before = await page.locator(".spaces-mention[data-date]").first().textContent();
await shot(page, process.env.SHOT ?? "/tmp/date-mention.png");
await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
await page.locator(".spaces-mention[data-date]").first().waitFor({ timeout: 60_000 }).catch(() => {});
const after = await page.locator(".spaces-mention[data-date]").first().textContent().catch(() => null);
const iso = await page.locator(".spaces-mention[data-date]").first().getAttribute("data-date").catch(() => null);
console.log(JSON.stringify({ before, after, iso }));
console.log("trashed:", await trashPage(page));
await browser.close();
const ok = before === "@Tomorrow" && after === "@Tomorrow";
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);

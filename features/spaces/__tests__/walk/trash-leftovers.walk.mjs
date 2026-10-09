// Put scratch pages left by failed walks in Trash, through the page's ••• menu. MEMBER=1 signs in as test@test.com.
//   [MEMBER=1] node features/spaces/__tests__/walk/trash-leftovers.walk.mjs <page id> [<page id>…]
import { open, originOf, trashPage } from "./lib.mjs";

const { browser, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
let failed = 0;
for (const id of process.argv.slice(2)) {
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.locator(".bn-editor").first().waitFor({ timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const already = await page.getByText("This page is in Trash.").first().isVisible().catch(() => false);
  const trashed = already || (await trashPage(page).catch(() => false));
  if (!trashed) failed++;
  console.log(JSON.stringify({ page: id, trashed, already }));
}
await browser.close();
process.exit(failed ? 1 : 0);

import { open, originOf, act, trashPage } from "./lib.mjs";
const { browser, page } = await open({ member: true, width: 1600, height: 1100 });
for (const id of process.argv.slice(2)) {
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
  await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(2000);
  await act(page, () => trashPage(page)).then(() => console.log("trashed", id), (e) => console.log("fail", id, String(e).slice(0, 200)));
}
await browser.close();

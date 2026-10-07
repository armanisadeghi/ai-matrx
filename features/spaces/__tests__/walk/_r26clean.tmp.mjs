import { open, originOf, trashPage, act, blockMenu } from "./lib.mjs";
const KEEP = "7dc7626d-b2c7-499b-87d2-683d300c2366";
const TESTER = "e38508c0-dfa6-4145-a6f9-f390fa8ee743";
const mine = ["c7beb49b-dbc2-4199-b7b3-ea9a393c092d","dcd77763-2382-4df3-a3b3-c76d95b1fa52","dc47ad4d-bc7e-4d59-8151-3ae5fa67654f","2c7c0628-a8ba-45df-9daa-c709bb1a91f6","d0b532c6-c8de-45bb-94d2-2a1c59caeed6","dc27398d-8478-4868-b817-3e00a99e0e90","6467ec9c-dfc8-427b-beaf-628e59a6a755","d3b96ab1-f64b-4b7c-9ac4-6a0b2490e1f1","829b4c52-28d0-4be1-8aa2-8cd4477b0daa","00499baf-3fb1-43d1-9297-0528989c8700","7d26db05-aa36-4ba0-9688-f80e42db9e5b","0fbfb1a6-de50-4f18-a99a-7071102c4dd6","42b8cca7-afa0-4124-82ef-2909d5f93112","d5e64e8b-19ff-4016-b2fc-491c65f50562","4bfbd98d-5538-4e41-b55a-62985f03bcf7","6a098582-a8cd-4094-9fcf-43c97d67c57f","37ae8cbe-c2f8-4e52-aa01-7803c0db8853","e1d8fa33-4f39-41d2-8dfd-5d366f88acc9"];
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
await page.goto(`${originOf(page)}/spaces/${KEEP}`);
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(3000);
// The tester's stray top-level "Untitled" pages: the sidebar rows titled Untitled.
const untitled = await page.evaluate(() => [...document.querySelectorAll("a[href*='/spaces/']")].filter((a) => a.textContent?.trim() === "Untitled").map((a) => a.getAttribute("href").match(/[0-9a-f-]{36}/)?.[0]).filter(Boolean));
const ids = [...new Set([...mine, ...untitled])].filter((x) => x !== KEEP && x !== TESTER);
console.log("to trash", ids.length, "untitled in sidebar", untitled.length);
let n = 0;
for (const id of ids) {
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
  const ok = await page.locator(".bn-editor, .spaces-trash-banner").first().waitFor({ timeout: 30_000 }).then(() => true, () => false);
  if (!ok || (await page.getByText("This page is in Trash.").count())) continue;
  await page.waitForTimeout(1200);
  if (await act(page, () => trashPage(page)).catch(() => false)) n++;
}
console.log("trashed", n);
// The tester's page: "/Page" and "/Database - Inline" lines left as text go.
await page.goto(`${originOf(page)}/spaces/${TESTER}`);
await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(4000);
let removed = 0;
for (let i = 0; i < 10; i++) {
  const stray = page.locator(".bn-block-content").filter({ hasText: /^\/(Page|Database - Inline)$/ }).first();
  if (!(await stray.count())) break;
  await act(page, async () => {
    await blockMenu(page, stray);
    await page.locator(".bn-menu-dropdown").getByText("Delete", { exact: true }).first().click();
  });
  removed++;
  await page.waitForTimeout(800);
}
await page.waitForTimeout(4000);
console.log("leftover lines removed", removed, "left:", await page.locator(".bn-block-content").filter({ hasText: /^\/\w/ }).count());
await browser.close();

// N3 suggested edits (round 32), as test@test.com on a scratch page: write a line, switch on Page options ->
// "Suggest edits", type an addition and delete a word — both stay as suggestions (insert underlined, delete struck)
// and survive a reload (stored span `suggestion`). Switch suggest mode off; Accept the addition and the deletion
// from their cards -> the line reads as accepted. Trashes the page. Exit 1 on failure.
//   SPACES_WALK_ORG="Ashford Labs" SHOT_DIR=<dir> node features/spaces/__tests__/walk/suggest.walk.mjs
import { open, newPage, act, originOf, trashPage } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const id = await newPage(page);
console.log(JSON.stringify({ page: id }));
await page.waitForTimeout(2500);
const body = () => page.locator(".bn-editor").first();
const firstLine = () => body().locator(".bn-inline-content").first();
const toggleSuggest = async () => {
  await page.getByRole("button", { name: "Page options", exact: true }).first().click();
  await page.getByText("Suggest edits", { exact: true }).click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
};
await act(page, async () => {
  await firstLine().click();
  await page.keyboard.type("Original text", { delay: 20 });
  await page.waitForTimeout(2500);
  await toggleSuggest();
  await firstLine().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" added", { delay: 40 });
  // Select the word "Original" (the first 8 characters of the line) and delete it.
  await page.evaluate(() => {
    const line = document.querySelector(".bn-editor .bn-inline-content");
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode();
    const r = document.createRange();
    r.setStart(text, 0);
    r.setEnd(text, 8);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  });
  await page.waitForTimeout(300);
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(3500);
});
const ins = body().locator('[data-suggestion-kind="insert"]');
const del = body().locator('[data-suggestion-kind="delete"]');
check("typing in suggest mode is an insert suggestion", (await ins.allInnerTexts()).join("") === " added", { ins: await ins.allInnerTexts() });
check("deleting in suggest mode is a delete suggestion (text kept)", (await del.allInnerTexts()).join("") === "Original", { del: await del.allInnerTexts(), line: await firstLine().innerText() });
await page.screenshot({ path: `${SHOT}/suggest-made.png` });
await page.locator('.spaces-edited[data-state="saved"]').waitFor({ timeout: 30_000 }).catch(() => {});
await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
await body().waitFor({ timeout: 90_000 });
await page.waitForTimeout(4000);
check("suggestions are kept after a reload", (await ins.count()) > 0 && (await del.count()) > 0);
await act(page, async () => {
  await toggleSuggest(); // off
  await ins.first().click();
  await page.getByTestId("spaces-suggestion-card").waitFor({ timeout: 10_000 });
  await page.screenshot({ path: `${SHOT}/suggest-card.png` });
  await page.getByRole("button", { name: "Accept suggestion" }).click();
  await page.waitForTimeout(500);
  await del.first().click();
  await page.getByRole("button", { name: "Accept suggestion" }).click();
  await page.waitForTimeout(2500);
});
const line = (await firstLine().innerText()).trim();
check("accepting both leaves the edited line", line === "text added" && (await ins.count()) === 0 && (await del.count()) === 0, { line });
await page.screenshot({ path: `${SHOT}/suggest-accepted.png` });
check("scratch page trashed", await act(page, () => trashPage(page)));
await browser.close();
process.exit(failed ? 1 : 0);

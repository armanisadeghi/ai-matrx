// "Can edit content" (edit_content) on a Space (round 32). The admin makes a scratch page with a line and an inline
// database, opens Share -> Invite: the level picker reads Full access · Can edit · Can edit content · Can comment ·
// Can view (Notion's order); shares with test@test.com at Can edit content. As test@test.com: the page body is editable
// and an edit saves; a row can be added to the database; the page's structure controls (Move to, Move to Trash, Lock
// page) are not offered and the Share dialog has no invite form. The admin then trashes the page. Exit 1 on failure.
//   SPACES_WALK_ORG="Bayside Orthodontics" SHOT_DIR=<dir> node features/spaces/__tests__/walk/edit-content.walk.mjs
import { open, newPage, act, slash, originOf, trashPage, chromium, loginUrl } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const stamp = Date.now() % 100000;
const { browser, page } = await open({ member: false, width: 1440, height: 1000 });
const id = await newPage(page);
console.log(JSON.stringify({ page: id }));
await page.waitForTimeout(2500);
const body = (p) => p.locator(".bn-editor").first();
await act(page, async () => {
  await body(page).locator(".bn-inline-content").first().click();
  await page.keyboard.type(`Clinic roadmap ${stamp}`, { delay: 15 });
  await page.keyboard.press("Enter");
  await slash(page, "Database - Inline");
  await page.locator(".spaces-db-frame").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4000);
  // Settle on the page by address (a late /spaces landing redirect can move the tab).
  if (!page.url().includes(id)) await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
  await body(page).waitFor({ timeout: 90_000 });
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /^Share$/ }).first().click();
  await page.getByRole("button", { name: "Invite" }).click();
  await page.locator("#user-email").waitFor({ timeout: 30_000 });
  await page.locator("#user-email").fill("test@test.com");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT}/edit-content-invite.png` });
  await page.locator("#user-permission").click({ timeout: 15_000 }).catch(async () => {
    await page.locator("#user-permission").focus();
    await page.keyboard.press("Enter");
  });
  const options = await page.getByRole("option").allInnerTexts();
  check("the picker reads Notion's levels in Notion's order", options.join(" · ") === "Full access · Can edit · Can edit content · Can comment · Can view", { options });
  await page.getByRole("option", { name: "Can edit content" }).click();
  await page.screenshot({ path: `${SHOT}/edit-content-picker.png` });
  await page.getByRole("button", { name: "Share with User" }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOT}/edit-content-shared.png` });
  await page.keyboard.press("Escape");
});

// As test@test.com.
const b2 = await chromium.launch({ headless: true });
const ctx2 = await b2.newContext({ viewport: { width: 1440, height: 1000 } });
const p2 = await ctx2.newPage();
await p2.goto(loginUrl(`/spaces/${id}`, true), { waitUntil: "domcontentloaded", timeout: 120_000 });
await p2.waitForURL((u) => u.pathname.includes(id), { timeout: 120_000 }).catch(() => {});
await body(p2).waitFor({ timeout: 120_000 });
await p2.waitForTimeout(6000);
const editable = (await body(p2).getAttribute("contenteditable")) === "true";
check("a content editor can write in the page", editable);
const words = ` and the spring recall plan`;
if (editable) {
  await body(p2).getByText(`Clinic roadmap ${stamp}`).click();
  await p2.keyboard.press("End");
  await p2.keyboard.type(words, { delay: 15 });
  const saved = await p2.locator('.spaces-edited[data-state="saved"]').waitFor({ timeout: 30_000 }).then(() => true, () => false);
  await p2.waitForTimeout(3000);
  check("their edit saves", saved && !(await p2.locator("[data-sonner-toast]").filter({ hasText: /cannot edit|refused/i }).count()));
}
// A row: the database's "+ New page" row.
const frame = p2.locator(".spaces-db-frame").first();
await frame.waitFor({ timeout: 60_000 }).catch(() => {});
await p2.waitForTimeout(4000);
// The page's own inline database is part of the page (association page_database): its share reaches the table.
check("the page's inline database opens for the content editor", !(await frame.getByText(/isn.t shared with you/).count()));
const before = await frame.locator("[role=row]").count();
await frame.getByRole("button", { name: /New( page)?$/ }).first().click().catch(() => {});
await p2.waitForTimeout(5000);
const after = await frame.locator("[role=row]").count();
check("a content editor can add a row", after > before, { before, after });
await p2.screenshot({ path: `${SHOT}/edit-content-member.png` });
await p2.getByRole("button", { name: "Page options", exact: true }).first().click();
await p2.waitForTimeout(800);
const menu = await p2.locator("[data-radix-popper-content-wrapper]").last().innerText().catch(() => "");
check("structure controls are not offered (Move to, Move to Trash, Lock page)", !/Move to|Lock page/.test(menu), { menu: menu.replace(/\s+/g, " ").slice(0, 200) });
await p2.keyboard.press("Escape");
await p2.getByRole("button", { name: /^Share$/ }).first().click();
const invite = p2.getByRole("button", { name: "Invite" });
if (await invite.isVisible().catch(() => false)) await invite.click();
await p2.waitForTimeout(2500);
check("the Share dialog offers no invite form", (await p2.locator("#user-email").count()) === 0);
await p2.screenshot({ path: `${SHOT}/edit-content-share.png` });
await b2.close();

// The admin sees the edit, then trashes the page.
await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
await body(page).waitFor({ timeout: 90_000 });
await page.waitForTimeout(5000);
check("the owner sees the content editor's words", (await body(page).getByText(words.trim(), { exact: false }).count()) > 0);
check("scratch page trashed", await act(page, () => trashPage(page)));
// Leftovers of an earlier run (argv) go to Trash too.
for (const old of process.argv.slice(2)) {
  await page.goto(`${originOf(page)}/spaces/${old}`, { waitUntil: "domcontentloaded" });
  await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  console.log(JSON.stringify({ leftover: old, trashed: await trashPage(page).catch(() => false) }));
}
await browser.close();
console.log(JSON.stringify({ page: id, origin: originOf(page) }));
process.exit(failed ? 1 : 0);

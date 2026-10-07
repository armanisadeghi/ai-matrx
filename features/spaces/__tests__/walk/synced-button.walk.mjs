// C18 synced block + C19 button + C27 mention notice (round 32), as test@test.com on two scratch pages.
//  1. Page A: "/Synced block", type a line inside it; "Copy and sync"; page B: paste -> a linked copy showing the line.
//  2. Edit inside B's copy; A (reloaded) shows the edit; the bar says "Editing in 2 pages".
//  3. Unsync on B: B keeps the text as plain blocks; A says "Editing in 1 page".
//  4. Page A: "/Button" -> Insert blocks "[] Follow up" + Send notification; press -> a to-do appears below it.
//  5. An "@" person mention on A is saved (the space_payload trigger notifies; the walk prints the mentioned id).
// Trashes both pages. Exit 1 on failure.
//   SPACES_WALK_ORG="Ashford Labs" SHOT_DIR=<dir> node features/spaces/__tests__/walk/synced-button.walk.mjs
import { open, newPage, act, slash, originOf, trashPage } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const { browser, context, page } = await open({ member: true, width: 1440, height: 1000 });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const stamp = Date.now() % 100000;
const line = `Weekly standup notes ${stamp}`;
const edit = ` and the launch checklist`;
const outer = () => page.locator(".bn-editor").first();
const lastLine = () => outer().locator(":scope > .bn-block-group > .bn-block-outer").last().locator(".bn-inline-content").last();

const a = await newPage(page);
console.log(JSON.stringify({ pageA: a }));
await page.waitForTimeout(2500);
let source = null;
await act(page, async () => {
  await lastLine().click();
  await slash(page, "Synced block");
  const synced = page.locator(".spaces-synced").first();
  await synced.waitFor({ timeout: 60_000 });
  source = await synced.getAttribute("data-synced-source");
  await synced.locator(".bn-editor .bn-inline-content").first().waitFor({ timeout: 60_000 });
  await synced.locator(".bn-editor .bn-inline-content").first().click();
  await page.keyboard.type(line, { delay: 15 });
  await page.waitForTimeout(2500);
  await synced.hover();
  await synced.getByRole("button", { name: "Copy and sync" }).click();
  await page.waitForTimeout(800);
});
const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
check("Copy and sync put the synced block on the clipboard", clip === `spaces-synced:${source}`, { clip, source });
await page.screenshot({ path: `${SHOT}/synced-a.png` });
// The source Space is not a page of the sidebar.
check("the synced source is hidden from the sidebar", (await page.locator(`.spaces-sidebar a[href$="${source}"]`).count()) === 0);

const b = await newPage(page);
console.log(JSON.stringify({ pageB: b }));
await page.waitForTimeout(2500);
await act(page, async () => {
  await lastLine().click();
  // A real paste of the clipboard's text (the editor's paste handler reads it).
  await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const target = document.activeElement ?? document.querySelector(".bn-editor");
    target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, clip);
});
const copyB = page.locator(".spaces-synced").first();
const pasted = await copyB.waitFor({ timeout: 60_000 }).then(() => true, () => false);
check("pasting makes a linked copy", pasted && (await copyB.getAttribute("data-synced-source")) === source);
const shows = await copyB.getByText(line).waitFor({ timeout: 60_000 }).then(() => true, () => false);
check("the copy shows the original's content", shows);
await act(page, async () => {
  await copyB.getByText(line).click();
  await page.keyboard.press("End");
  await page.keyboard.type(edit, { delay: 15 });
  await page.waitForTimeout(3500);
});
await copyB.hover();
const countB = await copyB.locator(".spaces-synced-count").innerText().catch(() => "");
check("the bar says Editing in 2 pages", /Editing in 2 pages/.test(countB), { countB });
await page.screenshot({ path: `${SHOT}/synced-b.png` });

// A shows B's edit.
await page.goto(`${originOf(page)}/spaces/${a}`, { waitUntil: "domcontentloaded" });
const syncedA = page.locator(".spaces-synced").first();
await syncedA.waitFor({ timeout: 90_000 });
const editShown = await syncedA.getByText(`${line}${edit}`).waitFor({ timeout: 60_000 }).then(() => true, () => false);
check("an edit in one copy shows in the other", editShown);
await page.screenshot({ path: `${SHOT}/synced-a-after.png` });

// Unsync on B.
await page.goto(`${originOf(page)}/spaces/${b}`, { waitUntil: "domcontentloaded" });
await page.locator(".spaces-synced").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2000);
await act(page, async () => {
  const s = page.locator(".spaces-synced").first();
  await s.hover();
  await s.getByRole("button", { name: "Unsync" }).click();
  await page.waitForTimeout(3500);
});
check("Unsync keeps the content as plain blocks", (await page.locator(".spaces-synced").count()) === 0 && (await outer().getByText(`${line}${edit}`).count()) > 0);
await page.screenshot({ path: `${SHOT}/synced-unsynced.png` });
check("page B trashed", await act(page, () => trashPage(page)));

// Button on A.
await page.goto(`${originOf(page)}/spaces/${a}`, { waitUntil: "domcontentloaded" });
await page.locator(".spaces-synced").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500);
await syncedA.hover();
const countA = await page.locator(".spaces-synced-count").first().innerText().catch(() => "");
check("after Unsync the original says Editing in 1 page", /Editing in 1 page\b/.test(countA), { countA });
await act(page, async () => {
  await lastLine().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await slash(page, "Button");
  const btn = page.getByTestId("spaces-button-block").first();
  await btn.waitFor({ timeout: 30_000 });
  await btn.hover();
  await btn.getByRole("button", { name: "Edit button" }).click();
  const ed = page.getByTestId("spaces-button-editor");
  await ed.getByRole("textbox", { name: "Button name" }).fill("Add follow-up");
  await ed.getByRole("button", { name: "Insert blocks" }).click();
  await ed.getByRole("textbox", { name: "Blocks to insert" }).fill(`[] Follow up ${stamp}`);
  await ed.getByRole("button", { name: "Send notification to" }).click();
  await ed.getByRole("textbox", { name: "Notification text" }).fill(`Follow-up added ${stamp}`);
  await ed.getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOT}/button-set.png` });
  const notified = page.waitForResponse((r) => r.url().includes("space_button_notify"), { timeout: 30_000 }).catch(() => null);
  await btn.getByRole("button", { name: "Add follow-up" }).click();
  const res = await notified;
  check("pressing sends the notification", !!res && res.ok(), { status: res?.status() });
});
const todo = await outer().locator('.bn-block-content[data-content-type="checkListItem"]').filter({ hasText: `Follow up ${stamp}` }).first().waitFor({ timeout: 20_000 }).then(() => true, () => false);
check("pressing inserts the to-do below the button", todo);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOT}/button-pressed.png` });

// Mention a person.
let mentioned = null;
await act(page, async () => {
  await lastLine().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Ask ", { delay: 20 });
  await page.keyboard.type("@", { delay: 20 });
  const item = page.locator(".bn-suggestion-menu-item, [role=option]").filter({ hasNot: page.locator("text=/Today|Tomorrow|Remind/") }).first();
  await item.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const people = page.locator(".bn-suggestion-menu-item, [role=option]");
  const n = await people.count();
  for (let i = 0; i < n; i++) {
    const t = await people.nth(i).innerText();
    if (/@/.test(t) || /Admin|admin/.test(t)) {
      await people.nth(i).click();
      mentioned = t.replace(/\s+/g, " ").trim();
      break;
    }
  }
  if (!mentioned) await page.keyboard.press("Escape");
  await page.waitForTimeout(4000);
});
check("a person mention was placed", !!mentioned, { mentioned });
await page.screenshot({ path: `${SHOT}/mention.png` });
console.log(JSON.stringify({ source, pageA: a, pageB: b, stamp }));
check("page A trashed", await act(page, () => trashPage(page)));
await browser.close();
process.exit(failed ? 1 : 0);

// Round 41 editor items on a new page (B4, B14/N15, C4, C10, C14):
//   nested numbered list draws 1. / a. / i.; "/code" set to Python is colored by Shiki; "[+" makes a sub-page
//   in place and "[[" links to it; "/date" (Inline group) puts a date mention; a simple table's block menu
//   "Turn into database" makes a database block holding its rows. Trashes the page.
//   MEMBER=1 SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/editor-r41.walk.mjs
import { open, newPage, act, shot, slash, trashPage, blockMenu, lastBlock } from "./lib.mjs";

const OUT = process.env.SHOTS ?? "/tmp";
const { browser, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
const id = await newPage(page);
console.log("page", id);
const r = {};
const lastLine = () => page.locator(".bn-block-content[data-content-type=paragraph] .bn-inline-content").last();
/** A fresh empty line at the end of the page (Notion: a click under the last block). */
const endLine = async () => {
  await page.locator("button.spaces-page-end").first().click();
  await page.waitForTimeout(300);
};

// C4 — nested numbering.
await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").last().click();
  await page.keyboard.type("1. Plan the launch", { delay: 15 });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Pick the date", { delay: 15 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("Book the room", { delay: 15 });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Ask facilities", { delay: 15 });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
});
await page.waitForTimeout(400);
r.markers = await page.locator('.bn-block-content[data-content-type="numberedListItem"]').evaluateAll((els) =>
  els.map((e) => getComputedStyle(e, "::before").content.replace(/"/g, "")),
);

// C10 — Python code is colored.
await act(page, async () => {
  await lastLine().click();
  await slash(page, "code", "Code");
  await page.keyboard.type('def greet(name):\n    return f"Hello, {name}"', { delay: 10 });
});
const code = lastBlock(page, "codeBlock");
await act(page, () => code.locator("select").first().selectOption("python"));
await page.waitForFunction(() => document.querySelectorAll('[data-content-type="codeBlock"] code span[style*="--shiki"]').length > 3, null, { timeout: 30_000 }).catch(() => {});
r.codeColored = await page.locator('[data-content-type="codeBlock"] code span[style*="--shiki"]').count();
r.keywordColor = await page.locator('[data-content-type="codeBlock"] code span[style*="--shiki"]').first().evaluate((e) => getComputedStyle(e).color).catch(() => null);

// B14 / N15 — "[+" makes a sub-page in place; "[[" links to it.
await act(page, async () => {
  await endLine();
  await page.keyboard.type("[+", { delay: 40 });
});
await page.waitForTimeout(800);
await act(page, async () => {
  await page.keyboard.type("Launch retro notes", { delay: 20 });
  await page.waitForTimeout(800);
  await page.keyboard.press("Enter");
});
await page.waitForTimeout(3000);
r.subpage = await page.locator(".bn-block-content[data-content-type=page] .spaces-page-link-title").last().textContent().catch(() => null);
await act(page, async () => {
  await endLine();
  await page.keyboard.type("[[", { delay: 40 });
});
await page.waitForTimeout(800);
await act(page, async () => {
  await page.keyboard.type("Launch retro", { delay: 20 });
  await page.waitForTimeout(2500);
});
await shot(page, `${OUT}/r41-link-picker.png`);
await act(page, () => page.keyboard.press("Enter"));
await page.waitForTimeout(2000);
r.linked = await page.locator(".bn-block-content[data-content-type=linkToPage] .spaces-page-link-title").last().textContent().catch(() => null);

// B4 Inline — "/date" → Date or reminder → today.
await act(page, async () => {
  await endLine();
  await slash(page, "date", "Date or reminder");
});
const today = page.locator(".bn-suggestion-menu-item, [role=option]").filter({ hasText: /Today/ }).first();
await today.waitFor({ timeout: 10_000 }).catch(() => {});
await act(page, () => page.keyboard.press("Enter"));
await page.waitForTimeout(800);
r.dateMention = await page.locator(".spaces-mention[data-date]").count();

// C14 — simple table → database.
await act(page, async () => {
  await page.keyboard.press("Enter");
  await slash(page, "table", "Table");
});
await page.waitForTimeout(600);
const cells = ["Client", "Owner", "Stage", "Northshore PT", "Dana", "Onboarding", "Harbor Dental", "Sam", "Proposal"];
await act(page, async () => {
  await lastBlock(page, "table").locator("td, th").first().click();
  for (const [i, c] of cells.entries()) {
    await page.keyboard.type(c, { delay: 10 });
    if (i < cells.length - 1) await page.keyboard.press("Tab");
  }
});
await page.waitForTimeout(800);
await act(page, () => blockMenu(page, lastBlock(page, "table")));
await act(page, () => page.locator(".bn-menu-dropdown").getByText("Turn into database", { exact: true }).first().click());
await page.locator(".bn-block-content[data-content-type=database]").first().waitFor({ timeout: 60_000 }).catch(() => {});
await page.getByText("Harbor Dental").first().waitFor({ timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(1500);
r.database = await page.locator(".bn-block-content[data-content-type=database]").count();
r.tableGone = (await page.locator('.bn-block-content[data-content-type="table"]').count()) === 0;
r.rowsShown = await page.locator(".bn-block-content[data-content-type=database]").first().innerText().then((t) => ["Northshore PT", "Harbor Dental", "Onboarding"].every((s) => t.includes(s))).catch(() => false);
await page.waitForTimeout(3000);
await shot(page, `${OUT}/r41-editor.png`);
console.log(JSON.stringify(r, null, 1));
console.log("trashed:", await trashPage(page));
await browser.close();
const ok =
  r.markers.join(" ") === "1. a. b. i." &&
  r.codeColored > 3 &&
  r.subpage === "Launch retro notes" &&
  r.linked === "Launch retro notes" &&
  r.dateMention >= 1 &&
  r.database === 1 &&
  r.tableGone &&
  r.rowsShown;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);

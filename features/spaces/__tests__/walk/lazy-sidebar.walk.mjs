// Lazy sidebar (rounds 35–36): the sidebar's first tree read, a row's children read on Expand, and the
// server page search behind Cmd+K, "Move to" and "Link to page". Signs in as test@test.com (MEMBER=1, the
// default here). Never picks a result: Move to and Link to page are opened, searched and closed with Escape.
// Link to page needs an editor: it opens on a fresh blank page made for the walk, which goes to Trash after.
//   node features/spaces/__tests__/walk/lazy-sidebar.walk.mjs [query]
import { act, newPage, open, slash } from "./lib.mjs";

const query = process.argv[2] ?? "plan";
const { browser, page } = await open({ member: process.env.MEMBER !== "0", width: 1440, height: 1000 });
const out = { query };
const treeLines = [];
page.on("console", (m) => {
  const t = m.text();
  if (/\[spaces\] sidebar tree read/.test(t)) treeLines.push(t);
});
const rpcs = [];
page.on("request", (r) => {
  const m = r.url().match(/\/rest\/v1\/rpc\/(space_[a-z_]+)/);
  if (m) rpcs.push({ at: Date.now(), name: m[1] });
});

// 1. The lazy tree's first read (the console line SpacesProvider prints once).
await page.goto(page.url(), { waitUntil: "domcontentloaded", timeout: 240_000 });
await page.locator(".spaces-row").first().waitFor({ timeout: 120_000 });
await page.waitForTimeout(1500);
out.treeRead = treeLines[0] ?? null;
out.topRows = await page.locator(".spaces-row").count();

// 2. Expand the first collapsed row that has children: its children are read then (space_children).
const expandButtons = page.locator(".spaces-row").getByRole("button", { name: "Expand" });
out.expandable = await expandButtons.count();
if (out.expandable > 0) {
  const before = await page.locator(".spaces-row").count();
  const t0 = Date.now();
  rpcs.length = 0;
  const row = expandButtons.first();
  await row.hover().catch(() => undefined);
  await row.click();
  await page.waitForFunction((n) => document.querySelectorAll(".spaces-row").length > n || !!document.querySelector(".spaces-row-empty"), before, { timeout: 20_000 }).catch(() => undefined);
  out.expand = { rowsBefore: before, rowsAfter: await page.locator(".spaces-row").count(), ms: Date.now() - t0, reads: rpcs.map((r) => r.name) };
}

async function searchIn(dialogName) {
  const input = page.getByRole("dialog").getByRole("textbox").first();
  await input.waitFor({ timeout: 15_000 });
  rpcs.length = 0;
  const t0 = Date.now();
  await input.fill(query);
  // Result rows (a "New page" row is not a result).
  const options = page.getByRole("dialog").locator(".spaces-qf-row").filter({ hasNotText: /^New page “/ });
  await options.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  const titles = (await options.allTextContents()).map((s) => s.trim().slice(0, 60)).slice(0, 5);
  const res = { dialog: dialogName, results: await options.count(), firstTitles: titles, ms: Date.now() - t0, reads: [...new Set(rpcs.map((r) => r.name))] };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  return res;
}

// 3. Cmd+K.
await page.locator(".spaces-content, .spaces-page").first().click({ position: { x: 5, y: 5 } }).catch(() => undefined);
await page.keyboard.press("Meta+k");
out.cmdK = await searchIn("Cmd+K");

// 4. Move to, from a sidebar row's menu (opened, searched, closed — nothing is moved).
const firstRow = page.locator(".spaces-row").first();
await firstRow.hover();
await firstRow.getByRole("button", { name: "More actions" }).click();
await page.getByRole("menuitem", { name: /^Move to$/ }).or(page.getByText(/^Move to$/)).first().click();
out.moveTo = await searchIn("Move to");

// 5. Link to page, on a fresh page of the walk's own (then sent to Trash).
const fresh = await newPage(page);
await act(page, async () => {
  await page.locator(".bn-editor").first().click();
  await slash(page, "Link to page");
});
out.linkTo = await searchIn("Link to page");
out.freshPage = fresh;
console.log(JSON.stringify(out, null, 1));
// The walk's own page (and any page id in TRASH_TOO, a walk page an interrupted run left) goes to Trash.
for (const id of [fresh, ...(process.env.TRASH_TOO ?? "").split(",").filter(Boolean)]) {
  if (!page.url().includes(id)) await page.goto(page.url().replace(/[0-9a-f-]{36}/, id), { waitUntil: "domcontentloaded" });
  await page.locator(".bn-editor").first().waitFor({ timeout: 60_000 });
  await act(page, async () => {
    // The open page's own sidebar row: its menu's "Move to Trash".
    const row = page.locator('.spaces-row[data-current="true"]').first();
    await row.hover();
    await row.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /^Move to Trash$/ }).or(page.getByText(/^Move to Trash$/)).first().click();
  });
  await page.waitForTimeout(1500);
  console.log(JSON.stringify({ trashed: id }));
}
await browser.close();

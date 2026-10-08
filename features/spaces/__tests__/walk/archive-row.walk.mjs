// Round 33 (2): Archive record on an inline database row never fails silently. As the page's owner (admin) and a
// content editor (test@test.com, "Can edit content" on a page in an organization they are not in): right-click a
// row -> Archive record -> the confirm -> the row leaves the table, or a message says why. Exit 1 on failure.
//   SHOT_DIR=<dir> node features/spaces/__tests__/walk/archive-row.walk.mjs [admin|member|both] [leftover page ids…]
import { open, newPage, act, slash, trashPage, chromium, loginUrl, orgWithoutMember, shareWith, originOf } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
const who = process.argv[2] ?? "both";
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const rowsIn = (f) => f.locator("[data-row-id]").count();

/** Right-click the first row, Archive record, confirm; what happened, in words. */
async function archiveFirstRow(p, tag) {
  const frame = p.locator(".spaces-db-frame").first();
  await frame.locator("[data-row-id]").first().waitFor({ timeout: 60_000 });
  const before = await rowsIn(frame);
  const calls = [];
  const onRes = async (r) => {
    if (/\/rpc\//.test(r.url()) && r.request().method() === "POST") calls.push(`${r.status()} ${r.url().split("?")[0].split("/").pop()}`);
  };
  p.on("response", onRes);
  await frame.locator("[data-row-id]").first().click({ button: "right" });
  await p.waitForTimeout(800);
  const items = (await p.getByRole("menuitem").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  const item = p.getByRole("menuitem", { name: /Archive record/ }).first();
  let outcome;
  if (!(await item.isVisible().catch(() => false))) outcome = "not offered";
  else if ((await item.getAttribute("aria-disabled")) === "true" || (await item.getAttribute("data-disabled")) !== null) outcome = `disabled: ${(await item.innerText()).replace(/\s+/g, " ")}`;
  else {
    await item.click();
    await p.waitForTimeout(2000);
    const confirm = p.getByRole("alertdialog").or(p.getByRole("dialog")).last().getByRole("button", { name: /^Archive$/ });
    const asked = await confirm.isVisible().catch(() => false);
    if (asked) await confirm.click();
    await p.waitForTimeout(5000);
    const after = await rowsIn(frame);
    const said = (await p.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])).join(" | ").replace(/\s+/g, " ");
    // Round 38: the grid's own notice names what was archived (with Undo).
    const notice = await p.getByText(/^Archived .+\.$/).first().isVisible().catch(() => false);
    // The store's refusal is drawn in the grid itself (its own sentence), not as a toast.
    const refused = (await frame.getByText(/do not have access|cannot|can.t /i).first().innerText().catch(() => "")).replace(/\s+/g, " ");
    outcome = after < before ? (notice ? "archived" : "archived, no message") : refused ? `refused: ${refused.slice(0, 200)}` : said ? `said: ${said.slice(0, 200)}` : "nothing happened";
    console.log(JSON.stringify({ tag, asked, before, after, notice }));
  }
  p.off("response", onRes);
  await p.screenshot({ path: `${SHOT}/archive-row-${tag}.png` });
  console.log(JSON.stringify({ tag, menu: items.slice(0, 14), calls: calls.slice(0, 10) }));
  return outcome;
}

/** The same through the open row (side peek → ••• → Archive record → confirm). */
async function archiveFromPeek(p, tag) {
  const frame = p.locator(".spaces-db-frame").first();
  const before = await rowsIn(frame);
  await frame.locator("[data-row-id]").last().locator("[role=gridcell], td").first().click().catch(() => {});
  await p.locator(".spaces-peek-bar").waitFor({ timeout: 20_000 }).catch(() => {});
  const more = p.getByRole("button", { name: /^More for / }).first();
  if (!(await more.isVisible({ timeout: 10_000 }).catch(() => false))) return "no ••• in the open row";
  await more.click();
  await p.waitForTimeout(600);
  const item = p.getByRole("menuitem", { name: /Archive record/ }).first();
  if (!(await item.isVisible().catch(() => false))) return "not offered";
  if ((await item.getAttribute("aria-disabled")) === "true" || (await item.getAttribute("data-disabled")) !== null) return `disabled: ${(await item.innerText()).replace(/\s+/g, " ")}`;
  await item.click();
  await p.waitForTimeout(1500);
  const confirm = p.getByRole("alertdialog").or(p.getByRole("dialog")).last().getByRole("button", { name: /^Archive$/ });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await p.waitForTimeout(5000);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(1500);
  const after = await rowsIn(frame);
  const said = (await p.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])).join(" | ").replace(/\s+/g, " ");
  await p.screenshot({ path: `${SHOT}/archive-peek-${tag}.png` });
  return after < before ? "archived" : said ? `said: ${said.slice(0, 200)}` : "nothing happened";
}

const org = await orgWithoutMember();
const { browser, page } = await open({ member: false, next: `/spaces?org=${org}`, width: 1440, height: 1000 });
const id = await newPage(page);
console.log(JSON.stringify({ org, page: id }));
await page.waitForTimeout(2500);
await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").first().click();
  await page.keyboard.type("Patient recall rows", { delay: 15 });
  await page.keyboard.press("Enter");
  await slash(page, "Database - Inline");
  const frame = page.locator(".spaces-db-frame").first();
  await frame.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4000);
  for (let i = 0; i < 3; i++) {
    await frame.hover();
    await frame.getByRole("button", { name: /^New( page)?$/ }).first().click();
    await page.waitForTimeout(2000);
    await page.keyboard.press("Escape");
    if (await page.locator(".spaces-peek-bar").count()) await page.locator(".spaces-peek-bar button").first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
  await page.locator('.spaces-edited[data-state="saved"]').waitFor({ timeout: 30_000 }).catch(() => {});
});
try {
if (who !== "member") {
  const outcome = await act(page, () => archiveFirstRow(page, "admin"));
  // Round 38: the owner's archive must happen — the confirm stays open, the row goes, the grid says so.
  check("admin: Archive record (row menu) archives the row and says so", outcome === "archived", { outcome });
  const viaPeek = await act(page, () => archiveFromPeek(page, "admin"));
  check("admin: Archive record (open row) never fails silently", viaPeek !== "nothing happened", { outcome: viaPeek });
}
if (who !== "admin") {
  await act(page, () => shareWith(page, "test@test.com", "Can edit content"));
  const b2 = await chromium.launch({ headless: true });
  const p2 = await (await b2.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await p2.goto(loginUrl(`/spaces/${id}`, true), { waitUntil: "domcontentloaded", timeout: 240_000 });
  await p2.waitForURL((u) => u.pathname.includes(id), { timeout: 240_000 }).catch(() => {});
  await p2.locator(".bn-editor").first().waitFor({ timeout: 240_000 });
  await p2.waitForTimeout(6000);
  const outcome = await archiveFirstRow(p2, "member");
  // A content editor is not offered it (hiding is fine), it works, or the store refuses with its reason in the grid.
  check("content editor: Archive record (row menu) is hidden, archives, or says why not", outcome === "not offered" || outcome === "archived" || outcome.startsWith("refused: "), { outcome });
  const viaPeek = await archiveFromPeek(p2, "member");
  check("content editor: Archive record (open row) never fails silently", viaPeek !== "nothing happened", { outcome: viaPeek });
  await b2.close();
}
} finally {
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.locator(".bn-editor").first().waitFor({ timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  check("scratch page trashed", await act(page, () => trashPage(page)).catch(() => false));
  for (const old of process.argv.slice(3)) {
    await page.goto(`${originOf(page)}/spaces/${old}`, { waitUntil: "domcontentloaded" });
    await page.locator(".bn-editor").first().waitFor({ timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    console.log(JSON.stringify({ leftover: old, trashed: await trashPage(page).catch(() => false) }));
  }
}
await browser.close();
process.exit(failed ? 1 : 0);

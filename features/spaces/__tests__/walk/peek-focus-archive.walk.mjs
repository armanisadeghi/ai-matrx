// Round 39: (1) "+ New" opens the row's side peek with the caret in the TITLE — typing names the row at once.
// (2) After a row is archived (from the grid's menu and from the open row) no request fails (read_record 400).
//   SHOT_DIR=<dir> node features/spaces/__tests__/walk/peek-focus-archive.walk.mjs [leftover page ids…]
import { open, newPage, act, slash, trashPage, originOf } from "./lib.mjs";

const SHOT = process.env.SHOT_DIR ?? "/tmp";
let failed = 0;
const check = (name, ok, extra = {}) => {
  if (!ok) failed++;
  console.log(JSON.stringify({ check: name, ok, ...extra }));
};
const { browser, page } = await open({ member: false, next: "/spaces", width: 1440, height: 1000 });
const bad = [];
let watching = false;
const trail = [];
page.on("request", (r) => {
  if (watching && /\/rpc\//.test(r.url())) trail.push(`${r.url().split("/").pop().split("?")[0]} ${(r.postData() ?? "").replace(/"p_organization_id":"[^"]*",?/, "").slice(0, 100)}`);
});
page.on("response", (r) => {
  if (watching && r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url().split("?")[0].split("/").slice(-2).join("/")} ${(r.request().postData() ?? "").slice(0, 120)}`);
});
if (process.env.STACKS) {
  await page.addInitScript(() => {
    const f = window.fetch;
    window.__rr = [];
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("rpc/read_record") && !url.includes("read_records")) window.__rr.push({ body: String(init?.body ?? "").slice(0, 150), stack: new Error().stack });
      return f.apply(this, arguments);
    };
  });
}
const id = await newPage(page);
console.log(JSON.stringify({ page: id }));
await page.waitForTimeout(2500);
try {
  await act(page, async () => {
    await page.locator(".bn-editor .bn-inline-content").first().click();
    await page.keyboard.type("Patient recall rows", { delay: 15 });
    await page.keyboard.press("Enter");
    await slash(page, "Database - Inline");
    await page.locator(".spaces-db-frame").first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(4000);
  });
  const frame = page.locator(".spaces-db-frame").first();
  // 1. New -> caret in the title, typing names the row.
  await frame.hover();
  await frame.getByRole("button", { name: /^New( page)?$/ }).first().click();
  await page.locator(".spaces-peek-bar").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  if (process.env.DUMP) { await page.screenshot({ path: `${SHOT}/peek-after.png` }); console.log(await page.evaluate(() => `peek:${document.querySelectorAll(".spaces-peek-side").length} dialogs:${[...document.querySelectorAll("[role=dialog]")].map((d)=>d.className.slice(0,40)).join("|")} active:${document.activeElement?.outerHTML.slice(0,160)}`)); }
  const where = await page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a?.tagName, label: a?.getAttribute("aria-label") ?? a?.getAttribute("placeholder"), inPeek: Boolean(a?.closest(".spaces-peek-side")), editable: a?.getAttribute("contenteditable") };
  });
  console.log(JSON.stringify({ where }));
  if (process.env.DUMP) console.log(await page.evaluate(() => [...document.querySelectorAll(".spaces-peek-body *")].slice(0, 60).map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("role") ? "[" + e.getAttribute("role") + "]" : ""}${e.getAttribute("contenteditable") ? "[ce]" : ""}${e.getAttribute("aria-label") ? "{" + e.getAttribute("aria-label") + "}" : ""}${e.tabIndex >= 0 ? "(tab)" : ""}`).join(" ")));
  await page.keyboard.type("Quarterly recall mailing", { delay: 20 });
  await page.waitForTimeout(800);
  const typed = await page.evaluate(() => {
    const p = document.querySelector(".spaces-peek-side");
    return [...p.querySelectorAll("input, textarea, [contenteditable=true]")].map((e) => (e.value ?? e.textContent ?? "").trim()).filter(Boolean);
  });
  console.log(JSON.stringify({ typed }));
  check("caret lands in the title (inside the peek, a text field)", where.inPeek && (where.tag === "INPUT" || where.tag === "TEXTAREA" || where.editable === "true"), where);
  check("typing names the row", typed.some((t) => t.includes("Quarterly recall mailing")), { typed });
  await page.screenshot({ path: `${SHOT}/peek-focus.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  // a second and third row to archive
  for (let i = 0; i < 2; i++) {
    await frame.hover();
    await frame.getByRole("button", { name: /^New( page)?$/ }).first().click();
    await page.waitForTimeout(2000);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
  }
  // 2. Archive from the grid menu with the open row watched.
  console.log(JSON.stringify({ peeksOpenBeforeArchive: await page.locator(".spaces-peek-side").count(), active: await page.evaluate(() => document.activeElement?.tagName) }));
  watching = true;
  const rows = () => frame.locator("[data-row-id]").count();
  const before = await rows();
  await frame.locator("[data-row-id]").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: /Archive record/ }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).last().getByRole("button", { name: /^Archive$/ }).click();
  await page.waitForTimeout(6000);
  check("archived from the grid menu", (await rows()) < before, { before, after: await rows() });
  // from the open row
  const b2 = await rows();
  await frame.locator("[data-row-id]").last().locator("[role=gridcell], td").first().click().catch(() => {});
  await page.keyboard.press("Space");
  await page.locator(".spaces-peek-bar").waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: /^More for / }).first().click();
  await page.getByRole("menuitem", { name: /Archive record/ }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).last().getByRole("button", { name: /^Archive$/ }).click();
  await page.waitForTimeout(8000);
  check("archived from the open row", (await rows()) < b2, { before: b2, after: await rows() });
  watching = false;
  check("no failing request after an archive", bad.length === 0, { bad });
} finally {
  console.log(JSON.stringify({ failingRequests: bad }));
  if (process.env.TRAIL) console.log(trail.join("\n"));
  if (process.env.STACKS) console.log(JSON.stringify(await page.evaluate(() => window.__rr)).replace(/\\n/g, "\n").slice(0, 6000));
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.locator(".bn-editor").first().waitFor({ timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  check("scratch page trashed", await act(page, () => trashPage(page)).catch(() => false));
}
await browser.close();
process.exit(failed ? 1 : 0);

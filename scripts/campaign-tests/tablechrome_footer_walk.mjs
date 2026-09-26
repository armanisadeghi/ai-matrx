/**
 * LANE TABLE-PAGE-CHROME (walked by PUBLISHER-5) — the Sheet's footer knob on the shared preview
 * (LIVE database, installed @ai-matrx/records-ui), headless, as admin@admin.com, on admin's OWN
 * table (Rincon Plumbing — Service Calls). Everything it changes is admin's personal look at that
 * view (layout Sheet, footer inline), and it ends by pressing Reset to view.
 *
 *   TC_ORIGIN=http://publisher-5.localhost:3001 AI_ADMIN_USERNAME=… AI_ADMIN_PASSWORD=… \
 *   node scripts/campaign-tests/tablechrome_footer_walk.mjs
 *
 * Out: common-docs/operations/for-arman/2026-09-25/table-chrome/footer-*.png, footer-walk.json.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { signIn, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.TC_ORIGIN ?? "http://table-chrome.localhost:3001";
const EMAIL = process.env.AI_ADMIN_USERNAME ?? "";
const PASSWORD = process.env.AI_ADMIN_PASSWORD ?? "";
if (!EMAIL || !PASSWORD) {
  console.error("The admin seat's sign-in is not in the environment (never printed).");
  process.exit(2);
}
const ADMINS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-25/table-chrome";
mkdirSync(OUT, { recursive: true });

const results = [];
const pass = (name, ok, saw) => {
  results.push({ name, ok: Boolean(ok), saw });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${JSON.stringify(saw)}`);
};

const at = (page) =>
  page.evaluate(() => {
    const sheet = document.querySelector("[data-sheet-layout]");
    const r = sheet?.getBoundingClientRect();
    const rows = [...document.querySelectorAll("[data-sheet-layout] tbody tr")].filter((tr) => tr.getBoundingClientRect().height > 0);
    const last = rows.length ? rows[rows.length - 1].getBoundingClientRect() : null;
    return {
      page: document.querySelector("[data-table-footer]")?.getAttribute("data-table-footer") ?? null,
      sheet: sheet?.getAttribute("data-sheet-footer") ?? null,
      sheetTop: r ? Math.round(r.top) : null,
      sheetBottom: r ? Math.round(r.bottom) : null,
      lastRowBottom: last ? Math.round(last.bottom) : null,
      rows: rows.length,
      viewport: window.innerHeight,
      reset: Boolean(document.querySelector("[data-view-look-reset]")),
    };
  });

const browser = await chromium.launch({ headless: true });
const walk = {};
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, "admin seat");
  pass("signed in as the admin test seat", who === EMAIL, who === EMAIL ? "admin@admin.com" : "someone else");
  await page.goto(`${ORIGIN}/data-v2/${ADMINS}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await until("the table's rows", () =>
    page.evaluate(() => [...document.querySelectorAll("tbody tr")].some((tr) => (tr.textContent ?? "").trim().length > 2)), 180000);
  await sleep(3000);

  // The Sheet, as admin's look.
  // A table designated a Sheet opens on it; otherwise pick it from the layout chooser.
  if (!(await page.evaluate(() => Boolean(document.querySelector("[data-sheet-layout]"))))) {
    await page.locator("[role='group'][aria-label='Layout'] button").filter({ hasText: /^Sheet$/ }).click();
  }
  await until("the Sheet", () => page.evaluate(() => Boolean(document.querySelector("[data-sheet-layout] tbody tr"))), 120000);
  await sleep(3000);
  walk.sticky = await at(page);
  pass("Sheet, footer sticky by default: the Sheet fills the page to its bottom edge",
    walk.sticky.page === "sticky" && walk.sticky.sheet === "sticky" && walk.sticky.viewport - walk.sticky.sheetBottom < 40, walk.sticky);
  await page.screenshot({ path: `${OUT}/footer-sheet-sticky-light-1600.png` });

  await page.locator("[data-view-picker]").click();
  await page.waitForSelector("[data-view-footer='inline']", { timeout: 30000 });
  await page.screenshot({ path: `${OUT}/footer-view-picker-light-1600.png` });
  await page.locator("[data-view-footer='inline']").click();
  await sleep(1500);
  await page.keyboard.press("Escape");
  await sleep(1500);
  walk.inline = await at(page);
  pass("footer inline: the Sheet is as tall as its rows (the pages bar follows the last row)",
    walk.inline.page === "inline" && walk.inline.sheet === "inline" &&
      (walk.inline.sheetBottom !== walk.sticky.sheetBottom || walk.inline.sheetBottom > walk.inline.viewport), walk.inline);
  pass("the look differs from the view, so Reset to view is offered", walk.inline.reset, walk.inline.reset);
  await page.screenshot({ path: `${OUT}/footer-sheet-inline-light-1600.png` });

  await page.locator("[data-view-look-reset]").click();
  await sleep(2500);
  walk.reset = await at(page);
  pass("Reset to view puts the view back (footer sticky; the look's Sheet choice cleared)",
    walk.reset.page === "sticky" && (walk.reset.sheet === null || walk.reset.sheet === "sticky"), walk.reset);
  await page.screenshot({ path: `${OUT}/footer-after-reset-light-1600.png` });
  await context.close();
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/footer-walk.json`, JSON.stringify({ at: new Date().toISOString(), origin: ORIGIN, walk, results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? `GREEN ${results.length}/${results.length}` : `RED ${failed.length} of ${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);

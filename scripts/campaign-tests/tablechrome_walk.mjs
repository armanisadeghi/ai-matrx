/**
 * LANE TABLE-PAGE-CHROME — headless walk of /data-v2/<table> on the shared preview (LIVE database,
 * installed @ai-matrx/records-ui), as admin@admin.com, READ-ONLY except admin's own active
 * organization choice.
 *
 *   TC_ORIGIN=http://table-chrome.localhost:3001 AI_ADMIN_USERNAME=… AI_ADMIN_PASSWORD=… \
 *   node scripts/campaign-tests/tablechrome_walk.mjs
 *
 * Arman's Coding Accounts (shared with admin, read only): rows above the first data row, the back
 * button, the title switcher (the organization's tables, All tables), no organization line, no
 * notice row; light and dark at 1600 and 390. Admin's own Rincon Plumbing — Service Calls (lives in
 * admin's Workspace) opened while admin works in AI Matrx: the shell's organization indicator lights,
 * the switcher moves to another table, and pressing the indicator switches the organization.
 * Credentials come from the environment and are never printed. Out: common-docs/operations/
 * for-arman/2026-09-25/table-chrome/preview-*.png and preview-walk.json.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { setOrganization, signIn, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.TC_ORIGIN ?? "http://table-chrome.localhost:3001";
const EMAIL = process.env.AI_ADMIN_USERNAME ?? "";
const PASSWORD = process.env.AI_ADMIN_PASSWORD ?? "";
if (!EMAIL || !PASSWORD) {
  console.error("The admin seat's sign-in is not in the environment (never printed).");
  process.exit(2);
}
const ARMANS = "c1aabdc0-4d94-42d4-9ddc-91b68ef9c0a7";
const ADMINS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-25/table-chrome";
mkdirSync(OUT, { recursive: true });

const results = [];
const pass = (name, ok, saw) => {
  results.push({ name, ok: Boolean(ok), saw });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${typeof saw === "string" ? saw : JSON.stringify(saw)}`);
};

async function rowsAbove(page) {
  return page.evaluate(() => {
    const first = [...document.querySelectorAll("tbody tr")].find((tr) => tr.getBoundingClientRect().height > 0 && (tr.textContent ?? "").trim().length > 2);
    if (!first) return null;
    const limit = first.getBoundingClientRect().top;
    const main = document.querySelector(".shell-main, main");
    const minX = main ? main.getBoundingClientRect().left : 0;
    const leaves = [...document.querySelectorAll("button, input, select, a, th, span, p, label, h1, h2")].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom > limit + 1 || r.top < 0 || r.left < minX) return false;
      if (getComputedStyle(el).visibility === "hidden") return false;
      return el.children.length === 0 || ["BUTTON", "TH", "INPUT", "SELECT"].includes(el.tagName);
    });
    const centers = leaves.map((el) => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; }).sort((a, b) => a - b);
    const bands = [];
    for (const c of centers) if (bands.length === 0 || c - bands[bands.length - 1] > 16) bands.push(c);
    return { firstDataRowTop: Math.round(limit), rows: bands.length, bands: bands.map((b) => Math.round(b)) };
  });
}

async function openTable(page, id) {
  await page.goto(`${ORIGIN}/data-v2/${id}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await until("the table's rows", () =>
    page.evaluate(() => [...document.querySelectorAll("tbody tr")].some((tr) => (tr.textContent ?? "").trim().length > 2)), 180000);
  await sleep(4000);
}

const facts = (page) =>
  page.evaluate(() => {
    const header = document.getElementById("shell-header-center");
    return {
      back: Boolean(header?.querySelector("button[aria-label='Back'], a[aria-label='Back']")),
      switcher: header?.querySelector("[data-table-switcher]")?.textContent?.trim() ?? null,
      orgLineInHeader: Boolean(header?.querySelector(".hdr-structured-context, [data-table-lives-in]")),
      noticeRow: [...document.querySelectorAll("main [role='status']")].some((el) => /not the organization you are working in/.test(el.textContent ?? "")),
      lit: document.querySelector("[data-page-object-organization-lit]")?.textContent?.trim() ?? null,
      quiet: document.querySelector("[data-page-object-organization]:not([data-page-object-organization-lit])")?.textContent?.trim() ?? null,
    };
  });

const browser = await chromium.launch({ headless: true });
const walk = {};
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, "admin seat");
  pass("signed in as the admin test seat", who === EMAIL, who === EMAIL ? "admin@admin.com" : "someone else");

  // ── Arman's table, read only ──
  await openTable(page, ARMANS);
  walk.armansRows = await rowsAbove(page);
  pass("Arman's table: rows of chrome above the first data row (measured)", walk.armansRows !== null, walk.armansRows);
  const f = await facts(page);
  walk.armansHeader = f;
  pass("the header has a back button and the table name as the switcher; no organization line", f.back && f.switcher === "Coding Accounts" && !f.orgLineInHeader, f);
  pass("no organization notice row in the body", !f.noticeRow, f);
  await page.screenshot({ path: `${OUT}/preview-armans-light-1600.png` });
  await page.locator("#shell-header-center [data-table-switcher]:visible").click();
  await page.waitForSelector("[data-table-switcher-content]", { timeout: 30000 });
  await sleep(1500);
  const listed = await page.evaluate(() => ({
    tables: [...document.querySelectorAll("[data-table-switcher-item]")].length,
    current: document.querySelector("[data-table-switcher-item][aria-current='page']")?.textContent?.trim() ?? null,
    all: document.querySelector("[data-table-switcher-all]")?.getAttribute("href") ?? null,
    livesIn: Boolean(document.querySelector("[data-table-switcher-footer] [data-table-lives-in]")),
  }));
  walk.armansSwitcher = listed;
  pass("the title opens the organization's tables, marks this one, offers All tables, says where it lives", listed.tables >= 1 && listed.current === "Coding Accounts" && Boolean(listed.all) && listed.livesIn, listed);
  await page.screenshot({ path: `${OUT}/preview-armans-switcher-light-1600.png` });
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await sleep(800);
  await page.screenshot({ path: `${OUT}/preview-armans-dark-1600.png` });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  // ── Admin's own table, opened while working in another organization ──
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await sleep(3000);
  const how = await setOrganization(page, "AI Matrx").catch((e) => `could not: ${e.message}`);
  pass("admin works in AI Matrx (picked the way a person does)", !String(how).startsWith("could not"), how);
  await openTable(page, ADMINS);
  const lit = await facts(page);
  walk.crossOrg = lit;
  pass("the shell's organization indicator lights with the table's organization", lit.lit === "admin's Workspace" || /admin's Workspace/.test(lit.lit ?? ""), lit);
  await page.screenshot({ path: `${OUT}/preview-cross-org-lit-light-1600.png` });
  // The switcher moves to another table of that organization.
  await page.locator("#shell-header-center [data-table-switcher]:visible").click();
  await page.waitForSelector("[data-table-switcher-item]", { timeout: 30000 });
  const other = await page.evaluate(() => {
    const item = [...document.querySelectorAll("[data-table-switcher-item]")].find((a) => a.getAttribute("aria-current") !== "page");
    return item ? { id: item.getAttribute("data-table-switcher-item"), name: item.textContent?.trim() } : null;
  });
  if (other) {
    await page.locator(`[data-table-switcher-item='${other.id}']`).click();
    await until("the other table's address", () => page.url().includes(other.id), 60000);
    pass("picking a table in the switcher opens it", page.url().includes(other.id), other);
    await page.goto(`${ORIGIN}/data-v2/${ADMINS}`, { waitUntil: "domcontentloaded" });
    await sleep(6000);
  } else {
    pass("picking a table in the switcher opens it", false, "no other table listed");
  }
  // Pressing the lit indicator works in that organization; it goes quiet.
  await page.locator("[data-page-object-organization-lit]").click();
  await sleep(2500);
  const after = await facts(page);
  pass("pressing the indicator switches to the table's organization and it goes out", after.lit === null, after);

  // ── 390 ──
  for (const theme of ["light", "dark"]) {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await phone.newPage();
    await signIn(p, ORIGIN, EMAIL, PASSWORD, "admin seat (390)");
    await openTable(p, ARMANS);
    if (theme === "dark") await p.evaluate(() => document.documentElement.classList.add("dark"));
    await sleep(800);
    const m = await facts(p);
    walk[`phone-${theme}`] = { ...m, rows: await rowsAbove(p) };
    pass(`390 ${theme}: back and the title in the header`, m.back && m.switcher === "Coding Accounts", walk[`phone-${theme}`]);
    await p.screenshot({ path: `${OUT}/preview-armans-${theme}-390.png` });
    await phone.close();
  }
  await context.close();
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/preview-walk.json`, JSON.stringify({ at: new Date().toISOString(), origin: ORIGIN, walk, results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? `GREEN ${results.length}/${results.length}` : `RED ${failed.length} of ${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);

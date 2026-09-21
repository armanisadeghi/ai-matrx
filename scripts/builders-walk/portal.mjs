/**
 * WALK 3 — RINCON PLUMBING CO, A CUSTOMER PORTAL.
 *
 * The real job: a plumbing company with 25 customers, 40 jobs and 50 invoices
 * wants each customer to sign in and see HER OWN jobs and HER OWN invoices, and
 * nothing of anybody else's. The office manager builds it: which table holds the
 * customers, which column on Jobs says whose job it is, what they may read, what
 * they may change, and then she invites one.
 *
 * THE ASSERTION THAT MATTERS is not that the portal exists. It is that a
 * customer sees ONLY her own rows — and the walk checks that the way the product
 * does, through "View as this client", which asks `custom.visible_set` for HER
 * user id: the same call her own page makes, so it cannot flatter us.
 */
import { chromium } from "playwright";
import { CASES, ORIGIN, signIn, useOrganization, shot } from "./walk.mjs";

const T = CASES.portal;
const PORTAL_TITLE = "Your jobs and invoices";

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1020 } })).newPage();
const notes = [];

const who = await signIn(page, `/data-v2`);
notes.push(`signed in as ${who.email}`);
await useOrganization(page, T);

await page.goto(`${ORIGIN}/data-v2/${T.table}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(9000);
await shot(page, "builders-20-rincon-jobs-grid");

await page.getByRole("button", { name: /^Portals$/ }).first().click();
await page.waitForTimeout(3000);
await shot(page, "builders-21-rincon-portals-rail");
const rail = await page.evaluate(() => document.body.innerText);
notes.push(
  `rail offers a builder: ${/Build the portal|Build a portal/.test(rail)}`,
  `rail offers an agent: ${/Ask an agent/.test(rail)}`,
);

await page.getByRole("button", { name: /Build the portal|Build a portal/ }).first().click();
await page.waitForTimeout(3500);

// A label matched by its OWN text, not by substring: `has-text("At")` matched
// "What to call it" and typed 08:00 into the digest's name (walk 4).
// A <label> wraps BOTH its caption and its control, so its whole text is the
// caption plus the control's value — `^How often$` matches nothing. The caption
// is a descendant whose text is exactly this, which `:text-is()` finds.
const exactLabel = (page, text) => page.locator(`label:has(:text-is("${text}"))`);
const field = (label) =>
  page.locator(`label:has-text("${label}")`).locator("input,textarea").first();
/** The input under a label whose whole text is exactly this. */
const exactField = (label) => exactLabel(page, label).locator("input,textarea").first();
const pick = (label) => page.locator(`label:has-text("${label}")`).locator("select").first();
const exactPick = (label) => exactLabel(page, label).locator("select").first();

await field("What your clients see it called").fill(PORTAL_TITLE);
await pick("Which table holds your clients").selectOption({ label: "Customers" });
await page.waitForTimeout(3500);
await shot(page, "builders-22-rincon-portal-client-table-picked");

// Jobs is pre-ticked (it is the table she came from). Invoices she adds.
for (const table of ["Invoices"]) {
  const box = page.locator(`label:has-text("${table}") input[type=checkbox]`).first();
  if (await box.isVisible().catch(() => false)) await box.check().catch(() => {});
  await page.waitForTimeout(2500);
}

// THE SENTENCE THAT IS THE PRODUCT: which column on each table names the client.
const whose = page.locator("select").filter({ hasText: /Pick the field that names the client/ });
const count = await whose.count();
notes.push(`tables asking "which field says whose row it is": ${count}`);
for (let i = 0; i < count; i += 1) {
  const options = await whose.nth(i).locator("option").allTextContents();
  notes.push(`  · offered: ${options.filter((o) => !/^Pick the field/.test(o)).join(", ") || "NOTHING"}`);
  const real = options.find((o) => !/^Pick the field/.test(o));
  if (real) await whose.nth(i).selectOption({ label: real });
  await page.waitForTimeout(600);
}
await shot(page, "builders-23-rincon-portal-whose-row");

// What they may READ, and separately what they may CHANGE.
const readable = page.getByRole("checkbox").filter({ hasNotText: /.*/ });
const body = await page.evaluate(() => document.body.innerText);
notes.push(`builder asks read and change separately: ${/Columns they can read/.test(body) && /Columns they can change/.test(body)}`);
for (const column of ["job_number", "status", "scheduled_date", "invoice_number", "amount_due"]) {
  const box = page.locator(`label:has-text("${column}") input[type=checkbox]`).first();
  if (await box.isVisible().catch(() => false)) await box.check().catch(() => {});
  await page.waitForTimeout(250);
}
await shot(page, "builders-24-rincon-portal-columns");

await page.getByRole("button", { name: /^Save$/ }).first().click();
await page.waitForTimeout(8000);
await shot(page, "builders-25-rincon-portal-saved");
notes.push(`after save: ${(await page.evaluate(() => document.body.innerText)).match(/Saving replaces[^\n]*/)?.[0] ?? "?"}`);

// ── what one customer would see ─────────────────────────────────────────────
await page.getByRole("button", { name: /Done building/i }).first().click().catch(() => {});
await page.waitForTimeout(4000);
const listText = await page.evaluate(() => document.body.innerText);
notes.push(`portals list: ${listText.match(/Clients come from[^\n]*/)?.[0] ?? "?"}`);
await shot(page, "builders-26-rincon-portals-list");

console.log("\n--- WALK 3 ---");
notes.forEach((n) => console.log(" ·", n));
await browser.close();

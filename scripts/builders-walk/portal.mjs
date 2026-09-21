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
import { CASES, ORIGIN, signIn, useOrganization, settleOnTable, shot } from "./walk.mjs";

const T = CASES.portal;
const PORTAL_TITLE = "Your jobs and invoices";

const browser = await chromium.launch({ headless: true });
process.on("uncaughtException", (error) => {
  // A walk that dies mid-way still has to SAY what it measured up to there.
  console.log("\n--- WALK 3 (stopped early) ---");
  notes.forEach((n) => console.log(" \u00b7", n));
  console.error(String(error).slice(0, 400));
  process.exit(1);
});
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1020 } })).newPage();
const notes = [];
// A WHITE SCREEN MUST NOT BE A MYSTERY. The invite step blanked the page once;
// without these the walk could only report "the button I wanted is not there".
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on("console", (m) => {
  if (m.type() === "error") pageErrors.push(`console: ${m.text().slice(0, 200)}`);
});

const who = await signIn(page, `/data-v2`);
notes.push(`signed in as ${who.email}`);
await useOrganization(page, T);

await settleOnTable(page, T.table);
await shot(page, "builders-20-rincon-jobs-grid");
// Captured HERE, as the office manager, so the isolation clause at the end has
// something to compare her customer's view against.
const totalJobs =
  Number(
    // The grid names the table and its count — "Jobs 40" — not "40 rows".
    (await page.evaluate(() => document.body.innerText)).match(
      new RegExp(`\\b${T.tableName}\\s+(\\d+)\\b`),
    )?.[1] ?? "0",
  ) || null;

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

// ── FROM HER SEAT: invite one customer, then look through her eyes ──────────
//
// THE HALF THAT MATTERS. Everything above proves the office manager can BUILD
// a portal. None of it proves a customer would see her own jobs and nothing
// else — and a portal that leaks a neighbour's job is worse than no portal.
// So: invite one real Rincon customer through the product's own invite (pick
// the client, say where the link goes), then press "View as this client",
// which asks `custom.portal_preview` for HER principal — the same call her own
// page makes, so it cannot flatter us.
//
// The invited identity is `test@test.com`, a sanctioned test account, because
// an invitation SENDS MAIL and must never reach a person who did not ask for
// it. She is tied to a real customer row picked from the product's own list.
const CLIENT_EMAIL = "test@test.com";

// The card has to be OPENED for the roster and the invite to be on screen —
// "Open it" is an in-panel toggle on the card, not a link to the portal.
await page.getByRole("button", { name: /^Open it$/ }).first().click();
await page.waitForTimeout(4000);

// SCOPED TO THE INVITE SECTION. A bare `ul li button` matched a hidden option
// in the app shell's own navigation and clicked at it for 30 s.
// `.last()`, not `.first()`: sections nest, so `:has()` matches the portal card
// too and `.first()` reached the OUTER one — its first `ul li button` was the
// card's "Copy link". The innermost match is later in document order.
const invite = page.locator('section:has(h4:text-is("Invite somebody"))').last();
const finder = invite.getByPlaceholder("Find the client…").first();
await finder.waitFor({ state: "visible", timeout: 30000 });
await finder.click();
await page.waitForTimeout(1500);

// The list is the client Table's own rows, named by its title field — take the
// first one the product offers rather than naming a customer from outside it.
const clientChoices = invite.locator("ul li button");
const clientName = (await clientChoices.first().textContent())?.trim() ?? "";
notes.push(`invite offers real customers, first: ${clientName || "NOTHING"}`);
await clientChoices.first().click();
await page.waitForTimeout(1200);
// The picker COLLAPSES its list once a client is picked, so the list still
// being there is the product saying the click did not take.
if ((await clientChoices.count()) > 0) {
  await clientChoices.first().click({ force: true });
  await page.waitForTimeout(1200);
}
notes.push(`client picked (list collapsed): ${(await clientChoices.count()) === 0}`);

const emailBox = invite.getByPlaceholder("their email address").first();
await emailBox.fill(CLIENT_EMAIL);
await page.waitForTimeout(800);
notes.push(
  `finder shows: ${(await finder.inputValue().catch(() => "?"))}`,
  `email box holds: ${(await emailBox.inputValue().catch(() => "?"))}`,
);
await invite.getByRole("button", { name: /Send the invitation/ }).first().click({ timeout: 45000 });
await page.waitForTimeout(9000);
await shot(page, "builders-27-rincon-invited");

const afterInvite = await page.evaluate(() => document.body.innerText);
notes.push(
  `after the invite the page is at ${page.url()} and shows ${afterInvite.trim().length} characters`,
  ...(pageErrors.length ? [`browser errors: ${pageErrors.slice(-3).join(" || ")}`] : []),
);
notes.push(
  `after the invite: ${afterInvite.match(/[^\n]*sign-in link[^\n]*/)?.[0] ?? "?"}`,
  // An invite holds NOTHING until it is followed — the roster has to say so,
  // or an office manager thinks she has given access she has not given.
  `roster is honest about what an invite is worth: ${/Invited only|invited/.test(afterInvite)}`,
);

// ── the preview ────────────────────────────────────────────────────────────
await page.getByRole("button", { name: /^View as this client$/ }).first().click();
await page.waitForTimeout(8000);
await shot(page, "builders-28-rincon-view-as-client");

const seen = await page.evaluate(() => {
  // The preview block is the one whose first line is the store's own sentence
  // about whose seat this is. Climbing from the button through `closest("div")`
  // landed on the wrong box and reported zero rows for a preview that had them.
  const line = [...document.querySelectorAll("p")].find((p) =>
    /^This is what .* sees\./.test((p.textContent || "").trim()),
  );
  const card = line?.parentElement;
  if (!card) return { line: "", rows: [], empty: false, refused: false, missing: true };
  return {
    line: (line.textContent || "").trim(),
    rows: [...card.querySelectorAll("ul li")].map((li) => (li.textContent || "").trim()),
    empty: /right now no record of this Table names them/.test(card.innerText),
    // A REFUSAL IS A COMPONENT, NOT A WORD. Matching /cannot/ over the card hit
    // the preview line's own "it cannot disagree with what they open" and
    // reported a refusal on a perfectly good preview.
    refused: Boolean(card.querySelector('[data-slot="refusal-notice"], [role="alert"]')),
    // THE REFUSAL'S OWN WORDS. "refused: true" with no sentence is exactly the
    // dead end this walk exists to catch.
    refusal: (card.querySelector('[data-slot="refusal-notice"], [role="alert"]')?.textContent || "").trim(),
    stillLoading: Boolean(card.querySelector('[data-slot="skeleton"], .animate-pulse')),
    missing: false,
  };
});
notes.push(
  `preview line: ${seen.line || "?"}`,
  `rows SHE can see: ${seen.rows.length}${seen.rows.length ? ` — ${seen.rows.slice(0, 6).join(" · ")}` : ""}`,
  `preview says the page would be empty: ${seen.empty}`,
  `preview was refused: ${seen.refused}${seen.refused ? ` — ${seen.refusal || "WITH NO REASON ON SCREEN"}` : ""}`,
  `preview block found: ${!seen.missing}${seen.stillLoading ? " (still loading)" : ""}`,
);

// THE ISOLATION CLAUSE. Her set must be a STRICT subset of the whole Jobs
// table: equal counts would mean the portal hands every customer every job.
notes.push(`Jobs rows the office manager sees in the grid: ${totalJobs ?? "?"}`);
if (totalJobs && seen.rows.length) {
  notes.push(
    `she sees FEWER jobs than the office manager: ${seen.rows.length < totalJobs} (${seen.rows.length} of ${totalJobs})`,
  );
}

console.log("\n--- WALK 3 ---");
notes.forEach((n) => console.log(" ·", n));
await browser.close();

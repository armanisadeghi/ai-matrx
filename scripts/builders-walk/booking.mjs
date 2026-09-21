/**
 * WALK 2 — IRONCLAD MOBILE MECHANIC, A PUBLIC BOOKING PAGE.
 *
 * The real job: a mobile mechanic sells TIME. He wants customers to book a
 * 30-minute on-site diagnostic themselves instead of playing phone tag, on the
 * afternoons he is not already under a truck. He opens his own `Service Calls`
 * table — 38 real calls in it — presses "Build the booking page", sets the four
 * things Calendly asks for, and publishes.
 *
 * Then a CUSTOMER with no account opens the link, picks a time, books, and the
 * appointment is a row in his table. Then she CANCELS from her own link and the
 * row says so.
 *
 * WHAT WOULD MAKE THIS A FAKE: calling `custom.booking_declare` from node. Every
 * step is a click, and the last assertions read his grid and her page.
 */
import { chromium } from "playwright";
import { CASES, ORIGIN, signIn, useOrganization, settleOnTable, shot, shotPath } from "./walk.mjs";

const T = CASES.booking;
const PAGE_TITLE = "On-site diagnostic — 30 minutes";
const CUSTOMER = { name: "Tobias Reyner", email: "tobias.reyner.c1@example.org" };

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1020 } })).newPage();
const notes = [];

const who = await signIn(page, `/data-v2`);
notes.push(`signed in as ${who.email}`);
await useOrganization(page, T);

await settleOnTable(page, T.table);
const before = await page.evaluate(() => document.body.innerText);
notes.push(`service calls before: ${before.match(/Service Calls\s+(\d+)/)?.[1] ?? "?"}`);

await page.getByRole("button", { name: /^Bookings$/ }).first().click();
await page.waitForTimeout(3000);
await shot(page, "builders-10-ironclad-bookings-rail");
const rail = await page.evaluate(() => document.body.innerText);
notes.push(
  `rail offers a builder: ${/Build the booking page|Build a booking page/.test(rail)}`,
  `rail offers an agent: ${/Ask an agent/.test(rail)}`,
);

await page.getByRole("button", { name: /Build the booking page|Build a booking page/ }).first().click();
await page.waitForTimeout(6000);
await shot(page, "builders-10b-ironclad-booking-builder-open");
notes.push(
  `builder on screen: ${
    (await page.evaluate(() => document.body.innerText)).match(
      /New booking page|Booking page|Making a booking page needs[^\n]*/,
    )?.[0] ?? "NOTHING"
  }`,
);

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

await field("What it is called").fill(PAGE_TITLE);
await pick("How long one appointment is").selectOption("30");
await pick("Gap kept after each one").selectOption("15");
await page.waitForTimeout(400);

// The afternoons he is free. He works on trucks the rest of the week, so the
// other days come OFF and the row says so — "not taking bookings" — rather
// than looking like a blank.
const dayBox = (day) =>
  page.locator(`label:has(input[type=checkbox]):has-text("${day}") input[type=checkbox]`).first();
for (const day of ["Mon", "Wed", "Fri"]) {
  const box = dayBox(day);
  if (await box.isVisible().catch(() => false)) await box.uncheck().catch(() => {});
  await page.waitForTimeout(200);
}
for (const day of ["Tue", "Thu"]) {
  const box = dayBox(day);
  if (await box.isVisible().catch(() => false)) await box.check().catch(() => {});
  await page.waitForTimeout(200);
}
notes.push(
  `days on after editing: ${
    (await page.evaluate(() => document.body.innerText)).match(/Hours you are free[\s\S]{0,240}/)?.[0]
      ?.replace(/\n+/g, " ")
      .slice(0, 220) ?? "?"
  }`,
);

// WHAT THE CUSTOMER IS ASKED. His table's own columns — the time, the status
// and who it is with are the store's, and the builder does not offer them.
for (const column of ["Customer", "Location Address", "Issue Type"]) {
  const box = page.getByRole("checkbox", { name: new RegExp(`^${column}$`, "i") }).first();
  if (await box.isVisible().catch(() => false)) await box.check().catch(() => {});
  else {
    const alt = page.locator(`label:has-text("${column}") input[type=checkbox]`).first();
    await alt.check().catch(() => {});
  }
  await page.waitForTimeout(300);
}

await field("What they see after booking").fill(
  "You're booked. I'll text the morning of with a arrival window — reply to that to move it.",
);
await shot(page, "builders-11-ironclad-booking-builder");

await page.getByRole("button", { name: /^Save$/ }).first().click();
await page.waitForTimeout(7000);
const saved = await page.evaluate(() => document.body.innerText);
notes.push(`the store's own offer: ${saved.match(/Saved\. The page offers[^\n]*/)?.[0] ?? "NOT SHOWN"}`);
await shot(page, "builders-12-ironclad-booking-saved");

const publish = page.getByRole("button", { name: /^Publish$/ }).first();
if (await publish.isVisible().catch(() => false)) {
  await publish.click();
  await page.waitForTimeout(6000);
}
await shot(page, "builders-13-ironclad-booking-published");

const afterBuild = await page.evaluate(() => document.body.innerText);
const bookingId = afterBuild.match(/\/b\/([0-9a-f-]{36})/i)?.[1] ?? null;
notes.push(`public link: ${bookingId ? `${ORIGIN}/b/${bookingId}` : "NONE ON SCREEN"}`);
if (!bookingId) throw new Error("the builder published no booking link this walk could open");

// ── a customer with no account books a time ─────────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
const cp = await ctx.newPage();
await cp.goto(`${ORIGIN}/b/${bookingId}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await cp.waitForTimeout(7000);
await cp.screenshot({ path: shotPath("builders-14-ironclad-booking-as-a-customer") });
notes.push(`customer sees: ${(await cp.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 300)}`);

// Pick the first time on offer. The OFFER is the store's — this page never
// computes a slot, so whatever is drawn here is what the index protects.
const slot = cp.locator("button:visible").filter({ hasText: /\d{1,2}:\d{2}/ }).first();
if (await slot.count()) {
  await slot.click();
  await cp.waitForTimeout(4000);
}
await cp.screenshot({ path: shotPath("builders-15-ironclad-slot-held") });

for (let step = 0; step < 8; step += 1) {
  const text = await cp.evaluate(() => document.body.innerText);
  if (/You're booked|booked\b/i.test(text) && !/pick a time/i.test(text)) break;
  const input = cp.locator("input:visible, textarea:visible").first();
  if (await input.count()) {
    const type = await input.getAttribute("type");
    await input.fill(type === "email" ? CUSTOMER.email : CUSTOMER.name);
    await cp.waitForTimeout(400);
  }
  const next = cp.getByRole("button", { name: /Book|Confirm|Submit|Next|Continue/i }).first();
  if (!(await next.count())) break;
  await next.click().catch(() => {});
  await cp.waitForTimeout(3500);
}
await cp.waitForTimeout(2500);
await cp.screenshot({ path: shotPath("builders-16-ironclad-booked") });
const confirmed = await cp.evaluate(() => document.body.innerText);
notes.push(`after booking: ${confirmed.replace(/\n+/g, " | ").slice(0, 260)}`);

// ── she cancels, from her own link ──────────────────────────────────────────
// The page offers it as "Move or cancel this appointment" — a LINK, not a
// button named Cancel, which is what the first version of this walk looked for
// and reported missing.
const manage = cp.getByRole("link", { name: /Move or cancel/i }).first();
const cancelBtn = cp.getByRole("button", { name: /Move or cancel|Cancel/i }).first();
if ((await manage.count()) || (await cancelBtn.count())) {
  if (await manage.count()) await manage.click().catch(() => {});
  else await cancelBtn.click().catch(() => {});
  await cp.waitForTimeout(5000);
  await cp.screenshot({ path: shotPath("builders-16b-ironclad-manage-appointment") });
  const sure = cp.getByRole("button", { name: /^Cancel the appointment$|^Cancel$|Yes/i }).first();
  if (await sure.count()) {
    await sure.click().catch(() => {});
    await cp.waitForTimeout(5000);
  }
  await cp.screenshot({ path: shotPath("builders-17-ironclad-cancelled") });
  notes.push(
    `after cancelling: ${(await cp.evaluate(() => document.body.innerText)).replace(/\n+/g, " | ").slice(0, 240)}`,
  );
} else {
  notes.push("after booking there was NO way to move or cancel on the visitor's page");
}
await ctx.close();

// ── his grid, and his bookings list ─────────────────────────────────────────
await settleOnTable(page, T.table);
const grid = await page.evaluate(() => document.body.innerText);
notes.push(`service calls after: ${grid.match(/Service Calls\s+(\d+)/)?.[1] ?? "?"}`);
notes.push(`"${CUSTOMER.name}" in the grid: ${grid.includes(CUSTOMER.name)}`);
await shot(page, "builders-18-ironclad-appointment-in-the-grid");

await page.getByRole("button", { name: /^Bookings$/ }).first().click();
await page.waitForTimeout(4000);
const list = await page.evaluate(() => document.body.innerText);
notes.push(`bookings list: ${list.match(/\d+ coming up[^\n]*/)?.[0] ?? "?"}`);
await shot(page, "builders-19-ironclad-bookings-list");

// ── BOTH WAYS IN, on a rail with nothing in it yet ─────────────────────────
// The empty state is the only place `BuildOrAsk` draws, so the agent button can
// only be proven on a rail that has no items — this table has no forms.
await page.getByRole("button", { name: /^Forms$/ }).first().click();
await page.waitForTimeout(4000);
const empty = await page.evaluate(() => document.body.innerText);
notes.push(
  `EMPTY RAIL — offers "Build the form": ${/Build the form/.test(empty)}`,
  `EMPTY RAIL — offers "Ask an agent": ${/Ask an agent/.test(empty)}`,
  `EMPTY RAIL — suggests wording: ${/You would say something like/.test(empty)}`,
  `EMPTY RAIL — still names an unbound port: ${/onAskForOne/.test(empty)}`,
);
await shot(page, "builders-09-both-ways-in-on-an-empty-rail");

console.log("\n--- WALK 2 ---");
notes.forEach((n) => console.log(" ·", n));
await browser.close();

/**
 * WALK 4 — HANDS & HOPE ALLIANCE, A WEEKLY DONOR DIGEST.
 *
 * The real job: a small nonprofit with 50 real pledges across four campaigns
 * wants a Monday-morning summary of what came in. This is the exact thing crew
 * F could not get: dashboards worked and nothing could schedule one, because a
 * subscription is written over a saved view and no door onto saved views was
 * reachable from a browser.
 *
 * The walk builds a dashboard on `pledges`, presses "Send on a schedule", asks
 * for Monday at 8, schedules it, and then presses "Send me one now" — which
 * ASSEMBLES the summary and shows it without sending or recording anything, so
 * the proof costs nobody a message and does not rob the real Monday summary of
 * a week of news.
 */
import { chromium } from "playwright";
import { CASES, ORIGIN, signIn, useOrganization, settleOnTable, shot } from "./walk.mjs";

const T = CASES.digest;
const DIGEST_NAME = "Monday donor summary";

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1680, height: 1020 } })).newPage();
const notes = [];

const who = await signIn(page, `/data-v2`);
notes.push(`signed in as ${who.email}`);
await useOrganization(page, T);

await settleOnTable(page, T.table);
await shot(page, "builders-30-hha-pledges-grid");

// ── the dashboard the summary is about ──────────────────────────────────────
await page.getByRole("button", { name: /^Dashboards$/ }).first().click();
await page.waitForTimeout(4000);
const newBoard = page.getByRole("button", { name: /New dashboard/i }).first();
if (await newBoard.isVisible().catch(() => false)) {
  await newBoard.click();
  await page.waitForTimeout(9000);
}
await shot(page, "builders-31-hha-dashboard");
const boardText = await page.evaluate(() => document.body.innerText);
notes.push(`dashboard on screen: ${/\d/.test(boardText)}`);
notes.push(`dashboard offers a schedule: ${/Send on a schedule/.test(boardText)}`);

// ── "send this every Monday at 8" ───────────────────────────────────────────
const schedule = page.getByRole("button", { name: /Send on a schedule/i }).first();
if (!(await schedule.isVisible().catch(() => false))) {
  throw new Error("the dashboard carries no way to schedule a summary");
}
await schedule.click();
await page.waitForTimeout(4000);
await shot(page, "builders-32-hha-digest-scheduler");

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

await exactField("What to call it").fill(DIGEST_NAME);
await exactPick("How often").selectOption({ label: "every week" }).catch(async () => {
  await exactPick("How often").selectOption("weekly");
});
await page.waitForTimeout(800);
await exactPick("Which day").selectOption({ label: "Monday" }).catch(() => {});
await exactField("At").fill("08:00").catch(() => {});
await page.waitForTimeout(600);
await shot(page, "builders-33-hha-digest-filled");

await page.getByRole("button", { name: /Schedule it/i }).first().click();
await page.waitForTimeout(9000);
await shot(page, "builders-34-hha-digest-scheduled");
const scheduled = await page.evaluate(() => document.body.innerText);
notes.push(`what it says it will do: ${scheduled.match(/[^\n]*will get it[^\n]*/)?.[0] ?? "NOTHING"}`);

// ── one run, fired on demand ────────────────────────────────────────────────
const now = page.getByRole("button", { name: /Send me one now/i }).first();
if (!(await now.isVisible().catch(() => false))) {
  throw new Error("nothing offers to show the summary now");
}
await now.click();
await page.waitForTimeout(9000);
await shot(page, "builders-35-hha-digest-preview");
const preview = await page.evaluate(() => document.body.innerText);
notes.push(
  `the summary it would send: ${preview.match(/Nothing was sent and nothing was recorded[^\n]*/) ? "rendered" : "NOT RENDERED"}`,
);
const subject = preview.split("\n").find((l) => /summary|pledge|donor/i.test(l) && l.length > 12);
notes.push(`subject-ish line: ${subject ?? "?"}`);

// ── and it is in the Notifications rail, switchable off ─────────────────────
await page.getByRole("button", { name: /^Notifications$/ }).first().click();
await page.waitForTimeout(5000);
const rail = await page.evaluate(() => document.body.innerText);
notes.push(`in the notifications rail: ${rail.includes(DIGEST_NAME)}`);
notes.push(`next summary line: ${rail.match(/Next summary[^\n]*/)?.[0] ?? "?"}`);
notes.push(`channel sentence: ${rail.match(/in the app|by email[^\n]*|by text[^\n]*/)?.[0] ?? "?"}`);
await shot(page, "builders-36-hha-notifications-rail");

console.log("\n--- WALK 4 ---");
notes.forEach((n) => console.log(" ·", n));
await browser.close();

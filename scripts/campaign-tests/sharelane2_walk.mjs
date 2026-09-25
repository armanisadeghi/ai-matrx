/**
 * SHARE-LANE-2 — an organization's owner does not open a personal Table; he transfers it.
 * Headless, on the shared preview (LIVE data), as the people. Setting: sharelane2_setup.mjs.
 *
 * THE REAL USE CASE. Dr. Reyes (test@test.com) keeps "My case notes" in Cedar Hollow Veterinary,
 * set to "Only people I share it with". admin@admin.com OWNS the practice and is not named.
 *   1. The owner opens the Table's address: the honest no-access page, no row of her notes, and
 *      "You are not named on this table." with Transfer ownership….
 *   2. In organization settings, under Dr. Reyes' row: "Transfer their personal tables…". The
 *      dialog counts one personal table (never its name), will not send without a reason, and
 *      with one transfers it to him; the door says so in its own words.
 *   3. The owner opens the Table again and reads the note.
 *   4. Dr. Reyes still reads it (she stays named, as editor).
 *   5. The same dialog at 390 px fits the screen.
 * The audit row and both notices are read from the database by the runner afterwards.
 *
 *   ORIGIN=http://share-lane-2.localhost:3001 OUT=<dir> ORG=<id> TABLE=<id> ROW="<text>" \
 *     node scripts/campaign-tests/sharelane2_walk.mjs
 *   (credentials from the environment: TEST_SEAT_PASSWORD, AI_ADMIN_PASSWORD)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://share-lane-2.localhost:3001";
const { OUT, ORG, TABLE, ROW } = process.env;
if (!OUT || !ORG || !TABLE || !ROW) throw new Error("OUT, ORG, TABLE and ROW are required");
mkdirSync(OUT, { recursive: true });
const TEST_ID = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const TEST_PW = process.env.TEST_SEAT_PASSWORD;
const ADMIN_PW = process.env.AI_ADMIN_PASSWORD;
if (!TEST_PW || !ADMIN_PW) throw new Error("TEST_SEAT_PASSWORD and AI_ADMIN_PASSWORD are required");
const SLOW = 300000;
const REASON = "Dr. Reyes is moving to the Irvine clinic on Monday; her open cases stay with the practice.";

const results = [];
const pass = (clause, ok, said) => {
  results.push({ clause, ok, said });
  console.log(`${ok ? "PASS" : "FAIL"} ${clause} — ${typeof said === "string" ? said : JSON.stringify(said)}`);
};
const shot = async (page, tag, w) => {
  const p = resolve(OUT, `${w}-${tag}.png`);
  await page.screenshot({ path: p });
  console.log(`shot -> ${p}`);
};
const text = (page) => page.evaluate(() => document.body.innerText);
const q = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);

const browser = await chromium.launch({ headless: true });
try {
  const actx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const a = await actx.newPage();
  pass("admin seat signed in", (await signIn(a, ORIGIN, "admin@admin.com", ADMIN_PW, "admin seat")) === "admin@admin.com", "admin@admin.com");

  // 1. the owner, not named, meets the honest no-access page and the offer
  await a.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: SLOW });
  const offer = await until("the transfer offer", () => q(a, "[data-table-transfer-offer]"), SLOW);
  const page1 = await text(a);
  const refused = /not been shared|not been given|no access|don't have access|do not have access|not shared with you/i.test(page1);
  pass("1. the owner gets the honest no-access page", refused, page1.replace(/\s+/g, " ").slice(0, 240));
  pass("1. and reads no row of her notes", !page1.includes(ROW), "absent");
  const onScreen = await a.evaluate(() => {
    const r = document.querySelector("[data-table-transfer-open]")?.getBoundingClientRect();
    return !!r && r.top >= 0 && r.bottom <= window.innerHeight;
  });
  pass("1. 'You are not named on this table.' with Transfer ownership…, on screen", !!offer.v?.includes("You are not named on this table.") && !!offer.v?.includes("Transfer ownership") && onScreen, offer.v);
  await shot(a, "1-owner-not-named", 1600);

  // 2. organization settings → Dr. Reyes' row → Transfer their personal tables…
  await a.goto(`${ORIGIN}/organizations/${ORG}/settings#members`, { waitUntil: "domcontentloaded", timeout: SLOW });
  const btn = await until(
    "the member-row transfer action",
    async () => {
      const l = a.locator(`[data-member-transfer-tables="${TEST_ID}"]`);
      if ((await l.count()) === 0) return null;
      await l.first().scrollIntoViewIfNeeded().catch(() => {});
      return (await l.first().isVisible().catch(() => false)) ? "visible" : null;
    },
    SLOW,
  );
  pass("2. under Dr. Reyes' row: Transfer their personal tables…", !!btn.v, btn.v ?? "(absent)");
  await shot(a, "2-member-row", 1600);
  await a.locator(`[data-member-transfer-tables="${TEST_ID}"]`).first().click({ timeout: 20000 });
  const counted = await until("the count", async () => {
    const t = await q(a, "[data-table-transfer]");
    return t && /keeps 1 personal table/.test(t) ? t : null;
  }, 60000);
  pass("2. the dialog counts one personal table and names none", !!counted.v && !counted.v.includes("My case notes"), counted.v);
  await shot(a, "3-transfer-dialog", 1600);
  await a.locator("[data-transfer-go]").click({ timeout: 20000 });
  const need = await until("the reason is asked for", () => q(a, "[data-transfer-need-reason]"), 10000);
  pass("2. no reason: it says why instead of sending", !!need.v?.includes("Say why"), need.v);
  await a.locator("[data-transfer-reason]").fill(REASON);
  await shot(a, "4-reason-given", 1600);
  await a.locator("[data-transfer-go]").click({ timeout: 20000 });
  const said = await until("the door's sentence", () => q(a, "[data-transfer-said]"), 60000);
  pass("2. transferred: the door says the table now belongs to him", !!said.v?.includes("now belongs to you"), said.v);
  await shot(a, "5-transferred", 1600);

  // 3. the owner, now its owner, reads it
  await a.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: SLOW });
  const reads = await until("the note", () => a.evaluate((r) => document.body.innerText.includes(r), ROW), SLOW);
  pass("3. the new owner reads the note", !!reads.v, ROW);
  await sleep(1500);
  await shot(a, "6-new-owner-reads", 1600);
  await actx.close();

  // 4. Dr. Reyes stays named as editor and still reads it
  const tctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const t = await tctx.newPage();
  pass("test seat signed in", (await signIn(t, ORIGIN, "test@test.com", TEST_PW, "test seat")) === "test@test.com", "test@test.com");
  await t.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: SLOW });
  const still = await until("her note", () => t.evaluate((r) => document.body.innerText.includes(r), ROW), SLOW);
  pass("4. Dr. Reyes still reads her notes (named as editor)", !!still.v, ROW);
  await sleep(1500);
  await shot(t, "7-previous-owner-still-reads", 1600);
  await tctx.close();

  // 5. 390 px: the settings row's dialog fits the screen
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mctx.newPage();
  await signIn(m, ORIGIN, "admin@admin.com", ADMIN_PW, "admin seat 390");
  await m.goto(`${ORIGIN}/organizations/${ORG}/settings#members`, { waitUntil: "domcontentloaded", timeout: SLOW });
  await until("the member-row action at 390", async () => (await m.locator(`[data-member-transfer-tables="${TEST_ID}"]`).count()) > 0, SLOW);
  await m.locator(`[data-member-transfer-tables="${TEST_ID}"]`).first().scrollIntoViewIfNeeded();
  await m.locator(`[data-member-transfer-tables="${TEST_ID}"]`).first().click({ timeout: 20000 });
  const none = await until("the dialog at 390", async () => {
    const x = await q(m, "[data-table-transfer]");
    return x && /keeps no personal tables/.test(x) ? x : null;
  }, 60000);
  const fits = await m.evaluate(() => {
    const d = document.querySelector("[data-table-transfer]")?.getBoundingClientRect();
    return !!d && d.left >= 0 && d.right <= window.innerWidth && document.documentElement.scrollWidth <= window.innerWidth;
  });
  pass("5. at 390 the dialog fits and, after the transfer, says she keeps none", !!none.v && fits, none.v);
  await shot(m, "8-dialog-390", 390);
  await mctx.close();
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);

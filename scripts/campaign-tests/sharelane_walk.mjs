/**
 * SHARE-LANE-CONTROL — "Who can see this" walked from both seats, headless, on the shared preview
 * (LIVE data). VERIFIER-23 item 3 could not walk it because the control did not exist.
 *
 * THE REAL USE CASE. Alex Hart (test@test.com) runs "Maple Street Community Garden"; Morgan
 * (admin@admin.com) is a plain volunteer member there. Alex keeps "Plot waitlist" (made by
 * sharelane_setup.mjs) and decides only the people she names may see it:
 *   1. Alex opens Share: "Everyone in Maple Street Community Garden" is selected, it says it is the
 *      organization's default, and Current Access shows the organization-default row.
 *   2. Alex picks "Only people I share it with": one sentence names what happens; she confirms.
 *      The segment reads mine and Current Access drops the default row.
 *   3. Morgan opens the table's address: the honest not-found, and no row of the waitlist.
 *   4. Alex names Morgan; Morgan reloads and reads the waitlist.
 *   5. Alex sets it back to "Everyone in …" (no question asked); the default row returns.
 *   6. The same dialog at 390 px: the segment is a stacked list.
 *
 *   ORIGIN=http://share-lane.localhost:3001 OUT=<dir> TABLE=<id> ROW="<row text>" ORG_NAME="<name>" \
 *     node scripts/campaign-tests/sharelane_walk.mjs
 *   (credentials from the environment: TEST_SEAT_PASSWORD, AI_ADMIN_PASSWORD)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://share-lane.localhost:3001";
const { OUT, TABLE, ROW } = process.env;
const ORG_NAME = process.env.ORG_NAME ?? "Maple Street Community Garden";
if (!OUT || !TABLE || !ROW) throw new Error("OUT, TABLE and ROW are required");
mkdirSync(OUT, { recursive: true });
const TEST_PW = process.env.TEST_SEAT_PASSWORD;
const ADMIN_PW = process.env.AI_ADMIN_PASSWORD;
if (!TEST_PW || !ADMIN_PW) throw new Error("TEST_SEAT_PASSWORD and AI_ADMIN_PASSWORD are required");
const SLOW = 300000;

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
const q = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const lane = (page) => page.evaluate(() => document.querySelector("[data-who-can-see]")?.getAttribute("data-lane") ?? null);

async function openTable(page, expectRow = true) {
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: SLOW });
  if (!expectRow) return true;
  const rows = await until("the table's row", () => page.evaluate((t) => document.body.innerText.includes(t), ROW), SLOW);
  await sleep(1500);
  return !!rows.v;
}

async function openShare(page) {
  const found = await until(
    "the Share control",
    async () => {
      const share = page.locator('button:has-text("Share"), [aria-label="Share"]');
      for (let i = 0; i < (await share.count()); i += 1) {
        const b = share.nth(i);
        if (await b.isVisible().catch(() => false)) {
          await b.click({ timeout: 20000 });
          return true;
        }
      }
      return false;
    },
    120000,
  );
  if (!found.v) throw new Error("no visible Share control");
  await until("Who can see this", async () => (await lane(page)) !== null, 90000);
  await sleep(1000);
}

async function chooseLane(page, choice) {
  await page.locator(`[role="dialog"] [data-lane-choice="${choice}"]`).click({ timeout: 20000 });
}

const browser = await chromium.launch({ headless: true });
try {
  // ── Alex, 1600
  const tctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const t = await tctx.newPage();
  pass("test seat signed in", (await signIn(t, ORIGIN, "test@test.com", TEST_PW, "test seat")) === "test@test.com", "test@test.com");
  pass("Alex opens her table", await openTable(t), TABLE);
  await openShare(t);

  // 1. the current state
  const orgChoice = await q(t, '[data-lane-choice="organization"]');
  pass(
    "1. Everyone in <org> is selected and says it is the organization's default",
    (await lane(t)) === "organization" &&
      (await t.getAttribute('[data-lane-choice="organization"]', "aria-checked")) === "true" &&
      orgChoice?.includes(`Everyone in ${ORG_NAME}`) &&
      orgChoice?.includes("This is the organization's default."),
    orgChoice,
  );
  pass("1. no Anyone-with-the-link choice while the world lane is closed", (await t.locator('[data-lane-choice="world"]').count()) === 0, "absent");
  const def1 = await q(t, "[role=dialog] [data-organization-default]");
  pass("1. Current Access shows the organization-default row", !!def1?.includes(`Everyone in ${ORG_NAME} can`), def1);
  await shot(t, "1-everyone-selected", 1600);

  // 2. Only people I share it with → one sentence → confirm
  await chooseLane(t, "mine");
  const confirm = await until("the confirm sentence", () => q(t, "[data-lane-confirm]"), 10000);
  pass(
    "2. the confirm names what happens",
    !!confirm.v?.includes(`Everyone in ${ORG_NAME} who is not named below loses access, including the organization's owners.`),
    confirm.v,
  );
  pass("2. nothing applied before confirm", (await lane(t)) === "organization", await lane(t));
  await shot(t, "2-confirm", 1600);
  await t.locator('[data-lane-confirm] button:has-text("Only people I share it with")').click({ timeout: 20000 });
  const mine = await until("lane is mine", async () => (await lane(t)) === "mine", 60000);
  const said = await q(t, "[data-lane-said]");
  pass("2. applied on confirm: the segment reads Only people I share it with", !!mine.v, said);
  const def2 = await until("the default row goes", async () => (await q(t, "[role=dialog] [data-organization-default]")) === null, 30000);
  pass("2. Current Access no longer shows the organization-default row", !!def2.v, "absent");
  await shot(t, "3-only-people-i-share-with", 1600);

  // 3. Morgan, a plain member not named, gets the honest not-found
  const actx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const a = await actx.newPage();
  pass("admin seat signed in", (await signIn(a, ORIGIN, "admin@admin.com", ADMIN_PW, "admin seat")) === "admin@admin.com", "admin@admin.com");
  await openTable(a, false);
  const refused = await until(
    "the honest not-found",
    () => a.evaluate(() => {
      const txt = document.body.innerText;
      return /not been given|not found|does not exist|no access|You do not have access|don't have access/i.test(txt) ? txt.slice(0, 600) : null;
    }),
    SLOW,
  );
  const leaked = await a.evaluate((r) => document.body.innerText.includes(r), ROW);
  pass("3. Morgan (member, not named) is refused honestly and reads no row", !!refused.v && !leaked, (refused.v ?? "(no refusal text)").replace(/\s+/g, " ").slice(0, 300));
  await shot(a, "4-member-refused", 1600);

  // 4. Alex names Morgan; Morgan reads it
  await t.locator("#user-email").fill("admin@admin.com");
  await t.locator('[role="dialog"] button:has-text("Share with User")').click({ timeout: 20000 });
  const named = await until("Shared with admin", async () => ((await q(t, "[role=dialog]")) ?? "").includes("Shared with admin@admin.com"), 60000);
  pass("4. Alex names Morgan", !!named.v, "Shared with admin@admin.com");
  pass("4. naming leaves the lane at mine", (await lane(t)) === "mine", await lane(t));
  await shot(t, "5-named-morgan", 1600);
  pass("4. Morgan, named, reads the waitlist", await openTable(a, true), ROW);
  await shot(a, "6-member-named-reads", 1600);

  // 5. back to Everyone in <org>: no question, the default row returns
  await sleep(2000);
  await chooseLane(t, "organization");
  pass("5. no confirm when widening", (await t.locator("[data-lane-confirm]").count()) === 0, "none");
  const back = await until("lane is organization", async () => (await lane(t)) === "organization", 60000);
  const def3 = await until("the default row returns", () => q(t, "[role=dialog] [data-organization-default]"), 30000);
  pass("5. back to Everyone in <org>, and Current Access shows the default row", !!back.v && !!def3.v, def3.v);
  await shot(t, "7-back-to-everyone", 1600);
  await actx.close();
  await tctx.close();

  // 6. 390 px: a stacked list
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mctx.newPage();
  await signIn(m, ORIGIN, "test@test.com", TEST_PW, "test seat 390");
  await openTable(m);
  await openShare(m);
  const boxes = await m.evaluate(() =>
    Array.from(document.querySelectorAll("[data-lane-choice]")).map((b) => {
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
    }),
  );
  const stacked = boxes.length >= 2 && boxes.every((b, i) => i === 0 || b.y > boxes[i - 1].y) && new Set(boxes.map((b) => b.x)).size === 1;
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  pass("6. at 390 the segment is a stacked list, no sideways scroll", stacked && !overflow, boxes);
  await m.locator("[data-who-can-see]").scrollIntoViewIfNeeded();
  await shot(m, "8-segment-stacked", 390);
  await mctx.close();
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);

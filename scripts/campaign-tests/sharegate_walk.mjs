/**
 * SHARE-GATE-OFF — naming a person is the only act, walked headless on the dev clone.
 *
 * THE REAL USE CASE. Ridgeline Physical Therapy keeps each patient's home program in its
 * "exercises_prescribed" table. A physical therapist shares that table, read-only, with a
 * referring clinician who has an account on the platform but works for somebody else
 * (test@test.com — a member of other organizations, not of Ridgeline). Ridgeline has NEVER
 * touched the outside-sharing switch: no override row, no audit row.
 *
 *   1. admin@admin.com signs in through the login form, opens the table's Share dialog.
 *      There is no "Turn on sharing with people outside" control — only the invite and the list.
 *   2. They type the clinician's address and press Invite. The invitation is created. No other step.
 *   3. The clinician signs in through the login form, follows the link and opens the table:
 *      the home-program rows are on the screen.
 *   4. The switch lives only in the organization's settings, in plain words.
 *
 *   ORIGIN=http://sharegate.localhost:3067 OUT=<dir> AI_ADMIN_USERNAME=… AI_ADMIN_PASSWORD=… \
 *   TEST_SEAT_EMAIL=test@test.com TEST_SEAT_PASSWORD=… node scripts/campaign-tests/sharegate_walk.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://sharegate.localhost:3067";
const OUT = process.env.OUT;
if (!OUT) throw new Error("OUT is required");
mkdirSync(OUT, { recursive: true });
const ORG_ID = "0fec03d8-afe5-4ea0-bf14-d0ab18e4a536"; // Ridgeline Physical Therapy
const TABLE = "09ac14a1-497b-405f-82cd-afc60aedd870"; // exercises_prescribed
const GUEST = process.env.TEST_SEAT_EMAIL ?? "test@test.com";

const results = [];
const pass = (clause, ok, said) => {
  results.push({ clause, ok, said });
  console.log(`${ok ? "PASS" : "FAIL"} ${clause} — ${typeof said === "string" ? said : JSON.stringify(said)}`);
};
const shot = async (page, tag) => {
  const p = resolve(OUT, `sharegate-${tag}.png`);
  await page.screenshot({ path: p });
  console.log(`shot -> ${p}`);
};

async function openShare(page) {
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  // The grid first: a Share pressed while the page is still reading the table opens nothing.
  await until(
    "the table's rows",
    () => page.evaluate(() => /chin[_ ]tucks|scapular[_ ]retraction|straight[_ ]leg[_ ]raise/i.test(document.body.innerText)),
    180000,
  );
  await sleep(2000);
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
    180000,
  );
  if (!found.v) throw new Error("no visible Share control on the table page");
  const panel = await until(
    "the outside panel",
    () => page.evaluate(() => Array.from(document.querySelectorAll("h3")).some((h) => /People outside this organization/.test(h.textContent || "") && h.getBoundingClientRect().height > 0)),
    90000,
  );
  if (!panel.v) throw new Error("the Share dialog never drew the outside panel");
  await until("the invite field or the closed sentence", () =>
    page.evaluate(() => !!document.querySelector("#outside-email") || /turned off sharing with people outside/.test(document.body.innerText)),
    60000,
  );
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("h3")).find((x) => /People outside this organization/.test(x.textContent || ""));
    h?.scrollIntoView({ block: "start" });
  });
  await sleep(800);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const adminCtx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const admin = await adminCtx.newPage();
  const who = await signIn(admin, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD, "admin seat");
  pass("admin seat is admin@admin.com", who === "admin@admin.com", who);

  // 1. The Share dialog in an organization that never touched the switch.
  await openShare(admin);
  const before = await admin.evaluate(() => ({
    turnOn: Array.from(document.querySelectorAll("button")).map((b) => (b.textContent || "").trim()).filter((t) => /turn (it )?on|sharing with people outside/i.test(t)),
    emailField: !!document.querySelector("#outside-email"),
    closedSentence: /turned off sharing with people outside/.test(document.body.innerText),
  }));
  await shot(admin, "1-share-dialog-no-switch");
  pass("no switch in front of the invite", before.turnOn.length === 0, before);
  pass("the invite field is there at once", before.emailField && !before.closedSentence, before);

  // 2. Name the person. Nothing else.
  const already = await admin.evaluate((g) => document.body.innerText.includes(g), GUEST);
  if (already) console.log(`NOTE ${GUEST} was already on this table's outside list from an earlier run; inviting again`);
  await admin.fill("#outside-email", GUEST);
  const invite = admin.locator('button:has-text("Invite")');
  for (let i = 0; i < (await invite.count()); i += 1) {
    const b = invite.nth(i);
    if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 20000 }); break; }
  }
  // The invite has answered when the field is cleared and the panel has re-read the store;
  // a Copy link pressed before that copies the row as it was.
  await until("the invite answered", () => admin.evaluate(() => (document.querySelector("#outside-email")?.value ?? "x") === ""), 60000);
  await sleep(4000);
  const row = await until(
    "the invited row",
    () => admin.evaluate((g) => {
      const t = document.body.innerText;
      return t.includes(g) && /Invited, not yet joined/.test(t);
    }, GUEST),
    60000,
  );
  await shot(admin, "2-invited");
  pass("the share is created by naming the person", !!row.v, `${GUEST} listed as invited`);
  await admin.locator('button:has-text("Copy link")').first().click({ timeout: 20000 });
  await sleep(1200);
  const link = await admin.evaluate(() => navigator.clipboard.readText());
  const acceptPath = new URL(link).pathname;
  pass("the pending row carries its link", /\/invitations\/table\/accept\//.test(acceptPath), acceptPath.replace(/[^/]+$/, "<token>"));

  // 3. The clinician, in their own seat.
  const guestCtx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const guest = await guestCtx.newPage();
  const gWho = await signIn(guest, ORIGIN, GUEST, process.env.TEST_SEAT_PASSWORD, "guest seat");
  pass("guest seat is test@test.com", gWho === GUEST, gWho);
  // The sign-in leaves a navigation in flight; a goto that lands on it aborts. Retried, and said.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await guest.goto(`${ORIGIN}${acceptPath}`, { waitUntil: "domcontentloaded", timeout: 180000 });
      break;
    } catch (e) {
      if (attempt >= 4 || !String(e).includes("ERR_ABORTED")) throw e;
      console.log(`RETRY goto accept (${attempt})`);
      await sleep(3000);
    }
  }
  const offer = await until(
    "the accept button",
    async () => {
      const b = guest.locator('button:has-text("Open"), button:has-text("Accept")');
      for (let i = 0; i < (await b.count()); i += 1) {
        const x = b.nth(i);
        if (await x.isVisible().catch(() => false)) return x;
      }
      return null;
    },
    120000,
  );
  await shot(guest, "3-the-offer");
  if (!offer.v) throw new Error("the accept page offered no button");
  await offer.v.click({ timeout: 20000 });
  // Accepting may land in the table directly or offer "Open <table>" once more.
  await sleep(6000);
  const again = guest.locator('button:has-text("Open exercises_prescribed"), a:has-text("Open exercises_prescribed")');
  if (await again.count()) await again.first().click({ timeout: 20000 }).catch(() => {});
  const landed = await until(
    "the home-program rows",
    () => guest.evaluate(() => /chin[_ ]tucks|scapular[_ ]retraction|straight[_ ]leg[_ ]raise/i.test(document.body.innerText)),
    150000,
  );
  await shot(guest, "4-the-table-opens");
  pass("the table opens for test@test.com", !!landed.v, await guest.evaluate(() => location.pathname + location.search));

  // 4. The switch lives only in the organization's settings.
  await admin.goto(`${ORIGIN}/organizations/${ORG_ID}/settings/configuration`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const LABEL = "People in this organization may share tables with people outside it";
  let setting = await until("the setting", () => admin.evaluate((l) => document.body.innerText.includes(l), LABEL), 60000);
  if (!setting.v) {
    const search = admin.locator('input[type="search"], input[placeholder*="Search" i]').first();
    if (await search.count()) {
      await search.fill("outside");
      setting = await until("the setting after search", () => admin.evaluate((l) => document.body.innerText.includes(l), LABEL), 30000);
    }
  }
  await shot(admin, "5-the-setting");
  pass("the setting is in the organization's settings, in plain words", !!setting.v, LABEL);

  console.log(JSON.stringify({ results }, null, 2));
  await browser.close();
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error("[sharegate walk] FAILED:", e.message);
  process.exit(1);
});

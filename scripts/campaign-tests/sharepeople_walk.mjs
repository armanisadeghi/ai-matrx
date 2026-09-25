/**
 * SHARE-PEOPLE-ONLY — a share names a person, walked headless on the shared preview (LIVE data).
 *
 * THE REAL USE CASE. test@test.com (Alex Hart) runs Oak & River's spring season. They keep two
 * disposable tables, "Spring planting orders" and "Irrigation service visits", and want
 * admin@admin.com, a colleague in Oak & River, to see them.
 *
 *   1. test@test.com signs in through the login form and opens Share on "Spring planting orders".
 *      There is no Organizations tab. They name admin@admin.com and press Share with User.
 *   2. On "Irrigation service visits" they press "Add everyone in an organization". Oak & River's
 *      current members are listed by name (never Alex themself), ticked, with the sentence that
 *      people who join later are not added. They press Share and each person is granted.
 *   3. admin@admin.com signs in and opens both tables.
 *
 *   ORIGIN=http://share-people.localhost:3001 OUT=<dir> node scripts/campaign-tests/sharepeople_walk.mjs
 *   (credentials from the environment: AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD, TEST_SEAT_PASSWORD)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://share-people.localhost:3001";
const OUT = process.env.OUT;
if (!OUT) throw new Error("OUT is required");
mkdirSync(OUT, { recursive: true });
const ORDERS = process.env.ORDERS_TABLE; // Spring planting orders
const VISITS = process.env.VISITS_TABLE; // Irrigation service visits
const TEST_EMAIL = "test@test.com";
const TEST_PW = process.env.TEST_SEAT_PASSWORD ?? process.env.AI_ADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME ?? "admin@admin.com";
const ADMIN_PW = process.env.AI_ADMIN_PASSWORD;
const WIDTH = Number(process.env.WIDTH ?? 1600);

const results = [];
const pass = (clause, ok, said) => {
  results.push({ clause, ok, said });
  console.log(`${ok ? "PASS" : "FAIL"} ${clause} — ${typeof said === "string" ? said : JSON.stringify(said)}`);
};
const shot = async (page, tag) => {
  const p = resolve(OUT, `${WIDTH}-${tag}.png`);
  await page.screenshot({ path: p });
  console.log(`shot -> ${p}`);
};

async function openTable(page, id, rowText) {
  await page.goto(`${ORIGIN}/data-v2/${id}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const rows = await until("the table's rows", () => page.evaluate((t) => document.body.innerText.includes(t), rowText), 180000);
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
  await until("the People tab", () => page.evaluate(() => !!document.querySelector('[role="dialog"] [role="tablist"]')), 60000);
  await sleep(1500);
}

const dialogText = (page) => page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? "");
const tabNames = (page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] [role="tab"]')).map((t) => t.textContent?.trim() ?? ""));

const browser = await chromium.launch({ headless: true });
try {
  // ── test@test.com ───────────────────────────────────────────────────────────
  // ADMIN_ONLY=1 re-runs just the admin seat (the shares are already in place).
  if (!process.env.ADMIN_ONLY) {
  const tctx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
  const t = await tctx.newPage();
  if (process.env.VERIFY_ONLY) {
    // The shares are in place: reopen the visits dialog and read what it says now.
    const whoV = await signIn(t, ORIGIN, TEST_EMAIL, TEST_PW, "test seat");
    pass("test seat signed in", whoV === TEST_EMAIL, whoV);
    await openTable(t, VISITS, "Birch Court HOA");
    await openShare(t);
    const cur = await dialogText(t);
    pass("Current Access names admin", /Current Access.*admin@admin\.com/s.test(cur) && !/Not shared with anyone/.test(cur), cur.slice(0, 200));
    await t.locator('[role="dialog"] button:has-text("Add everyone in an organization")').click({ timeout: 20000 });
    await until("members listed", () => t.evaluate(() => document.querySelectorAll("[data-member]").length > 0), 60000);
    const panelV = await t.evaluate(() => document.querySelector("[data-add-everyone-in-org]")?.textContent ?? "");
    pass("already-shared person is skipped and said", /Already has access/.test(panelV) && /has access now/.test(panelV), panelV.slice(0, 220));
    await t.locator("[data-add-everyone-in-org]").scrollIntoViewIfNeeded().catch(() => {});
    await shot(t, "7-visits-reopened");
    await tctx.close();
    throw Object.assign(new Error("verify-only done"), { done: true });
  }
  const who = await signIn(t, ORIGIN, TEST_EMAIL, TEST_PW, "test seat");
  pass("test seat signed in", who === TEST_EMAIL, who);

  pass("orders table opens", await openTable(t, ORDERS, "Delgado residence"), ORDERS);
  await openShare(t);
  const tabs = await tabNames(t);
  pass("no Organizations tab", !tabs.some((n) => /organization/i.test(n)), tabs);
  const before = await dialogText(t);
  pass("no organization grant form", !/Share with Organization|All members of the organization will have access/.test(before), "dialog text scanned");
  await shot(t, "1-orders-share-dialog");

  // 1. name admin@admin.com
  // Pick the person from "Your Contacts" by name, the way a person does.
  await t.locator('[role="dialog"] button:has-text("admin@admin.com"), [role="dialog"] [role="button"]:has-text("admin@admin.com")').first().click({ timeout: 20000 });
  await sleep(800);
  const shareBtn = t.locator('[role="dialog"] button:has-text("Share with User")');
  await shareBtn.click({ timeout: 20000 });
  const granted = await until("admin in Current Access", async () => /admin@admin\.com/.test(await dialogText(t)) && /Shared|success/i.test(await dialogText(t)), 60000);
  await sleep(1500);
  pass("admin named on orders", !!granted.v, (await dialogText(t)).match(/[^.]*admin@admin\.com[^.]*/)?.[0] ?? "");
  await shot(t, "2-orders-admin-named");

  // 2. Add everyone in Oak & River on the visits table
  pass("visits table opens", await openTable(t, VISITS, "Birch Court HOA"), VISITS);
  await openShare(t);
  await t.locator('[role="dialog"] button:has-text("Add everyone in an organization")').click({ timeout: 20000 });
  const listed = await until("members listed", () => t.evaluate(() => document.querySelectorAll("[data-member]").length > 0), 60000);
  const members = await t.evaluate(() => Array.from(document.querySelectorAll("[data-member]")).map((r) => ({
    email: r.getAttribute("data-member"),
    ticked: r.querySelector('[role="checkbox"]')?.getAttribute("data-state"),
  })));
  const panel = await t.evaluate(() => document.querySelector("[data-add-everyone-in-org]")?.textContent ?? "");
  pass("members listed by name, viewer excluded", !!listed.v && !members.some((m) => m.email === TEST_EMAIL) && members.some((m) => m.email === ADMIN_EMAIL), members);
  pass("all ticked", members.filter((m) => m.email === ADMIN_EMAIL).every((m) => m.ticked === "checked"), members);
  pass("later joiners sentence", panel.includes("People who join later are not added."), panel.slice(0, 160));
  pass("names the organization", /Add everyone in Oak & River/.test(panel), panel.slice(0, 60));
  await t.locator("[data-add-everyone-in-org]").scrollIntoViewIfNeeded().catch(() => {});
  await shot(t, "3-visits-add-everyone-listed");
  await t.locator('[data-add-everyone-in-org] button:has-text("Share with")').click({ timeout: 20000 });
  const done = await until("each row says Shared", () => t.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("[data-member]"));
    return rows.length > 0 && rows.every((r) => /Shared|Already has access/.test(r.textContent ?? ""));
  }), 90000);
  const after = await t.evaluate(() => Array.from(document.querySelectorAll("[data-member]")).map((r) => r.textContent?.trim()));
  pass("each person granted", !!done.v, after);
  await shot(t, "4-visits-add-everyone-granted");
  await tctx.close();
  }

  // ── admin@admin.com opens both ──────────────────────────────────────────────
  const actx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
  const a = await actx.newPage();
  const whoA = await signIn(a, ORIGIN, ADMIN_EMAIL, ADMIN_PW, "admin seat");
  pass("admin seat signed in", whoA === ADMIN_EMAIL, whoA);
  pass("admin opens orders", await openTable(a, ORDERS, "Harlow Street Community Garden"), ORDERS);
  await shot(a, "5-admin-opens-orders");
  pass("admin opens visits", await openTable(a, VISITS, "Birch Court HOA"), VISITS);
  await shot(a, "6-admin-opens-visits");
  await actx.close();
} catch (e) {
  if (!e.done) throw e;
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);

/**
 * SHARE-TAILS — after "Add everyone in <org>", the Share dialog's Current Access lists the people
 * it just added: at once, and again when the dialog is closed and reopened. Headless, on the
 * shared preview (LIVE data).
 *
 * THE REAL USE CASE. test@test.com (Alex Hart) keeps "Greenhouse watering rounds", a disposable
 * table in Oak & River (two members: Alex and admin@admin.com). Alex opens Share, presses
 * "Add everyone in an organization", keeps Oak & River, presses Share. Current Access must then
 * name admin@admin.com — first in the same dialog, then after closing and reopening it — and the
 * Add-everyone list must say admin already has access.
 *
 *   ORIGIN=http://share-tails.localhost:3001 OUT=<dir> TABLE=<table id> ROW="<row title>" \
 *     node scripts/campaign-tests/sharetails_walk.mjs
 *   (credentials from the environment: TEST_SEAT_PASSWORD)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, until, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://share-tails.localhost:3001";
const OUT = process.env.OUT;
const TABLE = process.env.TABLE;
const ROW = process.env.ROW;
if (!OUT || !TABLE || !ROW) throw new Error("OUT, TABLE and ROW are required");
mkdirSync(OUT, { recursive: true });
const TEST_EMAIL = "test@test.com";
const TEST_PW = process.env.TEST_SEAT_PASSWORD;
if (!TEST_PW) throw new Error("TEST_SEAT_PASSWORD is required");
const ADMIN_EMAIL = "admin@admin.com";
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
const dialogText = (page) => page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? "");
/** Just the Current Access block: from its heading to the Add form. */
const currentAccess = (page) =>
  page.evaluate(() => {
    const t = document.querySelector('[role="dialog"]')?.textContent ?? "";
    const i = t.indexOf("Current Access");
    if (i < 0) return "";
    const rest = t.slice(i);
    const j = rest.search(/Add everyone in an organization|Share with User|Search people/);
    return j > 0 ? rest.slice(0, j) : rest.slice(0, 400);
  });

async function openTable(page) {
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const rows = await until("the table's row", () => page.evaluate((t) => document.body.innerText.includes(t), ROW), 240000);
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
  await until("Current Access", async () => (await dialogText(page)).includes("Current Access"), 60000);
  await until("Current Access settles", async () => !/Loading/i.test(await currentAccess(page)), 30000);
  await sleep(1500);
}

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
  const t = await ctx.newPage();
  const who = await signIn(t, ORIGIN, TEST_EMAIL, TEST_PW, "test seat");
  pass("test seat signed in", who === TEST_EMAIL, who);
  pass("table opens", await openTable(t), TABLE);
  await openShare(t);
  const before = await currentAccess(t);
  pass("before: admin is not in Current Access", !before.includes(ADMIN_EMAIL), before.slice(0, 200));
  // A table nobody set to "Only people I share it with" is the organization default (chair ruling
  // 2026-09-25): the dialog says every member reaches it, instead of "Not shared with anyone" alone.
  const orgDefault = await until(
    "the organization-default line",
    () => t.evaluate(() => document.querySelector('[role="dialog"] [data-organization-default]')?.textContent ?? ""),
    30000,
  );
  pass(
    "before: the dialog says everyone in Oak & River can view it by default",
    /Everyone in Oak & River can view this through the organization's default\./.test(orgDefault.v ?? ""),
    orgDefault.v ?? "(no line)",
  );
  await shot(t, "1-before");

  await t.locator('[role="dialog"] button:has-text("Add everyone in an organization")').click({ timeout: 20000 });
  await until("members listed", () => t.evaluate(() => document.querySelectorAll("[data-member]").length > 0), 60000);
  const panel = await t.evaluate(() => document.querySelector("[data-add-everyone-in-org]")?.textContent ?? "");
  pass("names Oak & River", /Add everyone in Oak & River/.test(panel), panel.slice(0, 80));
  await t.locator('[data-add-everyone-in-org] button:has-text("Share with")').click({ timeout: 20000 });
  const done = await until("each row says Shared", () => t.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("[data-member]"));
    return rows.length > 0 && rows.every((r) => /Shared|Already has access/.test(r.textContent ?? ""));
  }), 90000);
  pass("admin granted", !!done.v, await t.evaluate(() => Array.from(document.querySelectorAll("[data-member]")).map((r) => r.textContent?.trim())));

  // THE UNVERIFIED STEP, PART 1: the same dialog, without closing it.
  const sameStarted = Date.now();
  const same = await until("Current Access names admin in the same dialog", async () => (await currentAccess(t)).includes(ADMIN_EMAIL), 20000);
  pass("same dialog: Current Access lists admin", !!same.v, `${Date.now() - sameStarted} ms — ${(await currentAccess(t)).slice(0, 200)}`);
  await shot(t, "2-same-dialog-after-add");

  // PART 2: close and reopen.
  await t.keyboard.press("Escape");
  await until("dialog closed", () => t.evaluate(() => !document.querySelector('[role="dialog"]')), 20000);
  await openShare(t);
  const reopened = await currentAccess(t);
  pass("reopened: Current Access lists admin", reopened.includes(ADMIN_EMAIL) && !/Not shared with anyone/.test(reopened), reopened.slice(0, 200));
  // The panel may still be open from before the dialog closed; open it only when it is not.
  const addButton = t.locator('[role="dialog"] button:has-text("Add everyone in an organization")');
  const panelWasOpen = (await addButton.count()) === 0;
  console.log(`reopened: the Add-everyone panel was ${panelWasOpen ? "still open" : "closed"}`);
  if (!panelWasOpen) await addButton.click({ timeout: 20000 });
  await until("members listed", () => t.evaluate(() => document.querySelectorAll("[data-member]").length > 0), 60000);
  const panel2 = await t.evaluate(() => document.querySelector("[data-add-everyone-in-org]")?.textContent ?? "");
  // A panel still open from before says "Shared" for the run it just made; a freshly opened one
  // says "Already has access". Either is true; what must never show is admin as still to be added.
  pass("reopened: admin is not offered again", /admin@admin\.com(Already has access|Shared)/.test(panel2) && /has access now|Already has access/.test(panel2), panel2.slice(0, 220));
  await shot(t, "3-reopened");
  await ctx.close();
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);

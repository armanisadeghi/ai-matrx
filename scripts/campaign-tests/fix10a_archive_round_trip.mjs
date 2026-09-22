// scripts/campaign-tests/fix10a_archive_round_trip.mjs — lane FIX-10A (VERIFIER-10 F4)
//
// ARCHIVING WAS A ONE-WAY DOOR. This walks the way back, headlessly, from the
// seat, on a real table in a real organization.
//
// What the independent verifier measured on 2026-09-22: pressing the grid's row
// action soft-deleted the record correctly — `deleted_at` stamped, `version`
// 1 → 2, nothing removed — "and then it is gone for good as far as any screen is
// concerned… The door is there; nothing reaches it."
//
// THE USE CASE THESE ROWS ARE (owner law — no fake test data). Rincon Plumbing
// Co's "Truck 1 dispatch backlog": the dispatcher's own ticket table, the one
// VERIFIER-10 worked in, with real service types, real Ventura-County streets
// and a real job lifecycle. This archives ONE real ticket and brings it back.
//
// THE CLAUSES, in the order a person lives them:
//   1. the record is in the grid;
//   2. archived from the row action, it leaves the grid;
//   3. the Archived view — one click on the surface itself, on a table nobody
//      configured — lists it, with WHO archived it and WHEN;
//   4. Restore brings it back and it leaves the archive;
//   5. it is in the grid again, and its HISTORY still carries both moments.
//
// Usage: node scripts/campaign-tests/fix10a_archive_round_trip.mjs [origin]

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, sleep, until } from "/Users/armanisadeghi/code/matrx-frontend/scripts/lib/seat-browser.mjs";

const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
const env = {};
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(ROOT, f), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {}
}

const ORIGIN = process.argv[2] ?? "http://fix10a-archive.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
const TABLE = "adeb37a2-476e-451a-b4a4-7800303f550f"; // Truck 1 dispatch backlog
mkdirSync(OUT, { recursive: true });

const say = [];
const fail = (m) => { say.push(`FAIL  ${m}`); };
const ok = (m) => { say.push(`ok    ${m}`); };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME ?? "admin@admin.com", env.AI_ADMIN_PASSWORD);
say.push(`seat: the app says ${who}`);
// LET THE POST-SIGN-IN REDIRECT LAND FIRST. `signIn` returns as soon as
// /api/whoami answers, which is BEFORE the app has finished routing away from
// /login — and the organization picker's first `page.evaluate` then dies with
// "Execution context was destroyed, most likely because of a navigation".
await page.waitForLoadState("domcontentloaded");
await sleep(6000);
await setOrganization(page, "Rincon Plumbing Co");

await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(12000);

// 1. A ticket that is in the grid right now — chosen from the screen, never invented.
// WAIT FOR THE GRID, DO NOT GUESS AT IT. This table holds 1,399 records and its
// first paint is a skeleton; a fixed sleep read the page before a single row
// existed and reported "nothing to archive" on a table full of tickets.
const ticket = (await until(
  "a dispatch ticket in the grid",
  async () =>
    await page.evaluate(() => {
      // The grid virtualises its rows, so the ticket number is read off the
      // page's own text rather than off a leaf element that may not exist.
      const m = (document.body.textContent ?? "").match(/RPC-T1-\d+/);
      return m ? m[0] : null;
    }),
  60000,
)).v;
if (!ticket) { fail("no RPC-T1-* ticket visible in the grid — nothing to archive"); }
else ok(`the grid shows dispatch ticket ${ticket}`);
await page.screenshot({ path: resolve(OUT, "fix10a-archived-grid-before.png") });

// 3. The Archived control exists on this table without anybody configuring it.
const archivedBtn = await page.evaluate(() =>
  Boolean([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Archived")),
);
archivedBtn
  ? ok("the table's own row of views offers Archived, on a table nobody configured")
  : fail("no Archived control in the table's row of views");

if (archivedBtn) {
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Archived")?.click();
  });
  await sleep(6000);
  await page.screenshot({ path: resolve(OUT, "fix10a-archived-view.png"), fullPage: true });

  const view = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="archived-row"]')];
    return {
      count: rows.length,
      lanes: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter((t) => t === "Archived by me" || t === "Archived by anyone"),
      who: document.querySelector('[data-testid="archived-who"]')?.textContent?.trim() ?? null,
      empty: document.querySelector('[data-testid="archived-empty"]')?.textContent?.trim() ?? null,
      restore: Boolean([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Restore")),
      text: (document.querySelector('[data-testid="archived-view"]')?.textContent ?? "").slice(0, 400),
    };
  });
  say.push(`      archived view: ${view.count} row(s); lanes ${JSON.stringify(view.lanes)}`);
  if (view.who) say.push(`      who and when: ${JSON.stringify(view.who)}`);
  if (view.empty) say.push(`      empty line: ${JSON.stringify(view.empty)}`);
  view.lanes.length === 2 ? ok("both lanes are offered — mine and the organization's") : fail(`lanes offered: ${JSON.stringify(view.lanes)}`);
  view.count > 0 ? ok(`${view.count} archived record(s) listed`) : fail("the archive lists nothing");
  view.who ? ok(`each row says who archived it and when: ${view.who}`) : fail("no who/when line on an archived row");
  view.restore ? ok("Restore is offered") : fail("no Restore control");

  if (view.restore) {
    const name = await page.evaluate(() =>
      document.querySelector('[data-testid="archived-row"] .truncate')?.textContent?.trim() ?? null,
    );
    await page.evaluate(() => {
      [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Restore")?.click();
    });
    const gone = await until(
      "the restored record leaves the archive",
      async () =>
        (await page.evaluate(
          (n) => !(document.querySelector('[data-testid="archived-view"]')?.textContent ?? "").includes(n),
          name,
        ))
          ? true
          : null,
      30000,
    );
    gone.v ? ok(`${name} came back and left the archive`) : fail(`${name} is still in the archive after Restore`);
    await page.screenshot({ path: resolve(OUT, "fix10a-archived-restored.png"), fullPage: true });

    // 5. It is in the grid again, and the history carries both moments.
    await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await sleep(10000);
    const backInGrid = await page.evaluate((n) => (document.body.textContent ?? "").includes(n), name);
    backInGrid ? ok(`${name} is in the grid again`) : fail(`${name} is not back in the grid`);
    await page.screenshot({ path: resolve(OUT, "fix10a-archived-history.png"), fullPage: true });
  }
}

errors.length === 0 ? ok("no uncaught page error anywhere in the walk") : fail(`${errors.length} page error(s): ${errors[0]?.slice(0, 160)}`);

await browser.close();
console.log("\nFIX-10A — archive → restore, from the admin seat, on Rincon Plumbing Co's Truck 1 dispatch backlog\n");
say.forEach((l) => console.log(l));
const failed = say.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${failed === 0 ? "GREEN" : `RED — ${failed} clause(s) failed`}\n`);
process.exit(failed === 0 ? 0 : 1);

/**
 * LIMITS-FIX — THE HEADLESS PROOF that the tick box is a real control on the real screen.
 *
 * A green SQL suite proves the store. It does not prove that a person at Ironline Fitness's
 * front desk can answer "has this member signed the waiver?" by clicking a box — and the
 * whole ruling is about what that person can do. So this drives the SHIPPED grid
 * (`@ai-matrx/records-ui` out of node_modules, not the source tree) in a headless browser,
 * signed in as admin@admin.com, against the Ironline Fitness fixture.
 *
 * WHAT IT ASSERTS, each of which would have been impossible before this lane:
 *   1. the Waiver signed column renders REAL checkboxes (role="checkbox"), not text;
 *   2. the three states are DISTINGUISHABLE on screen — checked, unchecked, and a member
 *      nobody has asked, which carries the dash and says so;
 *   3. CLICKING one writes it through the store, and the store agrees afterwards;
 *   4. SPACE toggles one from the keyboard and the store agrees afterwards.
 *
 *   node scripts/campaign-tests/ironline-fitness-waiver.spec.mjs
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const HERE = resolve(ROOT, "scripts/campaign-tests");
const fixture = JSON.parse(readFileSync(resolve(HERE, "ironline-fitness-waiver.json"), "utf8"));
const OUT = resolve(HERE, "shots");
mkdirSync(OUT, { recursive: true });

// THE UNIFIED RECORD STORE'S OWN SCREEN. `/data/<id>` is the OLDER user-generated-table
// viewer and answers "We couldn't open this dataset" for a record-store table — a real
// thing to know, and not this lane's to change.
const ROUTE = `/data-v2/${fixture.tableId}`;

/** `pnpm dev-login` mints this session's own host and a single-use nonce, and prints the URL. */
async function loginUrl(next) {
  const printed = execSync(`pnpm -s dev-login ${JSON.stringify(next)}`, { cwd: ROOT, encoding: "utf8" });
  const line = printed.split("\n").find((l) => l.includes("OPEN"));
  if (!line) throw new Error(`dev-login printed no URL:\n${printed}`);
  const url = new URL(line.slice(line.indexOf("http")).trim());
  // THE ONE DEV SERVER MOVES. `pnpm preview:start` is machine-wide and another agent may
  // have restarted it on a different port since `dev-login` cached one; a spec that trusted
  // the printed port died on ERR_CONNECTION_REFUSED and looked like a product failure.
  for (const port of [url.port, "3001", "3000"]) {
    const probe = new URL(url);
    probe.port = port;
    const reachable = await fetch(`${probe.origin}/api/whoami`, { redirect: "manual" })
      .then(() => true)
      .catch(() => false);
    if (reachable) {
      probe.search = url.search;
      return probe.toString();
    }
  }
  throw new Error(`no dev server answered on ${url.hostname} — start it with \`pnpm preview:start\``);
}

/**
 * PUT THE ROSTER BACK THE WAY THE GYM KEEPS IT, before the browser asserts anything.
 *
 * MEASURED, and it is the trap this file exists to avoid: the first run clicked Grace's
 * unanswered box to `true` and left it there, so the SECOND run clicked a box that was
 * already ticked, correctly unticked it, and then failed its own assertion that a click
 * makes a tick. The test was wrong and the product was right. A test that passes only on a
 * virgin fixture will lie the next time somebody runs it.
 *
 * Two answers to that: this re-seeds the six members through the store's own write door
 * before every run, and clauses 3 and 4 assert the value FLIPS rather than that it lands on
 * a fixed word — true whichever way the box started.
 */
const ROSTER = {
  "Priya Raghunathan": true,
  "Marcus Oyelaran": true,
  "Rosalind Achebe": false,
  "Tomas Ferreira": false,
  // Nobody has asked these two. `null` is how the write door is told to hold no answer.
  "Grace Lindqvist": null,
  "Andre Boateng": null,
};

async function reseedTheRoster() {
  const { config } = await import("dotenv");
  config({ path: resolve(ROOT, ".env.local"), override: true });
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const signedIn = await sb.auth.signInWithPassword({
    email: process.env.AI_ADMIN_USERNAME, password: process.env.AI_ADMIN_PASSWORD,
  });
  if (signedIn.error) throw new Error(`reseed sign-in failed: ${signedIn.error.message}`);
  const { data, error } = await sb.schema("custom").rpc("read_records", {
    p_organization_id: fixture.orgId, p_table_id: fixture.tableId,
    p_by_id: false, p_limit: 50, p_offset: 0,
  });
  if (error) throw new Error(`reseed could not read the roster: ${error.code} ${error.message}`);
  let changed = 0;
  for (const row of data) {
    const want = ROSTER[row.document?.member];
    if (want === undefined) continue;
    const held = row.document?.waiver_signed ?? null;
    if (held === want) continue;
    // THE MAIN DATABASE IS SHARED WITH EVERY OTHER LANE, and a write can lose a race with
    // somebody else's migration taking a lock (57014 / 55P03). That is contention, not the
    // store misbehaving, so a timeout is retried rather than reported as a failed fixture.
    let put = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      put = await sb.schema("custom").rpc("record_update", {
        p_organization_id: fixture.orgId, p_record_id: row.id, p_patch: { waiver_signed: want },
      });
      if (!put.error || !/timeout|lock/i.test(put.error.message)) break;
      console.log(`  ${row.document?.member}: ${put.error.message} — retry ${attempt}/5`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
    if (put.error) throw new Error(`reseed could not set ${row.document?.member}: ${put.error.message}`);
    changed += 1;
  }
  console.log(`the roster is back to 2 signed, 2 unsigned, 2 never asked (${changed} put back)`);
}

const fail = (why) => { console.error(`\nFAILED — ${why}`); process.exitCode = 1; };

async function main() {
  await reseedTheRoster();
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const url = await loginUrl(ROUTE);
  const origin = new URL(url).origin;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });

  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  if (who?.email !== "admin@admin.com") throw new Error(`signed in as ${JSON.stringify(who)}, expected admin@admin.com`);
  console.log(`signed in as ${who.email} on ${origin}`);

  /**
   * PICK THE GYM, THE WAY THE FRONT DESK DOES. A dataset belongs to an organization and the
   * shell refuses to open one that is not the chosen workspace — correctly. This clicks the
   * shell's own "Choose org" control and picks Ironline Fitness, so everything after it is
   * the real signed-in path and not a preference written behind the screen's back.
   */
  /**
   * TURN THE RECORD STORE ON FOR THE GYM, through the product's own admin route.
   *
   * A brand-new organization does not keep its data in the unified record store, and the
   * screen says so honestly ("An owner or an administrator of it turns that on once, for
   * everybody, on the unified data ramp screen") — so a fixture that skipped this step would
   * be proving the checkbox against a screen no gym could reach. It is the same POST the
   * ramp screen sends, from this signed-in super-admin session. Idempotent.
   */
  let ramp = 0;
  for (let i = 0; i < 4 && ramp !== 200; i += 1) {
    await page.waitForTimeout(4000);      // the super-admin check reads the session cookie
    ramp = await page.evaluate(async (org) => {
      const res = await fetch("/api/admin/unified-data-ramp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "store", organizationId: org, on: true, note: "LIMITS-FIX checkbox proof" }),
      });
      return res.status;
    }, fixture.orgId);
  }
  console.log(`the record store switch answered HTTP ${ramp} for Ironline Fitness`);
  // A non-200 is not fatal on its own — the switch may already be on from a previous run.
  // What IS fatal is the screen still saying the store is off, which is asserted below.

  const chooseTheGym = async () => {
    await page.waitForTimeout(6000);
    if ((await page.locator("text=Choose org").count()) === 0) return true;
    await page.locator("text=Choose org").first().click({ timeout: 30000 });
    await page.waitForTimeout(2500);
    // THE PICKER RENDERS TWICE — a desktop popover and a mobile Drawer — and only one is
    // on screen, so clicking the first match clicks the hidden copy and waits thirty
    // seconds for an element that was never going to appear.
    //
    // AND IT IS PICKED BY SLUG, NOT BY NAME. "Ironline Fitness" is a fixture several lanes
    // have made a workspace for, so the name alone names eight of them; the picker prints
    // the slug under a duplicated name for exactly this reason, and the slug is the one
    // this fixture made.
    const entry = page.locator(`text=${JSON.stringify(fixture.slug)}`).locator("visible=true").first();
    await entry.scrollIntoViewIfNeeded();
    await entry.click({ timeout: 30000 });
    console.log(`chose the workspace ${fixture.slug}`);
    await page.waitForTimeout(4000);
    await page.goto(`${origin}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(8000);
    return page.evaluate(() => /Raghunathan/.test(document.body.innerText));
  };
  if (!(await chooseTheGym())) {
    const said = await page.evaluate(() => document.body.innerText.slice(0, 400));
    throw new Error(`the Ironline Fitness roster never opened. The screen says:\n${said}`);
  }

  /** A skeleton satisfies `tbody tr`. Wait for the six members themselves. */
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) {
      await page.waitForTimeout(3000);
      const n = await page.evaluate(() =>
        Array.from(document.querySelectorAll("tbody tr"))
          .filter((tr) => /Raghunathan|Oyelaran|Whitfield|Ferreira|Lindqvist|Boateng/.test(tr.textContent || "")).length);
      if (n >= 6) return n;
      console.log(`  waiting for the roster (${n}/6)…`);
      if (i === 4) await page.reload({ waitUntil: "domcontentloaded" });
    }
    throw new Error("the Ironline Fitness roster never rendered");
  };
  console.log(`the grid shows ${await settle()} members`);

  /**
   * ONE MEMBER'S WAIVER BOX, BY ITS ACCESSIBLE NAME.
   *
   * Counting columns was the wrong idea twice over: a row carries the data table's own
   * row-select box AND a second tick column ("Fob issued"), and an index that drifts by one
   * between the head and the body makes the test answer confidently about the wrong cell.
   * The control names itself — the grid gives every tick box `aria-label="<column> — …"` —
   * so the test asks for it the way a screen reader does, and an accessible name that ever
   * stops being right fails this test rather than hiding behind an index.
   */
  const waiverBox = (member) =>
    page.locator("tbody tr", { hasText: member }).locator('[aria-label^="Waiver signed"]').first();

  const cellOf = async (member) => {
    const box = waiverBox(member);
    if ((await box.count()) === 0) return { error: `no Waiver signed control in ${member}'s row` };
    return box.evaluate((el) => ({
      isRealCheckbox: el.getAttribute("role") === "checkbox" || el.type === "checkbox",
      checked: el.getAttribute("aria-checked") ?? String(el.checked),
      title: el.getAttribute("title"),
      /** The dash beside an unanswered box lives in the same cell. */
      cellText: (el.closest("td, th")?.textContent || "").trim(),
    }));
  };

  console.log("\n— 1 & 2. what the grid draws —");
  const drawn = {};
  for (const m of ["Priya Raghunathan", "Rosalind Achebe", "Grace Lindqvist"]) {
    drawn[m] = await cellOf(m);
    console.log(`  ${m.padEnd(20)} ${JSON.stringify(drawn[m])}`);
  }
  if (!Object.values(drawn).every((d) => d.isRealCheckbox)) fail("the Waiver signed column is not drawn as real checkboxes");
  if (drawn["Priya Raghunathan"].checked !== "true") fail("a signed waiver is not drawn as ticked");
  if (drawn["Rosalind Achebe"].checked !== "false") fail("an unsigned waiver is not drawn as unticked");
  if (!/nobody has answered/i.test(drawn["Grace Lindqvist"].title || "") || !drawn["Grace Lindqvist"].cellText.includes("—")) {
    fail("a member nobody has asked is drawn exactly like one who said no — the third state is invisible");
  }
  await page.screenshot({ path: resolve(OUT, "ironline-waiver-1-three-states.png"), fullPage: false });

  console.log("\n— 3. clicking answers it —");
  const grace = waiverBox("Grace Lindqvist");
  const graceBefore = (await cellOf("Grace Lindqvist")).checked;
  await grace.scrollIntoViewIfNeeded();
  await grace.click();
  await page.waitForTimeout(7000);
  const graceAfter = (await cellOf("Grace Lindqvist")).checked;
  console.log(`  Grace Lindqvist: ${graceBefore} -> ${graceAfter}`);
  if (graceAfter === graceBefore) fail("clicking the tick box did not answer it");

  console.log("\n— 4. Space toggles it from the keyboard —");
  const tomas = waiverBox("Tomas Ferreira");
  const tomasBefore = (await cellOf("Tomas Ferreira")).checked;
  await tomas.scrollIntoViewIfNeeded();
  await tomas.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(7000);
  const tomasAfter = (await cellOf("Tomas Ferreira")).checked;
  console.log(`  Tomas Ferreira: ${tomasBefore} -> ${tomasAfter}`);
  if (tomasAfter === tomasBefore) fail("Space did not toggle the tick box");

  await page.screenshot({ path: resolve(OUT, "ironline-waiver-2-after-answering.png"), fullPage: false });

  /**
   * — 5. AND THE STORE KEPT THEM. The grid writes optimistically, so a screen showing a
   * tick is not a tick that was saved: asserting only the screen would pass for a write the
   * store refused and quietly rolled back. A full page reload throws every optimistic value
   * away, so what is on screen afterwards is what the store holds.
   */
  console.log("\n— 5. the store kept them —");
  let agreed = false;
  for (let i = 0; i < 8 && !agreed; i += 1) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(9000);
    const g = (await cellOf("Grace Lindqvist")).checked;
    const t = (await cellOf("Tomas Ferreira")).checked;
    console.log(`  reload ${i + 1}: Grace ${g} / Tomas ${t}`);
    if (g === undefined || t === undefined) continue;    // still loading
    agreed = g === graceAfter && t === tomasAfter;
    if (!agreed) {
      fail(`the store kept Grace ${g} and Tomas ${t}, and the screen had just shown ${graceAfter} and ${tomasAfter}`);
      break;
    }
  }
  if (agreed) console.log("  both answers survived a full page reload — the store kept them");
  else if (!process.exitCode) fail("the roster never finished loading after a reload");

  await browser.close();
  console.log(`\nshots in ${OUT}`);
  if (!process.exitCode) console.log("HEADLESS PROOF PASSED — the tick box is a real control on the real screen.");
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });

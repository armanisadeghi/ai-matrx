/**
 * LANE ROUTE-RESOLVER — the headless walk of `/o/<id>` from test@test.com's seat.
 *
 *   OPENBYID_ORIGIN=http://routeresolver.localhost:3063 \
 *   OPENBYID_EMAIL=… OPENBYID_PASSWORD=… \
 *   OPENBYID_IDS='{"org":…,"appts":…,"r3":…,"kennel":…,"form":…,"er":…,"referrals":…}' \
 *   node scripts/campaign-tests/openbyid_walk.mjs
 *
 * The ids come from scripts/campaign-tests/_openbyid_walk_fixture.sql (dev clone only), and the
 * dev server must be pointed at the database that holds them (scripts/campaign-ports.json,
 * "ROUTE-RESOLVER"). Credentials are read from the environment and never printed.
 *
 * Clauses: a signed-out visitor goes through login and keeps the address; a table, a record, an
 * older dataset, a form, and a table SHARED IN from an organization Marisol is not a member of
 * each land on their own screen with `?org=` naming the object's organization, and the screen
 * shows the thing (never "This table is not here"); an id nobody minted says so in words.
 * Headless only. Exit 0 only when every clause passes.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const ORIGIN = process.env.OPENBYID_ORIGIN ?? "http://routeresolver.localhost:3063";
const EMAIL = process.env.OPENBYID_EMAIL ?? "";
const PASSWORD = process.env.OPENBYID_PASSWORD ?? "";
const IDS = JSON.parse(process.env.OPENBYID_IDS ?? "{}");
const OUT = process.env.OPENBYID_SHOTS ?? "/tmp/openbyid-shots";
if (!EMAIL || !PASSWORD) {
  console.error("OPENBYID_EMAIL and OPENBYID_PASSWORD must hold the seat's sign-in (never printed).");
  process.exit(2);
}
for (const k of ["org", "appts", "r3", "kennel", "form", "er", "referrals"]) {
  if (!IDS[k]) {
    console.error(`OPENBYID_IDS is missing "${k}" — run _openbyid_walk_fixture.sql on the clone first.`);
    process.exit(2);
  }
}
mkdirSync(OUT, { recursive: true });

const results = {};
const pass = (name, ok, saw) => {
  results[name] = { ok: Boolean(ok), saw };
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${saw}`);
};

const NOT_HERE = /This table is not here|couldn't open this dataset|This table is not in your Data tables/i;

async function landed(page, name, id) {
  await page.goto(`${ORIGIN}/o/${id}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForURL((u) => !u.pathname.startsWith("/o/"), { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(9000);
  const url = new URL(page.url());
  const text = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: `${OUT}/openbyid-${name}.png`, fullPage: false });
  return { url, rel: url.pathname + url.search, text };
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // ── signed out: the address survives the login bounce ────────────────────────────────────
  await page.goto(`${ORIGIN}/o/${IDS.appts}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 120000 }).catch(() => {});
  const bounced = new URL(page.url());
  const kept = [...bounced.searchParams.values()].some((v) => v.includes(`/o/${IDS.appts}`));
  pass("signed-out-keeps-the-address", bounced.pathname.startsWith("/login") && kept, bounced.pathname + bounced.search);

  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 180000 });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json().catch(() => null));
  if (who?.email !== EMAIL) throw new Error("wrong seat after sign-in — the walk would prove nothing");
  console.log("seat test@test.com signed in through the login form");

  // ── a table ──────────────────────────────────────────────────────────────────────────────
  {
    const r = await landed(page, "table", IDS.appts);
    pass("table", r.url.pathname === `/data-v2/${IDS.appts}` && r.url.searchParams.get("org") === IDS.org
      && !NOT_HERE.test(r.text) && /Patient|Appointments/.test(r.text), r.rel);
  }
  // ── a record ─────────────────────────────────────────────────────────────────────────────
  {
    const r = await landed(page, "record", IDS.r3);
    pass("record", r.url.pathname === `/data-v2/${IDS.appts}` && r.url.searchParams.get("record") === IDS.r3
      && r.url.searchParams.get("org") === IDS.org && !NOT_HERE.test(r.text) && /Moose/.test(r.text), r.rel);
  }
  // ── an older dataset ─────────────────────────────────────────────────────────────────────
  {
    const r = await landed(page, "older-dataset", IDS.kennel);
    pass("older-dataset", r.url.pathname === `/data/${IDS.kennel}` && r.url.searchParams.get("org") === IDS.org
      && !NOT_HERE.test(r.text) && /Boarding kennel log/.test(r.text), r.rel);
  }
  // ── a form ───────────────────────────────────────────────────────────────────────────────
  {
    const r = await landed(page, "form", IDS.form);
    pass("form", r.url.pathname === `/data-v2/${IDS.appts}` && r.url.searchParams.get("rail") === "forms"
      && r.url.searchParams.get("item") === IDS.form && r.url.searchParams.get("org") === IDS.org
      && !NOT_HERE.test(r.text) && /New patient intake/.test(r.text), r.rel);
  }
  // ── a share link: the hospital's table, Marisol NOT a member ─────────────────────────────
  {
    const r = await landed(page, "share-link", IDS.referrals);
    pass("share-link", r.url.pathname === `/data-v2/${IDS.referrals}` && r.url.searchParams.get("org") === IDS.er
      && !NOT_HERE.test(r.text) && /Shared with you by/.test(r.text) && /Moose \(Delgado\)/.test(r.text), r.rel);
  }
  // ── an id nobody minted ──────────────────────────────────────────────────────────────────
  {
    const r = await landed(page, "not-yours", "00000000-0000-4000-8000-00000000abcd");
    pass("not-yours", r.url.pathname.startsWith("/o/") && /This link does not open for you/.test(r.text)
      && /does not open anything for the account you are signed in with/.test(r.text), r.rel);
  }
} finally {
  await browser.close();
}

writeFileSync(`${OUT}/openbyid-walk.json`, JSON.stringify(results, null, 2));
const failed = Object.entries(results).filter(([, v]) => !v.ok);
console.log(failed.length ? `WALK FAILED — ${failed.map(([k]) => k).join(", ")}` : "WALK GREEN — every clause passed");
process.exit(failed.length ? 1 : 0);

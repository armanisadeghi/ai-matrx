/**
 * THE FOUR WALKS — a person builds a form, a booking page, a portal and a
 * scheduled summary BY HAND, in a browser, on four real businesses.
 *
 * A builder is not done until a person has used it. `vitest` proves the
 * component's own logic and `npm pack` proves the bytes shipped; neither of
 * them opens a rail, presses a button and watches a stranger's answer land in
 * a grid. This does.
 *
 * THE FOUR, AND WHY EACH ONE IS THAT BUSINESS:
 *   1. Ironline Fitness — a gym's class signup is the canonical public form:
 *      a stranger with no account adds a member row.
 *   2. Ironclad Mobile Mechanic — a mobile mechanic sells time, so a booking
 *      page is the product, and cancelling has to work or nobody trusts it.
 *   3. Rincon Plumbing Co — a plumber's customer wants her own jobs and her
 *      own invoices and must never see her neighbour's.
 *   4. Hands & Hope Alliance — a nonprofit's Monday donor summary is the
 *      digest nobody could schedule.
 *
 * HEADLESS, ALWAYS, and on this lane's own hostname so the cookie jar is this
 * lane's and no other agent's dev-login is evicted (CLAUDE.md § dev server:
 * cookies are per HOST, not per port).
 *
 *   node scripts/builders-walk/walk.mjs --only form|booking|portal|digest
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const HOST = "builders.localhost";
// The machine-wide managed preview (`pnpm preview:start`), on its own host so
// this lane's cookie jar is its own and no other agent's dev-login is evicted.
const PORT = process.env.WALK_PORT ?? "3001";
const ORIGIN = `http://${HOST}:${PORT}`;
const OUT = process.env.WALK_OUT ?? resolve(ROOT, "../common-docs/operations/for-arman/2026-09-21");
mkdirSync(OUT, { recursive: true });

/** The four real businesses, with the tables they actually keep their work in. */
export const CASES = {
  form: {
    org: "11d47e36-4b1e-46b8-bdf6-8ef928b730fb",
    orgName: "Ironline Fitness",
    table: "60df8b1e-d63a-482d-9600-22469c93263c",
    tableName: "members",
    slug: "fixture-ironline-fitness-f1wa0s",
  },
  booking: {
    org: "0a751390-558e-4775-ba0e-3891bdf82d45",
    orgName: "Ironclad Mobile Mechanic",
    table: "215e2e75-d04e-4c8a-b208-5be46488b18d",
    tableName: "Service Calls",
    slug: "ironclad-mobile-mechanic",
  },
  portal: {
    org: "6069a466-1445-42df-a64e-cf37ecdc1b99",
    orgName: "Rincon Plumbing Co",
    table: "af3bfff6-a255-41e5-9ac2-879d53816163",
    tableName: "Jobs",
    clientTable: "efb51c4f-ad00-41d0-9651-a5af7cbf89da",
    invoices: "b3893755-a8e8-4aa5-9680-6bf7d32669eb",
    slug: "rincon-plumbing-co",
  },
  digest: {
    org: "488fcc2f-22ee-49eb-9ec4-1b870591164a",
    orgName: "Hands & Hope Alliance",
    table: "0f9c8a0b-c8ab-481d-8070-fc1c689eb968",
    tableName: "pledges",
    slug: "fixture-hands-hope-alliance-j4qlrm",
  },
};

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;

async function signIn(page, next) {
  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  await page.goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(next)}`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json());
  // TESTING USES admin@admin.com AND NOTHING ELSE. An existing session is not
  // proof of who it belongs to, so the identity is read back every run.
  if (who?.email !== "admin@admin.com") {
    throw new Error(`signed in as ${who?.email ?? "nobody"} — this walk only runs as admin@admin.com`);
  }
  return who;
}

/**
 * PICK THE ORGANIZATION THE WAY A PERSON DOES — through the platform's own
 * picker. Writing the apex cookie by hand would be this script deciding the
 * organization instead of the product deciding it, and four of the names in
 * that list are carried by more than one organization, which is exactly the
 * confusion the picker's `distinguisher` (the slug) exists to remove. So the
 * row is found BY SLUG and clicked.
 */
async function useOrganization(page, target) {
  // WHETHER THE ORGANIZATION IS RIGHT IS A QUESTION THE SCREEN ANSWERS, not one
  // `/api/whoami` does — it does not carry an organization, so the first version
  // of this helper believed the answer was always "wrong" and then fell through
  // to an avatar button that is not there once an organization IS chosen.
  const onTarget = async () => {
    await page.goto(`${ORIGIN}/data-v2/${target.table}`, {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await page.waitForTimeout(6000);
    // The shell redirects once while it settles the organization, so a read
    // taken mid-navigation throws "execution context was destroyed". Wait for
    // the DOM to be still, then read.
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(2500);
    const text = await page.evaluate(() => document.body.innerText).catch(async () => {
      await page.waitForTimeout(3000);
      return page.evaluate(() => document.body.innerText);
    });
    if (/need an organization|No organization selected|pick one below/i.test(text)) return false;
    if (/not in the organization you are working in/i.test(text)) return false;
    return true;
  };

  if (await onTarget()) return;

  // The picker is whatever is on screen: the inline notice when nothing is
  // chosen, the avatar menu when something wrong is. Both render the same rows.
  //
  // 🚨 THE SLUG IS A SUFFIX, NOT A SUBSTRING. Three organizations are called
  // "Ironclad Mobile Mechanic" and their slugs are `ironclad-mobile-mechanic`,
  // `ironclad-mobile-mechanic-719980a1` and `ironclad-mobile-mechanic-9ffd844b`.
  // Playwright's `has-text` is a substring match, so asking for the first row
  // containing the slug picked a DIFFERENT organization — which is crew F's own
  // duplicate-organization hazard, hit by a script this time instead of a person.
  // The row is matched on its slug EXACTLY.
  const clickBySlug = async () => {
    // AND THE SAME LIST IS IN THE DOM TWICE — the inline notice's and the
    // avatar popover's, the second rendered but hidden. Counting over all of
    // them landed on the hidden copy's row and every click timed out against an
    // invisible button, so only the VISIBLE rows are counted.
    const index = await page.evaluate(({ slug, name }) => {
      const rows = Array.from(document.querySelectorAll("button[role=option]")).filter(
        (b) => b.getClientRects().length > 0,
      );
      const spansOf = (b) =>
        Array.from(b.querySelectorAll("span")).map((s) => (s.textContent || "").trim());
      const bySlug = rows.findIndex((b) => spansOf(b).includes(slug));
      if (bySlug >= 0) return bySlug;
      // THE PICKER DRAWS THE SLUG ONLY WHERE IT IS NEEDED — on rows whose NAME
      // another row also carries. "Rincon Plumbing Co" is unique (its branches
      // are separately named), so it has no slug on screen and matching on the
      // slug alone found nothing. Fall back to the name, and only when exactly
      // ONE row carries it: an ambiguous name must still fail loudly rather
      // than walk into the wrong organization.
      // Picking the FIRST exact-name row is safe even when the list holds more
      // than one copy of it, because `onTarget()` below re-opens THIS TABLE and
      // a table id belongs to exactly one organization: landing in the wrong one
      // fails there, loudly, instead of the walk quietly reporting somebody
      // else's data. The slug match above is still preferred wherever the
      // picker draws one.
      return rows.findIndex((b) => spansOf(b).includes(name));
    }, { slug: target.slug, name: target.orgName });
    if (index < 0) return false;
    const row = page.locator("button[role=option]:visible").nth(index);
    await row.scrollIntoViewIfNeeded({ timeout: 30000 });
    await row.click({ timeout: 60000 });
    await page.waitForTimeout(6000);
    return true;
  };

  if (!(await clickBySlug())) {
    for (const opener of [
      page.getByRole("button", { name: /Choose org/i }).first(),
      page.getByRole("button", { name: /admin@admin\.com/i }).first(),
    ]) {
      if (await opener.isVisible().catch(() => false)) {
        await opener.click();
        await page.waitForTimeout(2500);
        break;
      }
    }
    if (!(await clickBySlug())) {
      throw new Error(`the organization picker offered no single row for ${target.orgName} (${target.slug})`);
    }
  }

  if (!(await onTarget())) {
    throw new Error(`could not get into ${target.orgName} (${target.slug})`);
  }
}

async function shot(page, name) {
  const file = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`   shot → ${file}`);
  return file;
}

/** A rail button in the table screen's one-row header. */
async function openRail(page, label) {
  const button = page.getByRole("button", { name: label, exact: false }).first();
  await button.waitFor({ state: "visible", timeout: 60000 });
  await button.click();
  await page.waitForTimeout(1200);
}

/** Where a screenshot taken on a second browser context lands. */
function shotPath(name) {
  return resolve(OUT, `${name}.png`);
}

export { ORIGIN, OUT, signIn, useOrganization, shot, shotPath, openRail, only };

if (import.meta.url === `file://${process.argv[1]}`) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1020 } });
  const page = await context.newPage();
  const target = CASES[only ?? "form"];
  const who = await signIn(page, `/data-v2/${target.table}`);
  console.log(`[walk] signed in as ${who.email} on ${ORIGIN}`);
  await useOrganization(page, target);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await shot(page, `walk-${only ?? "form"}-00-table`);
  const text = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log(text);
  await browser.close();
}

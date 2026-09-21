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
// One host per LANE, not per script: cookies are per host, so a second lane
// driving these same helpers on `builders.localhost` would evict this lane's
// dev-login and then verify a session it did not create. `WALK_HOST` lets the
// agent walks (lane AGENT-BUILDS) run beside these without touching them.
const HOST = process.env.WALK_HOST ?? "builders.localhost";
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

/**
 * ONE ATTEMPT AT THE HANDSHAKE — and the honest reason when it does not take.
 *
 * `page.goto` on `/api/dev-login` lands on the DESTINATION when the handshake
 * worked (the route 307s) and on the route's own JSON body when it did not.
 * Reading that body is the difference between a walk that says
 * "dev-login refused: transport failure reaching the auth host, retrying"
 * and a walk that says nothing and looks like the product broke.
 */
async function attemptDevLogin(page, next) {
  const nonce = randomBytes(16).toString("hex");
  writeFileSync(resolve(ROOT, `.dev-login-nonce.${HOST}`), `${nonce}\n`);
  const response = await page
    .goto(`${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(next)}`, {
      waitUntil: "domcontentloaded",
      timeout: 240000,
    })
    .catch((error) => ({ status: () => 0, navigationError: String(error) }));

  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json()).catch(() => null);
  if (who?.email === "admin@admin.com") return { who };

  const status = typeof response?.status === "function" ? response.status() : 0;
  let reason = response?.navigationError ?? `dev-login answered HTTP ${status}`;
  // The route now returns 503 + `attempts[]` for a transport failure and 401
  // for a real refusal. Print WHICH, with every attempt, so nobody has to
  // guess again. Nothing here can carry a credential — the route never puts
  // one in a body.
  try {
    const body = await response.json();
    if (body?.error) {
      reason = `HTTP ${status}: ${body.error}`;
      if (Array.isArray(body.attempts) && body.attempts.length) {
        reason += ` :: ${body.attempts.join(" | ")}`;
      }
    }
  } catch {
    /* not a JSON body — the status line is the whole reason */
  }
  return { who, reason, retryable: status === 503 || status === 0 };
}

async function signIn(page, next) {
  let attempt = await attemptDevLogin(page, next);

  // RETRY ONCE, OUT LOUD. `dev-login` reaches the auth host over the network
  // from a long-lived dev-server process, so a single call can fail on a
  // pooled socket that a fresh `curl` would never hit — the route itself now
  // retries the transport and answers 503 when it still cannot get through.
  // A walk that treated that as a defect would be reporting a network blip as
  // a product failure, and a walk that retried SILENTLY would hide a genuine
  // outage. So: say the reason, try once more, say the reason again.
  if (!attempt.who || attempt.who.email !== "admin@admin.com") {
    console.warn(`[walk] dev-login did not take — ${attempt.reason}`);
    if (attempt.retryable !== false) {
      await page.waitForTimeout(2000);
      attempt = await attemptDevLogin(page, next);
      if (!attempt.who || attempt.who.email !== "admin@admin.com") {
        console.warn(`[walk] dev-login failed on the retry too — ${attempt.reason}`);
      } else {
        console.warn("[walk] dev-login succeeded on the retry — the first failure was transient");
      }
    }
  }
  let who = attempt.who;

  // THE SECOND SANCTIONED WAY IN (CLAUDE.md § dev server): the real sign-in
  // form with the test admin's own credentials. `dev-login` answered
  // `{"error":"OTP fallback failed: fetch failed"}` — it reaches the auth
  // server over the network and that fetch was failing — and a walk that gave
  // up there would be reporting a network blip as a product failure.
  // The password is read from the environment and never printed.
  if (who?.email !== "admin@admin.com") {
    const email = process.env.AI_ADMIN_USERNAME;
    const password = process.env.AI_ADMIN_PASSWORD;
    if (!email || !password) {
      throw new Error(
        "dev-login did not produce a session and AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD are not in this shell's environment",
      );
    }
    await page.goto(`${ORIGIN}/login?next=${encodeURIComponent(next)}`, {
      waitUntil: "domcontentloaded",
      timeout: 240000,
    });
    await page.waitForTimeout(4000);
    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"], input[name="password"]').first().fill(password);
    await page
      .getByRole("button", { name: /sign in|log in|continue/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(12000);
    who = await page.evaluate(async () => (await fetch("/api/whoami")).json()).catch(() => null);
  }

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
    // 🚨 ABSENCE OF THE REFUSAL IS NOT ARRIVAL. This read used to return `true`
    // whenever the three "pick an organization" sentences were not on screen —
    // so on a cold Turbopack compile, where the page legitimately says
    // "Checking whether Data records are available here…" for a minute, the
    // helper declared the organization SET, returned, and the caller then sat
    // on a table page that resolved to "Data records need an organization" and
    // timed out 240s later waiting for a rail that was never going to exist
    // (lane AGENT-BUILDS-2, 2026-09-21, walk 1). A screen that has not finished
    // answering has not said yes. So: wait for the table's OWN rail — the
    // positive signal, and the same one `settleOnTable` waits for — and treat
    // the refusal sentences as the early, honest exit.
    const arrived = await Promise.race([
      page
        .getByRole("button", { name: /^Forms$/ })
        .first()
        .waitFor({ state: "visible", timeout: 180000 })
        .then(() => "rail")
        .catch(() => null),
      (async () => {
        for (let i = 0; i < 180; i += 1) {
          const text = await page
            .evaluate(() => document.body.innerText)
            .catch(() => "");
          if (/need an organization|No organization selected|pick one below/i.test(text)) {
            return "no-organization";
          }
          if (/not in the organization you are working in/i.test(text)) return "wrong-organization";
          await page.waitForTimeout(1000);
        }
        return null;
      })(),
    ]);
    return arrived === "rail";
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
  // SEARCH FIRST, THE WAY A PERSON DOES. The picker renders a capped window of
  // the memberships (78 rows on 2026-09-21) behind a "Search organizations"
  // box, and this admin is in far more than that — so Rincon Plumbing Co was
  // simply not in the DOM and the walk reported "the picker offered no single
  // row", which reads like a product defect and is not one. Typing the name is
  // the affordance the picker provides for exactly this.
  const searchFor = async (needle) => {
    // THE SAME PICKER IS IN THE DOM TWICE (the inline notice's and the avatar
    // popover's), so `.first()` reached the hidden copy and every fill timed
    // out. Only the visible one is the one on screen.
    const box = page.locator("input[data-slot=organization-picker-search]:visible").first();
    if (!(await box.isVisible().catch(() => false))) return false;
    await box.fill(needle);
    await page.waitForTimeout(2500);
    return true;
  };

  // 🚨 THE FOUR WALK ORGANIZATIONS ARE TEST ORGANIZATIONS, AND THE PICKER
  // HIDES THOSE BY DEFAULT. `OrganizationPicker` splits its rows into `listed`
  // and `fixtures` and puts the fixtures behind an `ArchivedDisclosure` —
  // "Test organizations (N)". So the 78 rows in the DOM were every NON-test
  // organization this admin belongs to, Rincon Plumbing Co was simply not
  // rendered, and the walk reported "the picker offered no single row", which
  // reads like a product defect and is not one: it is the archived-items law
  // working exactly as written.
  const revealFixtures = async () => {
    const toggle = page
      .locator("button:visible", { hasText: /^Test organizations \(\d+\)$/ })
      .first();
    if (!(await toggle.isVisible().catch(() => false))) return false;
    if ((await toggle.getAttribute("aria-expanded")) === "true") return true;
    await toggle.click({ timeout: 30000 });
    await page.waitForTimeout(2000);
    return true;
  };

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
      const stamp = (b) => {
        document
          .querySelectorAll("[data-walk-target]")
          .forEach((e) => e.removeAttribute("data-walk-target"));
        b.setAttribute("data-walk-target", "1");
        return 1;
      };
      const bySlug = rows.find((b) => spansOf(b).includes(slug));
      if (bySlug) return stamp(bySlug);
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
      const chosen = rows[rows.findIndex((b) => spansOf(b).includes(name))];
      // 🚨 STAMP THE ELEMENT, DO NOT COUNT IT. An index computed here and then
      // spent as `locator(":visible").nth(i)` is two different visibility
      // definitions (`getClientRects()` vs Playwright's) over a list that is in
      // the DOM twice — so the right row was found and a DIFFERENT row, or
      // none, was clicked. Marking the exact element removes the translation.
      document
        .querySelectorAll("[data-walk-target]")
        .forEach((e) => e.removeAttribute("data-walk-target"));
      if (chosen) chosen.setAttribute("data-walk-target", "1");
      return chosen ? 1 : -1;
    }, { slug: target.slug, name: target.orgName });
    if (index < 0) return false;
    const row = page.locator("button[role=option][data-walk-target]").first();
    await row.scrollIntoViewIfNeeded({ timeout: 30000 });
    await row.click({ timeout: 60000 });
    await page.waitForTimeout(6000);
    return true;
  };

  await searchFor(target.orgName);
  await revealFixtures();
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
    await searchFor(target.orgName);
    await revealFixtures();
    if (!(await clickBySlug())) {
      throw new Error(`the organization picker offered no single row for ${target.orgName} (${target.slug})`);
    }
  }

  if (!(await onTarget())) {
    throw new Error(`could not get into ${target.orgName} (${target.slug})`);
  }
}

/**
 * WAIT FOR THE SCREEN, NOT THE CLOCK. A fixed sleep is a guess, and after a
 * cold Turbopack compile the table page sits on "Checking whether Data records
 * are available here…" for far longer than any number worth hard-coding. This
 * waits for the table's own rail to exist, which is the first moment anything
 * on this page can be clicked.
 */
async function settleOnTable(page, tableId, ms = 240000) {
  await page.goto(`${ORIGIN}/data-v2/${tableId}`, {
    waitUntil: "domcontentloaded",
    timeout: ms,
  });
  await page
    .getByRole("button", { name: /^Forms$/ })
    .first()
    .waitFor({ state: "visible", timeout: ms });
  await page.waitForTimeout(2500);
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

export { ORIGIN, OUT, signIn, useOrganization, settleOnTable, shot, shotPath, openRail, only };

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

// scripts/data-hub/shots.mjs — LANE DATA-HUB
//
// THE HEADLESS PROOF of /data-v2's organization hub, from BOTH seats, on a real
// organization and on one with nothing in it yet.
//
// It signs in the way a person does — the login form, through
// `scripts/lib/seat-browser.mjs` — picks the organization through the picker a
// person uses, waits for the hub's listings to stop saying "reading…", and
// shoots what is on the screen. It never forces an organization from a cookie
// or a URL, because that tests a state no person can reach.
//
// It runs against the machine-wide preview server on port 3001. This lane holds
// no campaign port of its own: a PreToolUse hook on this box refuses a second
// Next.js dev server outright (16 GB, and two is a reliable hard crash), which
// is recorded in `scripts/campaign-ports.json` under `noDevServer`.
//
//   node scripts/data-hub/shots.mjs --out <dir> [--origin http://127.0.0.1:3001]

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

import { signIn, setOrganization, setOrganizationBySlug, sleep, until } from "../lib/seat-browser.mjs";

/** Who the APP says is signed in, asked before signing in again. */
async function whoAmI(page, origin) {
  // /dashboard bounces a signed-out visitor, and the bounce destroys the
  // execution context under an `evaluate` that started a moment earlier — which
  // is exactly how the member seat's walk died on 2026-09-22. Try twice, and
  // treat "nobody" as the answer rather than as an error.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForLoadState("load", { timeout: 60000 }).catch(() => {});
      return await page.evaluate(async () => {
        try {
          const seen = await (await fetch("/api/whoami")).json();
          return seen?.email ?? seen?.user?.email ?? null;
        } catch {
          return null;
        }
      });
    } catch {
      await sleep(1500);
    }
  }
  return null;
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ORIGIN = flag("origin", "http://127.0.0.1:3001");
const OUT = resolve(flag("out", "scripts/data-hub/shots"));
mkdirSync(OUT, { recursive: true });

const ADMIN = process.env.AI_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD;
// The non-admin seat. Same source every other headless proof in this repo uses
// (`scripts/agent-walk/close.mjs`): `TEST_USER_PASSWORD`, with the checked-in
// default this shared test account has always carried.
const TEST = "test@test.com";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? "Password1234#";
if (!ADMIN || !ADMIN_PASSWORD) {
  console.error("AI_ADMIN_USERNAME and AI_ADMIN_PASSWORD must be in the environment.");
  process.exit(1);
}

const findings = [];
function say(line) {
  console.log(line);
  findings.push(line);
}

/**
 * WAIT FOR THE HUB TO HAVE ANSWERED, never for a fixed number of seconds. Every
 * listing prints "reading…" while its door is in flight; the page is settled
 * when none of them does. A screenshot taken before that is a picture of a
 * spinner being called a proof.
 */
async function settled(page) {
  const { v, ms } = await until(
    "every hub listing answered",
    async () =>
      page.evaluate(() => {
        const body = document.body?.innerText ?? "";
        if (!body.includes("Start here")) return null;
        return body.includes("reading…") ? null : true;
      }),
    45000,
  );
  return { settled: Boolean(v), ms };
}

/** What the hub is actually claiming, read off the screen and not off our own code. */
async function readHub(page) {
  return page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll("[data-hub-listing]"));
    const rows = [];
    for (const section of sections) {
      const header = section.querySelector("button[aria-expanded]");
      if (!header) continue;
      const parts = Array.from(header.querySelectorAll("span")).map((s) => s.textContent?.trim() ?? "");
      if (parts.length < 2) continue;
      rows.push({ title: parts[0], count: parts[1], what: parts[2] ?? "" });
    }
    const lanes = Array.from(document.querySelectorAll("[data-hub-lane]")).map(
      (b) => b.textContent?.trim() ?? "",
    );
    return { rows, lanes, hasStartHere: (document.body?.innerText ?? "").includes("Start here") };
  });
}

async function shoot(page, name) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true });
  say(`  shot ${name}.png`);
}

/**
 * One walk never kills the others. A seat that cannot be reached is a FINDING
 * printed in the walk record, not an exception that throws away the three proofs
 * that already worked — which is exactly what happened on the first run.
 */
async function tryWalk(context, label, options) {
  try {
    return await walk(context, label, options);
  } catch (error) {
    say(`${label}: WALK FAILED — ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    return null;
  }
}

async function walk(context, label, { email, password, organization, slug, shots }) {
  const page = await context.newPage();
  // A context that is already this person stays signed in — re-running the login
  // form on a signed-in browser lands on /dashboard and waits forever for a field
  // that is not there.
  const already = await whoAmI(page, ORIGIN);
  const who = already === email ? already : await signIn(page, ORIGIN, email, password, label);
  say(`${label}: signed in as ${who}${already === email ? " (already)" : ""}`);
  if (who !== email) throw new Error(`${label}: expected ${email}, the app says ${who}`);

  if (slug) await setOrganizationBySlug(page, organization, slug);
  else await setOrganization(page, organization);
  say(`${label}: organization set to ${organization}${slug ? ` (${slug})` : ""}`);

  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const state = await settled(page);
  say(`${label}: hub settled=${state.settled} after ${state.ms} ms`);
  const hub = await readHub(page);
  say(`${label}: ${hub.rows.length} listings — ${hub.rows.map((r) => `${r.title} ${r.count}`).join(" · ")}`);
  say(`${label}: lane filters — ${hub.lanes.join(" · ")}`);

  // Every listing open, so the shot shows the rows and not just the headings.
  // SCOPED TO THE HUB'S OWN TOGGLES by a data attribute — a blanket click on
  // every collapsed button opened the whole app shell's menus over the page,
  // which is a picture of the sidebar and not of the hub.
  await page.evaluate(() => {
    for (const b of Array.from(document.querySelectorAll("[data-hub-listing-toggle]"))) {
      if (b.getAttribute("aria-expanded") === "false") b.click();
    }
  });
  await page.keyboard.press("Escape");
  await sleep(1500);
  await shoot(page, shots.desktop);

  // THE LANE FILTER, exercised rather than described.
  const mine = await page.evaluate(() => {
    const b = document.querySelector('[data-hub-lane="organization"]');
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(1200);
  if (mine) {
    const filteredHub = await readHub(page);
    say(
      `${label}: with the "My organization" lane on — ${filteredHub.rows
        .map((r) => `${r.title} ${r.count}`)
        .join(" · ")}`,
    );
    await shoot(page, shots.lane);
  }

  // THE ARCHIVE, one click where you already are — and the click has to CHANGE
  // something. The first run of this walk clicked through the DOM, reported the
  // control's label and shot a page byte-identical to the one before it: a
  // proof that proved the control exists and nothing about it working.
  const control = page.locator("[data-hub-archive] button").first();
  if ((await control.count()) === 0) {
    say(`${label}: NO archive control found — the archived-items law is not met on this screen`);
  } else {
    const before = (await control.textContent())?.trim() ?? "";
    await control.scrollIntoViewIfNeeded();
    await control.click();
    await sleep(2000);
    const after = (await control.textContent())?.trim() ?? "";
    say(`${label}: archive control read "${before}", and after one click "${after}"`);
    if (before === after) say(`${label}: THE ARCHIVE DID NOT OPEN — the label did not change`);
    const rows = await page
      .locator("[data-hub-archive] li")
      .count()
      .catch(() => 0);
    say(`${label}: the open archive shows ${rows} row(s)`);
    await control.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(OUT, `${shots.archive}.png`) });
    say(`  shot ${shots.archive}.png`);
  }

  await page.close();
  return hub;
}

const browser = await chromium.launch({ headless: true });
try {
  // THE ADMIN SEAT, on the plumber — the biggest real organization we have.
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await tryWalk(desktop, "admin@admin.com · Rincon Plumbing Co", {
    email: ADMIN,
    password: ADMIN_PASSWORD,
    organization: "Rincon Plumbing Co",
    shots: {
      desktop: "hub-admin-rincon-desktop",
      lane: "hub-admin-rincon-lane-my-organization",
      archive: "hub-admin-rincon-archive",
    },
  });

  // THE SAME SEAT, on an organization with NOTHING in it yet — the empty states.
  await tryWalk(desktop, "admin@admin.com · Glenwood Insights", {
    email: ADMIN,
    password: ADMIN_PASSWORD,
    organization: "Glenwood Insights",
    shots: {
      desktop: "hub-admin-empty-desktop",
      lane: "hub-admin-empty-lane-my-organization",
      archive: "hub-admin-empty-archive",
    },
  });
  await desktop.close();

  // THE NON-ADMIN SEAT, on the same plumber — a plain member, not a superuser.
  const member = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await tryWalk(member, "test@test.com · Rincon Plumbing Co", {
    email: TEST,
    password: TEST_PASSWORD,
    organization: "Rincon Plumbing Co",
    shots: {
      desktop: "hub-member-rincon-desktop",
      lane: "hub-member-rincon-lane-my-organization",
      archive: "hub-member-rincon-archive",
    },
  });
  await member.close();

  // PHONE WIDTH, from the admin seat, because a hub that only works on a laptop
  // is not finished.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await tryWalk(phone, "admin@admin.com · Rincon Plumbing Co · phone", {
    email: ADMIN,
    password: ADMIN_PASSWORD,
    organization: "Rincon Plumbing Co",
    shots: {
      desktop: "hub-admin-rincon-phone",
      lane: "hub-admin-rincon-phone-lane",
      archive: "hub-admin-rincon-phone-archive",
    },
  });
  await phone.close();

  writeFileSync(resolve(OUT, "hub-walk.txt"), `${findings.join("\n")}\n`);
  console.log(`\nwrote ${OUT}/hub-walk.txt`);
} finally {
  await browser.close();
}

// scripts/data-hub/hubfix-shots.mjs — LANE HUB-FIX
//
// THE HEADLESS PROOF of the four things VERIFIER-14 marked FALSE on the
// organization hub, walked from BOTH seats at 1600 and at 390 px.
//
// It signs in the way a person does — the login form, through
// `scripts/lib/seat-browser.mjs` — and picks the organization through the picker
// a person uses. Never a cookie, never a forced URL.
//
// WHAT IT ASSERTS, each one a clause that can come back FALSE:
//
//   1. THE DOOR LAW ON "SHARED WITH ME". From the member seat, the first row of
//      that listing is CLICKED. It must open the INVITATION's own screen —
//      `/invitations/table/accept/<token>` — which names the table, the
//      organization and what the person will be able to do, and never the flat
//      "This table is not here" VERIFIER-14 measured.
//   2. THE INBOX IS NOT THE FRONT DOOR. The approval queue must appear AFTER the
//      last capability listing in the document, not above "Start here".
//   3. THE NEWEST STRIP SEPARATES THE NAME FROM WHAT IT IS. No "Jobs Tables".
//   4. CHOICE LISTS ARE NOT A PERSON'S TABLES. The 27 per-field option tables
//      the store marks `kept_by_the_app` must be out of Tables and under their
//      own "Kept by the app" listing.
//
// It runs against the machine-wide preview server on port 3001 (this lane holds
// no campaign port; a PreToolUse hook on this box refuses a second Next.js dev
// server — `scripts/campaign-ports.json` records that under `noDevServer`), on
// its OWN hostname so it cannot evict another agent's session.
//
//   node scripts/data-hub/hubfix-shots.mjs --out <dir> [--origin http://hubfix.localhost:3001]

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

import { signIn, setOrganization, setOrganizationBySlug, sleep, until } from "../lib/seat-browser.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ORIGIN = flag("origin", "http://hubfix.localhost:3001");
const ONLY = flag("only", null);
const OUT = resolve(flag("out", "scripts/data-hub/hubfix-shots"));
mkdirSync(OUT, { recursive: true });

const ADMIN = process.env.AI_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD;
const TEST = "test@test.com";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? "Password1234#";
if (!ADMIN || !ADMIN_PASSWORD) {
  console.error("AI_ADMIN_USERNAME and AI_ADMIN_PASSWORD must be in the environment.");
  process.exit(1);
}

const findings = [];
let failures = 0;
function say(line) {
  console.log(line);
  findings.push(line);
}
function clause(label, ok, detail) {
  if (!ok) failures += 1;
  say(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function whoAmI(page, origin) {
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

/** Settled = every listing has stopped saying "reading…". Never a fixed wait. */
async function settled(page) {
  const { v, ms } = await until(
    "every hub listing answered",
    async () =>
      page.evaluate(() => {
        const body = document.body?.innerText ?? "";
        if (!body.includes("Start here")) return null;
        return body.includes("reading…") ? null : true;
      }),
    60000,
  );
  return { settled: Boolean(v), ms };
}

/** What the hub claims, read off the screen. */
async function readHub(page) {
  return page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll("[data-hub-listing]"));
    const rows = [];
    for (const section of sections) {
      const header = section.querySelector("button[aria-expanded]");
      if (!header) continue;
      const parts = Array.from(header.querySelectorAll("span")).map((s) => s.textContent?.trim() ?? "");
      if (parts.length < 2) continue;
      rows.push({ id: section.getAttribute("data-hub-listing"), title: parts[0], count: parts[1] });
    }
    const lanes = Array.from(document.querySelectorAll("[data-hub-lane]")).map(
      (b) => b.textContent?.trim() ?? "",
    );
    // The Newest strip, line by line, exactly as it is set on the page.
    const newest = Array.from(document.querySelectorAll("[data-hub-root] section li"))
      .map((li) => (li.textContent ?? "").trim())
      .filter((t) => t && !t.startsWith("Newest"))
      .slice(0, 3);
    return { rows, lanes, newest };
  });
}

/**
 * WHERE THE APPROVAL QUEUE SITS, decided by DOCUMENT ORDER and not by a guess
 * from the text. The inbox is the package's `ActionInbox`; it is found by the
 * heading it prints, and compared with the last capability listing.
 */
async function inboxPosition(page) {
  return page.evaluate(() => {
    const listings = Array.from(document.querySelectorAll("[data-hub-listing]"));
    if (listings.length === 0) return { found: false, why: "no hub listings on the page" };
    const last = listings[listings.length - 1];
    const root = document.querySelector("[data-hub-root]");
    if (!root) return { found: false, why: "no hub root" };
    // The inbox announces itself with a heading that starts "Inbox".
    const candidates = Array.from(root.querySelectorAll("*")).filter((el) => {
      if (el.children.length > 0) return false;
      const t = (el.textContent ?? "").trim();
      return /^Inbox\b/.test(t);
    });
    if (candidates.length === 0) return { found: false, why: "no element whose text starts with Inbox" };
    const inbox = candidates[0];
    const pos = last.compareDocumentPosition(inbox);
    return {
      found: true,
      label: (inbox.textContent ?? "").trim(),
      // DOCUMENT_POSITION_FOLLOWING === 4: the inbox comes AFTER the last listing.
      afterLastListing: (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    };
  });
}

async function shoot(page, name) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true });
  say(`  shot ${name}.png`);
}

async function openEveryListing(page) {
  await page.evaluate(() => {
    for (const b of Array.from(document.querySelectorAll("[data-hub-listing-toggle]"))) {
      if (b.getAttribute("aria-expanded") === "false") b.click();
    }
  });
  await page.keyboard.press("Escape");
  await sleep(1500);
}

/**
 * CLAUSE 5 — THE ITEM ROWS OPEN THE ITEM (VERIFIER-14 item 2, records-ui 0.82.0).
 * For each of Forms, Digests, Portals and Shared outside, the first row is
 * CLICKED from the hub. Its address must carry `?rail=`, and the table screen
 * must show that item — the row marked `[data-linked="true"]` in its rail, or
 * for a share the dialog — or the package's own sentence saying why not. A
 * grid with nothing open is the FAIL.
 */
const ITEM_LISTINGS = [
  { id: "forms", rail: "forms" },
  { id: "digests", rail: "notifications" },
  { id: "portals", rail: "portals" },
  { id: "bookings", rail: "bookings" },
  { id: "shared-outside", rail: "share" },
];
const HONEST_REFUSALS = [
  "The link named a form this table does not have",
  "The link named a digest that is not one of yours",
  // NOT "The link named a portal this table is not part of": that sentence on a
  // portal row IS the defect VERIFIER-15 H5 found — the row named the wrong table.
  "only someone with Admin on this table can share it",
];
async function itemRowsOpenTheItem(page, label, shots) {
  for (const { id, rail } of ITEM_LISTINGS) {
    await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await settled(page);
    await openEveryListing(page);
    const row = page.locator(`[data-hub-listing="${id}"] li a`).first();
    if ((await row.count()) === 0) {
      say(`${label}: the ${id} listing has no rows on this seat — nothing to open`);
      continue;
    }
    const name = (await row.textContent())?.trim() ?? "";
    const href = (await row.getAttribute("href")) ?? "";
    clause(`${label} · the ${id} row's address names its rail`, href.includes(`rail=${rail}`), `${name} → ${href}`);
    await row.click();
    const landed = await until(
      `the ${id} item on its table`,
      async () =>
        page.evaluate(
          ({ rail, refusals }) => {
            const body = document.body?.innerText ?? "";
            const refusal = refusals.find((r) => body.includes(r));
            if (refusal) return { how: `the page says: ${refusal}…` };
            if (rail === "share") {
              const dialog = document.querySelector('[role="dialog"]');
              return dialog ? { how: `the share dialog is open — ${(dialog.textContent ?? "").replace(/\s+/g, " ").slice(0, 90)}` } : null;
            }
            const marked = document.querySelector('[data-linked="true"]');
            return marked ? { how: `marked in its rail — ${(marked.textContent ?? "").replace(/\s+/g, " ").slice(0, 90)}` } : null;
          },
          { rail, refusals: HONEST_REFUSALS },
        ),
      45000,
    );
    clause(
      `${label} · the ${id} row OPENS the item, not the grid`,
      Boolean(landed.v),
      landed.v ? `${landed.v.how} (${landed.ms} ms)` : `nothing opened within ${landed.ms} ms — URL ${page.url()}`,
    );
    await shoot(page, `${shots.itemPrefix}-${id}`);
  }
}

/**
 * CLAUSES 6 + 7 — AN ACCEPTED SHARE STAYS LISTED, AND OPENS WITHOUT A FALSE
 * SENTENCE (VERIFIER-15 H4, H6). From the member seat: "Shared with me" holds a
 * row whose address opens the owner's table (`?org=`), no two rows of that
 * listing read the same, and clicking it lands on the table with "Shared with
 * you by …" and WITHOUT the toast "…not a member of … nothing was opened and you
 * were not moved" over it.
 */
async function acceptedShareOpens(page, label, shots) {
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await settled(page);
  await openEveryListing(page);
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-hub-listing="shared-with-me"] li')).map((li) => ({
      text: (li.textContent ?? "").replace(/\s+/g, " ").trim(),
      href: li.querySelector("a")?.getAttribute("href") ?? "",
    })),
  );
  // THE SAME THING TWICE is a defect; two organizations that happen to share a
  // name ("Rincon Plumbing Co — Ojai Branch" is ten organizations in this
  // store) are two things, so rows are compared by where they OPEN.
  const hrefs = rows.map((r) => r.href);
  const dupes = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
  clause(`${label} · no "Shared with me" thing is listed twice`, dupes.length === 0, dupes.length ? `listed twice: ${dupes.join(" | ")}` : `${rows.length} rows, ${new Set(hrefs).size} distinct destinations`);
  const repeatsOrg = rows.filter((r) => /in (.+?) · .*from \1/.test(r.text));
  clause(`${label} · a "Shared with me" row names the organization once`, repeatsOrg.length === 0, repeatsOrg.map((r) => r.text).join(" | ") || "each row names it once");
  const accepted = rows.find((r) => r.href.includes("?org="));
  if (!accepted) {
    say(`${label}: no accepted share from a live organization on this seat — the open-a-shared-table clauses have nothing to open`);
    return;
  }
  clause(`${label} · an ACCEPTED share is still listed`, true, `${accepted.text} → ${accepted.href}`);
  await page.locator(`[data-hub-listing="shared-with-me"] li a[href="${accepted.href}"]`).first().click();
  const landed = await until(
    "the owner's table, said to be theirs",
    async () =>
      page.evaluate(() => {
        const body = document.body?.innerText ?? "";
        if (body.includes("Opening the table")) return null;
        return body.includes("Shared with you by") ? { ok: true } : null;
      }),
    45000,
  );
  // Give a late toast its chance to appear before judging it absent.
  await sleep(4000);
  const lie = await page.evaluate(() => {
    const body = document.body?.innerText ?? "";
    return body.includes("you were not moved") || body.includes("not a member of");
  });
  clause(`${label} · the accepted share opens the owner's table and says whose it is`, Boolean(landed.v), landed.v ? `"Shared with you by …" after ${landed.ms} ms` : `no "Shared with you by" line within ${landed.ms} ms — URL ${page.url()}`);
  clause(`${label} · no refusal toast over the open table`, !lie, lie ? 'the page says "not a member of … you were not moved"' : "no refusal sentence anywhere on the page");
  await shoot(page, `${shots.itemPrefix}-accepted-share`);
}

/**
 * CLAUSES 10–13 (VERIFIER-16).
 *   10. Every lane's empty sentence is true: none says "Make one below" or
 *       "Nothing has been made here yet" while it is a LANE that is empty (M6).
 *   11. Tables under Everything is the sum of Tables under the four lanes (M6).
 *   12. On a shared-only organization, a member with nothing shared sees the
 *       sentence that says so, never "No tables yet".
 *   13. No "Shared with me" row comes from an ARCHIVED organization (M5).
 */
const ARCHIVED_SHARE_OWNERS = [
  "95725d0b-aa9b-4817-8311-29a581c3cef1",
  "ca0c5df9-462f-4ff3-a423-77eeb0c7f00b",
  "4e05cf9e-6652-451d-b4e5-e4d541363716",
  "e9e7e190-ddac-4824-bd10-a02c9d1239c0",
];
async function lanesTellTheTruth(page, label, { expectSharedOnly }) {
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await settled(page);
  await openEveryListing(page);
  const everything = await readHub(page);
  const tablesAll = Number(everything.rows.find((r) => r.id === "tables")?.count ?? NaN);

  if (expectSharedOnly) {
    const text = await page.evaluate(() => document.querySelector('[data-hub-listing="tables"]')?.textContent ?? "");
    if (tablesAll === 0) {
      clause(
        `${label} · a shared-only member with nothing shared is told exactly that`,
        /shared with you/i.test(text) && !/No tables yet/.test(text),
        text.replace(/\s+/g, " ").slice(0, 200),
      );
    } else {
      // Something HAS been shared with her since; then she sees it, and the
      // empty sentence is rightly not on the page.
      clause(
        `${label} · a shared-only member sees exactly what was shared with her, and no "No tables yet"`,
        !/No tables yet/.test(text),
        `${tablesAll} table(s) shared with this seat`,
      );
    }
  }

  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-hub-listing="shared-with-me"] li a')).map((a) => a.getAttribute("href") ?? ""),
  );
  const fromArchived = hrefs.filter((h) => ARCHIVED_SHARE_OWNERS.some((id) => h.includes(id)));
  clause(`${label} · no "Shared with me" row comes from an archived organization`, fromArchived.length === 0, fromArchived.length ? fromArchived.join(" | ") : `${hrefs.length} row(s), none from the four archived owners`);

  if (everything.lanes.length === 0) {
    say(`${label}: the lane filters are absent (the store's table facts are not live yet) — lane clauses have nothing to press`);
    return;
  }
  // MINE OVERLAPS (chair ruling 2026-09-23: Mine = tables I made, whatever their
  // visibility), so the lanes do not add up to Everything. What must hold is that
  // no table falls through: every table under Everything is in at least one lane.
  const tableHrefs = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-hub-listing="tables"] li a')).map((a) => a.getAttribute("href") ?? ""),
    );
  const everythingHrefs = new Set(await tableHrefs());
  const inSomeLane = new Set();
  let sum = 0;
  const lies = [];
  for (const laneId of ["mine", "organization", "community", "world"]) {
    await page.evaluate((id) => document.querySelector(`[data-hub-lane="${id}"]`)?.click(), laneId);
    await sleep(900);
    const hub = await readHub(page);
    for (const h of await tableHrefs()) inSomeLane.add(h);
    if (laneId === "mine") say(`${label}: Mine holds ${hub.rows.find((r) => r.id === "tables")?.count ?? 0} table(s) — the ones this seat made`);
    sum += Number(hub.rows.find((r) => r.id === "tables")?.count ?? 0);
    const text = await page.evaluate(() => document.querySelector("[data-hub-root]")?.innerText ?? "");
    for (const bad of ["Make one below", "Nothing has been made here yet", "only you can see"]) {
      if (text.includes(bad)) lies.push(`${laneId}: "${bad}"`);
    }
  }
  await page.evaluate(() => document.querySelector('[data-hub-lane="everything"]')?.click());
  clause(`${label} · every empty lane says what is true of that lane`, lies.length === 0, lies.length ? lies.join(" · ") : "no lane carries the old sentences");
  const fallThrough = [...everythingHrefs].filter((h) => !inSomeLane.has(h));
  clause(
    `${label} · every table under Everything is in at least one lane`,
    fallThrough.length === 0 && everythingHrefs.size === tablesAll,
    `Everything ${tablesAll}; ${fallThrough.length} in no lane (lanes add to ${sum} because Mine overlaps)`,
  );
}

async function walk(context, label, { email, password, organization, slug, shots, openShared, expectSharedOnly }) {
  const page = await context.newPage();
  const already = await whoAmI(page, ORIGIN);
  // The dev server compiles /login on first hit and the sign-in helper's own wait
  // is shorter than that compile, which is how the admin seat "never signed in"
  // on the first run of this walk while the second seat sailed through. Warm the
  // route, then try twice.
  let who = already;
  if (already !== email) {
    await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {});
    await page.waitForSelector("#email", { timeout: 180000 }).catch(() => {});
    for (let attempt = 0; attempt < 2 && who !== email; attempt += 1) {
      try {
        who = await signIn(page, ORIGIN, email, password, label);
      } catch (error) {
        if (attempt === 1) throw error;
        say(`${label}: sign-in did not take on the first try — one more`);
        await sleep(3000);
      }
    }
  }
  say(`${label}: signed in as ${who}${already === email ? " (already)" : ""}`);
  if (who !== email) throw new Error(`${label}: expected ${email}, the app says ${who}`);

  let picked = false;
  for (let attempt = 0; attempt < 2 && !picked; attempt += 1) {
    try {
      // Several organizations share a name (eight are called "Ironclad Mobile
      // Mechanic…"), so a walk that needs ONE of them picks it by slug.
      if (slug) await setOrganizationBySlug(page, organization, slug);
      else await setOrganization(page, organization);
      picked = true;
    } catch (error) {
      if (attempt === 1) throw error;
      say(`${label}: the organization picker threw — settling and trying once more`);
      await sleep(4000);
    }
  }
  say(`${label}: organization set to ${organization}`);

  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const state = await settled(page);
  say(`${label}: hub settled=${state.settled} after ${state.ms} ms`);
  const hub = await readHub(page);
  say(`${label}: ${hub.rows.length} listings — ${hub.rows.map((r) => `${r.title} ${r.count}`).join(" · ")}`);

  // ── clause 9: the four lanes, and nothing else — or ABSENT with the reason ──
  // The lanes read `custom.table_facts`; until the chair applies it the hub
  // offers no lane filter and says why (never lanes that quietly file every
  // table under My organization).
  const lanesAbsent = hub.lanes.length === 0;
  if (lanesAbsent) {
    const said = await page.evaluate(() =>
      (document.querySelector("[data-hub-root]")?.innerText ?? "").includes("could not be read, so only everything is shown"),
    );
    clause(`${label} · without the store's table facts, the lane filters are absent and say why`, said, said ? "the reason is on the page" : "no filters and no reason");
  } else {
    const expected = ["Everything", "Mine", "My organization", "Community", "World"];
    clause(
      `${label} · the lane strip is Everything plus the four visibility lanes`,
      JSON.stringify(hub.lanes) === JSON.stringify(expected),
      hub.lanes.join(" · "),
    );
  }

  // ── clause 4: choice lists are not a person's tables ───────────────────────
  const tables = hub.rows.find((r) => r.id === "tables");
  const kept = hub.rows.find((r) => r.id === "kept-by-the-app");
  clause(
    `${label} · "Kept by the app" is its own listing`,
    Boolean(kept),
    kept ? `count ${kept.count}` : "no [data-hub-listing=kept-by-the-app] on the page",
  );
  if (tables && kept) {
    clause(
      `${label} · the option-list tables are OUT of Tables`,
      Number(kept.count) === 0 || Number(tables.count) < Number(tables.count) + Number(kept.count),
      `Tables ${tables.count}, Kept by the app ${kept.count}`,
    );
  }

  // ── clause 3: the Newest strip separates the name from what it is ──────────
  if (hub.newest.length > 0) {
    const runTogether = hub.newest.filter((t) => !t.includes("·"));
    clause(
      `${label} · the Newest strip separates the name from the capability`,
      runTogether.length === 0,
      runTogether.length === 0 ? hub.newest.join(" | ") : `no separator on: ${runTogether.join(" | ")}`,
    );
  } else {
    say(`${label}: the Newest strip is empty on this organization — nothing to judge`);
  }

  await openEveryListing(page);

  // ── clause 2: the approval queue is not the front door ─────────────────────
  const inbox = await inboxPosition(page);
  if (!inbox.found) {
    say(`${label}: no approval queue on this screen (${inbox.why}) — nothing to judge`);
  } else {
    clause(
      `${label} · the approval queue sits BELOW the capability listings`,
      inbox.afterLastListing,
      `"${inbox.label}"`,
    );
  }

  await shoot(page, shots.desktop);

  // ── clause 1: the door law on "Shared with me" ─────────────────────────────
  if (openShared) {
    // An OFFERED share — the row that opens the invitation. An accepted one is
    // judged by `acceptedShareOpens` below.
    const row = page.locator('[data-hub-listing="shared-with-me"] li a[href^="/invitations/table/accept/"]').first();
    const count = await row.count();
    if (count === 0) {
      // NOTHING OFFERED IS A FACT OF THE DATA, NOT A DEFECT: every share this
      // seat held came from organizations archived since 2026-09-22, and those
      // now go with the archive (VERIFIER-16 M5). Said, never scored.
      say(`${label}: no invitation is waiting for this seat from a live organization — nothing to open`);
    } else {
      const name = (await row.textContent())?.trim() ?? "";
      const href = await row.getAttribute("href");
      clause(
        `${label} · the "Shared with me" row opens the invitation's own screen`,
        Boolean(href && href.startsWith("/invitations/table/accept/")),
        `${name} → ${href}`,
      );
      await row.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 120000 });
      const landed = await until(
        "the invitation's own screen",
        async () =>
          page.evaluate(() => {
            const body = document.body?.innerText ?? "";
            if (body.includes("This table is not here")) return { dead: true, body: body.slice(0, 800) };
            // The offer names the table and the organization, and carries the
            // one control that accepts it.
            const offer =
              /shared\s+.+\s+with you/i.test(body) ||
              body.includes("Open it and it is yours to see");
            return offer ? { dead: false, body: body.slice(0, 800) } : null;
          }),
        45000,
      );
      clause(
        `${label} · the row OPENS the offer, not a dead sentence`,
        Boolean(landed.v) && landed.v.dead === false,
        landed.v
          ? landed.v.dead
            ? 'the screen still says "This table is not here"'
            : `the screen names the table and the organization, after ${landed.ms} ms — ${landed.v.body.replace(/\s+/g, " ").slice(0, 180)}`
          : `no offer appeared within ${landed.ms} ms — URL ${page.url()}`,
      );
      await shoot(page, shots.shared);
    }
  }

  await lanesTellTheTruth(page, label, { expectSharedOnly: Boolean(expectSharedOnly) });
  if (shots.itemPrefix) await itemRowsOpenTheItem(page, label, shots);
  if (openShared && shots.itemPrefix) await acceptedShareOpens(page, label, shots);

  await page.close();
  return hub;
}

async function tryWalk(context, label, options) {
  if (ONLY && !label.includes(ONLY)) return null;
  try {
    return await walk(context, label, options);
  } catch (error) {
    failures += 1;
    say(`${label}: WALK FAILED — ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    return null;
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await tryWalk(desktop, "admin@admin.com · Rincon Plumbing Co · 1600", {
    email: ADMIN,
    password: ADMIN_PASSWORD,
    organization: "Rincon Plumbing Co",
    shots: { desktop: "hubfix-admin-rincon-1600", shared: "hubfix-admin-rincon-shared", itemPrefix: "hubfix-admin-1600-opens" },
  });
  await desktop.close();

  const member = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await tryWalk(member, "test@test.com · Rincon Plumbing Co · 1600", {
    email: TEST,
    password: TEST_PASSWORD,
    organization: "Rincon Plumbing Co",
    openShared: true,
    shots: { desktop: "hubfix-member-rincon-1600", shared: "hubfix-member-rincon-shared-opens", itemPrefix: "hubfix-member-1600-opens" },
  });
  await member.close();

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await tryWalk(phone, "admin@admin.com · Rincon Plumbing Co · 390", {
    email: ADMIN,
    password: ADMIN_PASSWORD,
    organization: "Rincon Plumbing Co",
    shots: { desktop: "hubfix-admin-rincon-390", shared: "hubfix-admin-rincon-390-shared", itemPrefix: "hubfix-admin-390-opens" },
  });
  await phone.close();

  const memberPhone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await tryWalk(memberPhone, "test@test.com · Rincon Plumbing Co · 390", {
    email: TEST,
    password: TEST_PASSWORD,
    organization: "Rincon Plumbing Co",
    openShared: true,
    shots: { desktop: "hubfix-member-rincon-390", shared: "hubfix-member-rincon-390-shared-opens", itemPrefix: "hubfix-member-390-opens" },
  });
  await memberPhone.close();

  // THE SHARED-ONLY MEMBER (VERIFIER-16): test@test.com in admin's Workspace,
  // which shows members only what is shared with them, at both widths.
  for (const [width, height, tag] of [[1600, 1000, "1600"], [390, 844, "390"]]) {
    const seat = await browser.newContext({ viewport: { width, height }, ...(width < 768 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await tryWalk(seat, `test@test.com · admin's Workspace · ${tag}`, {
      email: TEST,
      password: TEST_PASSWORD,
      organization: "admin's Workspace",
      slug: "admin",
      expectSharedOnly: true,
      openShared: true,
      shots: { desktop: `hubfix-member-workspace-${tag}`, shared: `hubfix-member-workspace-${tag}-shared`, itemPrefix: `hubfix-member-workspace-${tag}-opens` },
    });
    await seat.close();
  }

  // CLAUSE 8 — A PORTAL ROW OPENS THE PORTAL (VERIFIER-15 H5). Rincon's portals
  // are all archived, so this runs on Ironclad Mobile Mechanic, whose live
  // "Customer Portal" shows one table beside its clients table.
  const portalSeat = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await tryWalk(portalSeat, "admin@admin.com · Ironclad Mobile Mechanic · 1600", {
    email: ADMIN,
    password: ADMIN_PASSWORD,
    organization: "Ironclad Mobile Mechanic",
    slug: "ironclad-mobile-mechanic",
    shots: { desktop: "hubfix-admin-ironclad-1600", shared: "hubfix-admin-ironclad-shared", itemPrefix: "hubfix-admin-ironclad-opens" },
  });
  await portalSeat.close();

  say(`\n${failures === 0 ? "ALL CLAUSES PASS" : `${failures} CLAUSE(S) FAILED`}`);
  writeFileSync(resolve(OUT, "hubfix-walk.txt"), `${findings.join("\n")}\n`);
  console.log(`\nwrote ${OUT}/hubfix-walk.txt`);
} finally {
  await browser.close();
}
process.exit(failures === 0 ? 0 : 1);

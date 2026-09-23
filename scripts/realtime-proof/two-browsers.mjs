// scripts/realtime-proof/two-browsers.mjs
//
// LANE REALTIME — THE PROOF, IN TWO BROWSERS, ON A REAL BUSINESS'S REAL TABLE.
//
// THE USE CASE. Rincon Plumbing Co of Ventura County runs one Jobs board. Dana is in the
// office; Marco, the field supervisor, has the same board open on a tablet in the van. What
// this drives, headless, against the live database:
//
//   1. Marco's browser (test@test.com, a member) opens the Jobs board and its grid says LIVE
//      — the banner it has printed since the grid existed was "Not live: this host bound no
//      realtime port", so the sentence changing is itself the first clause.
//   2. Dana's browser (admin@admin.com, the owner) adds Friday's emergency call-out.
//      Marco's board shows it WITHOUT A RELOAD.
//   3. Dana adds a column. Marco's board grows the column WITHOUT A RELOAD.
//   4. Not one message Marco received carries a value — asserted against the payloads his own
//      page actually saw, not against the database.
//
// Run: node scripts/realtime-proof/two-browsers.mjs
// Port 3042 (lane REALTIME in scripts/campaign-ports.json). Headless, always.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 3042;
const HOST = "realtime-lane";
const ORIGIN = `http://${HOST}.localhost:${PORT}`;
const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99"; // Rincon Plumbing Co
// A table in Rincon Plumbing Co — Oxnard Branch, a company Marco is NOT a member of
// (`iam.memberships` for him there: 0 rows). It is the negative half of clause 5.
// FIXTURE-ORGS 2026-09-23: the Oxnard branch was archived; Ridgeline Physical Therapy (admin only) is the company test@test.com is NOT in.
const OXNARD_TABLE = "f9d61a79-0780-4cd2-9b58-3e2a25042714"; // Ridgeline's appointments table
const ORG_NAME = "Rincon Plumbing Co";
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163"; // its Jobs table
const TABLE_URL = `${ORIGIN}/data-v2/${JOBS}`;
const TEST_EMAIL = "test@test.com";
const TEST_PASSWORD = "Password1234#";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD;
if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / AI_ADMIN_USERNAME / " +
      "AI_ADMIN_PASSWORD. Run with the repo's env loaded; this script prints no credential.",
  );
  process.exit(2);
}

const results = [];
const ok = (m) => {
  results.push(["OK", m]);
  console.log(`  OK   ${m}`);
};
const bad = (m) => {
  results.push(["FAIL", m]);
  console.log(`  FAIL ${m}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(label, fn, timeoutMs = 25000) {
  const start = Date.now();
  for (;;) {
    let v;
    try {
      v = await fn();
    } catch {
      v = null;
    }
    if (v) return { v, ms: Date.now() - start };
    if (Date.now() - start > timeoutMs) return { v: null, ms: Date.now() - start, label };
    await sleep(250);
  }
}

/**
 * DANA, the office. She is a signed-in `admin@admin.com` Supabase client rather than a second
 * Chromium window, and that is deliberate rather than a shortcut: the clause under test is
 * MARCO'S BROWSER changing without a reload, and Dana's job is only to make a real change
 * through the real door. She writes with the same anon key, the same session and the same two
 * RPCs (`record_write`, `field_declare`) the grid's own buttons call — nothing privileged,
 * no service role, no direct table write (there is none to make: `custom` is doors-only).
 */
async function signInDana() {
  const { createClient } = await import("@supabase/supabase-js");
  // Schema `custom`, because that is where the doors live — and there is nothing else in it
  // a client could reach: it holds no table grant for any client role.
  const supa = createClient(SUPABASE_URL, SUPABASE_KEY, { db: { schema: "custom" } });
  const { error } = await supa.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (error) throw new Error(`Dana could not sign in: ${error.message}`);
  return supa;
}

async function danaWrites(supa, data) {
  const { data: id, error } = await supa.rpc("record_write", {
    p_organization_id: ORG,
    p_table_id: JOBS,
    p_data: data,
  });
  return { id, error: error?.message ?? null };
}

/** Marco's own bearer token, for the probe channel in clause 5. Same person, same session. */
async function marcoAccessToken() {
  const { createClient } = await import("@supabase/supabase-js");
  const c = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await c.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) throw new Error(`could not mint Marco's token: ${error.message}`);
  return data.session?.access_token ?? "";
}

/** Marco: an ordinary password sign-in, because he is not the admin account. */
async function signInTest(page) {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // Wait for hydration: the form is server-rendered but the fields only accept input once the
  // client bundle has attached, and a fill that lands before that silently does nothing.
  await page.waitForSelector("#email", { timeout: 90000 });
  await page.fill("#email", TEST_EMAIL);
  await page.fill("#password", TEST_PASSWORD);
  await page.click('button:has-text("Sign in")');
  const { v } = await until("test sign-in", async () => {
    const who = await page.evaluate(async () => {
      try {
        return await (await fetch("/api/whoami")).json();
      } catch {
        return null;
      }
    });
    return who?.email ? who.email : null;
  }, 45000);
  if (!v) throw new Error("test@test.com never signed in");
  return v;
}

/**
 * Pick the organization the way Marco would: off the screen the app itself puts in front of
 * him. The platform deliberately never picks one for you, so a cookie written from outside
 * would be testing a state no person can reach.
 */
async function setOrganization(page, organizationName) {
  // The list is long and virtualized, so the row is in the DOM before it is on screen. Find
  // it by its own name and click the control it sits in — the same click a finger makes.
  const clickOnce = async () => page.evaluate((name) => {
    const span = Array.from(document.querySelectorAll("span")).find(
      (s) => (s.textContent ?? "").trim() === name,
    );
    if (!span) return false;
    const target = span.closest("button, [role='option'], [role='button'], a") ?? span.parentElement;
    if (!target) return false;
    target.scrollIntoView({ block: "center" });
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }, organizationName);
  const { v: clicked } = await until("the organization picker", clickOnce, 90000);
  if (!clicked) throw new Error(`the organization "${organizationName}" was not on the picker`);
}

async function rowTexts(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("table tbody tr")).map((r) => r.textContent ?? ""),
  );
}

async function headerTexts(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("table thead th")).map((h) => (h.textContent ?? "").trim()),
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const marco = await browser.newContext();
  const marcoPage = await marco.newPage();

  // Every notice Marco's page actually receives, captured from the page itself.
  const noticesSeen = [];
  await marcoPage.exposeFunction("__realtimeProofNotice", (p) => noticesSeen.push(p));

  try {
    const supa = await signInDana();
    const marcoWho = await signInTest(marcoPage);
    console.log(`  Dana=${ADMIN_EMAIL} (signed-in client, through the same doors)  Marco=${marcoWho}`);
    // The org picker is on whatever page he landed on after signing in.
    await marcoPage.goto(`${ORIGIN}/data-v2`, { waitUntil: "commit", timeout: 120000 });
    await setOrganization(marcoPage, ORG_NAME);
    await sleep(3000);

    // The probe channel in clause 5 must carry the SAME person, so it is handed Marco's own
    // access token rather than joining anonymously — an anonymous refusal would prove nothing
    // about a member being walled out of a company she is not in.
    const marcoToken = await marcoAccessToken();
    await marcoPage.addInitScript((t) => {
      window.__realtimeProofToken = t;
    }, marcoToken);

    // Tap the socket before the app opens it, so the assertion about what travelled is made
    // against what this browser actually received rather than against the database.
    await marcoPage.addInitScript(() => {
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = class extends OriginalWebSocket {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", (event) => {
            // Phoenix's v2 serializer sends an ARRAY, not an object, so match on the raw
            // text of the frame rather than on a key that may not be there — and a frame can
            // arrive as a Blob or an ArrayBuffer, which a string-only tap would miss.
            const d = event.data;
            const hand = (raw) => {
              if (typeof raw === "string" && raw.includes("records.changed")) {
                window.__realtimeProofNotice?.(raw);
              }
            };
            if (typeof d === "string") hand(d);
            else if (d instanceof ArrayBuffer) hand(new TextDecoder().decode(d));
            else if (typeof Blob !== "undefined" && d instanceof Blob) void d.text().then(hand);
          });
        }
      };
    });

    // A dev server compiling this route for the first time can abort the first navigation.
    for (let attempt = 1; ; attempt++) {
      try {
        await marcoPage.goto(TABLE_URL, { waitUntil: "commit", timeout: 120000 });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        console.log(`  (navigation attempt ${attempt} aborted, retrying)`);
        await sleep(4000);
      }
    }
    const settled = await until("Marco's grid", async () => (await rowTexts(marcoPage)).length > 0, 90000);
    if (!settled.v) {
      bad("Marco's Jobs board never rendered a row");
      throw new Error("no grid");
    }
    const startRows = (await rowTexts(marcoPage)).length;

    // ── 1. THE BANNER ──────────────────────────────────────────────────────────────────
    // The grid prints its reason ONLY when it is not live (`{!records.live ? <p>…</p> : null}`
    // in Grid.tsx), so the clause is that the sentence this lane exists to retire is GONE.
    const notLive = await marcoPage.evaluate(() => {
      const m = document.body.innerText.match(/Not live:[^\n]*/);
      return m ? m[0] : null;
    });
    if (notLive) bad(`the grid still says: "${notLive}"`);
    else ok('the grid no longer prints "Not live: this host bound no realtime port" — the port is bound');

    // ── 2. A JOB ADDED IN DANA'S BROWSER APPEARS IN MARCO'S ────────────────────────────
    const jobNumber = `RPC-${Math.floor(Date.now() / 1000) % 100000}`;
    const writeResult = await danaWrites(supa, {
      job_number: jobNumber,
      address: "1400 Thompson Blvd, Ventura CA 93001",
      notes: "Emergency call-out: water heater flooding the garage.",
    });

    console.log(`  (Dana's write returned id=${writeResult?.id ?? "none"})`);
    if (writeResult?.error) {
      bad(`Dana could not add the job through the door: ${writeResult.error}`);
    } else {
      const grew = await until(
        "the new job in Marco's browser",
        async () => (await rowTexts(marcoPage)).some((t) => t.includes(jobNumber)),
        25000,
      );
      if (grew.v) {
        ok(`Marco's board showed ${jobNumber} ${grew.ms} ms after Dana added it, with no reload`);
      } else {
        const now = await rowTexts(marcoPage);
        bad(
          `Marco's board never showed ${jobNumber} — ${startRows} rows before, ${now.length} now, ` +
            `first row: ${JSON.stringify((now[0] ?? "").slice(0, 80))}`,
        );
      }
    }

    // ── 3. A COLUMN ADDED IN DANA'S BROWSER APPEARS IN MARCO'S ─────────────────────────
    const colKey = `permit_${Math.floor(Date.now() / 1000) % 100000}`;
    const colLabel = `Permit ${colKey.slice(-5)}`;
    const fieldResult = await supa.rpc("field_declare", {
      p_organization_id: ORG,
      p_table_id: JOBS,
      p_spec: { key: colKey, label: colLabel, type: "text" },
    }).then((r) => ({ data: r.data, error: r.error?.message ?? null }));

    if (fieldResult?.error) {
      bad(`Dana could not add the column through the door: ${fieldResult.error}`);
    } else {
      const grew = await until(
        "the new column in Marco's browser",
        async () => (await headerTexts(marcoPage)).some((h) => h.includes(colLabel)),
        25000,
      );
      if (grew.v) ok(`Marco's board grew the "${colLabel}" column ${grew.ms} ms later, with no reload`);
      else bad(`Marco's board never grew the "${colLabel}" column`);
    }

    // ── 4. NOTHING MARCO RECEIVED CARRIED A VALUE ──────────────────────────────────────
    const leaky = noticesSeen.filter(
      (raw) =>
        raw.includes("Thompson Blvd") ||
        raw.includes("water heater") ||
        raw.includes(jobNumber),
    );
    if (noticesSeen.length === 0) {
      bad("no realtime frame was captured at all, so clause 4 proves nothing");
    } else if (leaky.length === 0) {
      ok(`${noticesSeen.length} realtime frame(s) reached Marco's browser and not one carried a value`);
    } else {
      bad(`${leaky.length} of ${noticesSeen.length} frames carried the job's own words`);
    }

    // ── 5. A NON-MEMBER'S SOCKET IS REFUSED AT THE JOIN. ───────────────────────────────
    // Marco belongs to Rincon Plumbing Co and NOT to its Oxnard branch. He asks for a table
    // in Oxnard by name. The refusal is the database's, at the join, by the same ladder the
    // read door asks — nothing in the client decides it.
    const oxnardTopic = `custom:table:${OXNARD_TABLE}`;
    const joinVerdict = await marcoPage.evaluate(
      async ({ url, key, topic }) =>
        new Promise((resolve) => {
          void (async () => {
            const { createClient } = await import(
              /* webpackIgnore: true */ "https://esm.sh/@supabase/supabase-js@2"
            );
            const c = createClient(url, key);
            // Carry the same person: the session this page already holds.
            const token = window.__realtimeProofToken;
            if (token) await c.realtime.setAuth(token);
            const ch = c.channel(topic, { config: { private: true } });
            const done = (v) => {
              try {
                void c.removeChannel(ch);
              } catch {
                /* closing is not the answer */
              }
              resolve(v);
            };
            ch.subscribe((status) => {
              if (status === "SUBSCRIBED") done("SUBSCRIBED");
              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") done(status);
            });
            setTimeout(() => done("NO_ANSWER"), 20000);
          })();
        }),
      { url: SUPABASE_URL, key: SUPABASE_KEY, topic: oxnardTopic },
    );
    if (joinVerdict === "SUBSCRIBED") {
      bad(`a non-member JOINED ${oxnardTopic}`);
    } else if (joinVerdict === "NO_ANSWER") {
      bad(`the join of ${oxnardTopic} never answered, so this clause proves nothing`);
    } else {
      ok(`a non-member asking for the Oxnard branch's board was refused at the join (${joinVerdict})`);
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter(([s]) => s === "FAIL");
  console.log(`\n${failed.length === 0 ? "ALL GREEN" : `${failed.length} FAILED`} — ${results.length} clause(s)`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

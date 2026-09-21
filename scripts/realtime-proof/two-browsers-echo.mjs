// scripts/realtime-proof/two-browsers-echo.mjs
//
// LANE REALTIME-2 — TWO REAL BROWSERS, AND THE REQUESTS COUNTED IN BOTH OF THEM.
//
// THE USE CASE. Rincon Plumbing Co of Ventura County runs one Jobs board. Dana is in the
// office; Marco, the field supervisor, has the same board open on a tablet in the van. Lane
// REALTIME proved Marco's board changes without a reload. This proves the other half, which
// is the half a person actually feels:
//
//   · DANA's browser does NOT re-read its own write. She already has it — the write door
//     handed it back. Hers is the one browser in the world that already knows.
//   · MARCO's browser re-reads ONE record, not the whole board, because the notice names the
//     exact ids that moved and there is now a door that takes them.
//
// Both are asserted by COUNTING THE NETWORK IN EACH BROWSER — every PostgREST call to
// `read_records` and `read_records_by_ids` — which is what makes "requests per change" a
// measurement rather than a claim.
//
// THE ORGANIZATION IS PICKED THROUGH THE SHARED SEAT HELPER (`scripts/lib/seat-browser.mjs`),
// which knows the thing this lane learned the hard way: every real-data crew organization is
// classified a TEST FIXTURE and the picker hides those behind one disclosure — the
// archived-items-law pattern. A search alone finds nothing at all, and the picker says so
// ("Nothing matches ... outside the test organizations below"). The helper opens the
// disclosure, exactly as a person clicks it. Never a cookie, never a forced URL.
//
// Port 3044 (lane REALTIME-2 in scripts/campaign-ports.json). Headless, always.
// Run: node scripts/realtime-proof/two-browsers-echo.mjs
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { setOrganization, signIn, sleep, until } from "../lib/seat-browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 3044;
const HOST = "realtime2";
const ORIGIN = `http://${HOST}.localhost:${PORT}`;
const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99"; // Rincon Plumbing Co
const ORG_NAME = "Rincon Plumbing Co";
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163"; // its Jobs board
// A table in Rincon Plumbing Co — Oxnard Branch, a company Marco is NOT a member of.
const OXNARD_ORG = "5531d39c-e863-467a-9e36-ad7f14b2faeb";
const OXNARD_TABLE = "2994156a-6201-4576-83b4-58f89bedbfce";
const TABLE_URL = `${ORIGIN}/data-v2/${JOBS}`;
const TEST_EMAIL = "test@test.com";
const TEST_PASSWORD = "Password1234#";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD;
if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Missing Supabase / admin environment. This script prints no credential.");
  process.exit(2);
}

const SHOTS = resolve(ROOT, "scripts", "realtime-proof", "shots");
const results = [];
const ok = (m) => {
  results.push(["OK", m]);
  console.log(`  OK   ${m}`);
};
const bad = (m) => {
  results.push(["FAIL", m]);
  console.log(`  FAIL ${m}`);
};
/** Count every read this browser makes, by door name, straight off the wire. */
function countReads(page) {
  const counts = { read_records: 0, read_records_by_ids: 0 };
  page.on("request", (req) => {
    const u = req.url();
    if (!u.includes("/rest/v1/rpc/")) return;
    if (u.endsWith("/rpc/read_records_by_ids")) counts.read_records_by_ids += 1;
    else if (u.endsWith("/rpc/read_records")) counts.read_records += 1;
  });
  return counts;
}

/** Tap the socket before the app opens it, so what is asserted is what THIS browser received. */
const socketTap = () => {
  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = class extends OriginalWebSocket {
    constructor(...args) {
      super(...args);
      this.addEventListener("message", (event) => {
        const d = event.data;
        const hand = (raw) => {
          if (typeof raw === "string" && raw.includes("records.changed")) window.__rt2Notice?.(raw);
        };
        if (typeof d === "string") hand(d);
        else if (d instanceof ArrayBuffer) hand(new TextDecoder().decode(d));
        else if (typeof Blob !== "undefined" && d instanceof Blob) void d.text().then(hand);
      });
    }
  };
};

const rowTexts = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("table tbody tr")).map((r) => r.textContent ?? ""),
  );
const headerTexts = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("table thead th")).map((h) => (h.textContent ?? "").trim()),
  );

async function openBoard(page, who) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await page.goto(TABLE_URL, { waitUntil: "commit", timeout: 150000 });
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`  (${who}: navigation attempt ${attempt} aborted, retrying)`);
      await sleep(5000);
    }
  }
  const settled = await until(`${who}'s grid`, async () => (await rowTexts(page)).length > 0, 120000);
  if (!settled.v) throw new Error(`${who}'s Jobs board never rendered a row`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  // TWO BROWSER CONTEXTS — two cookie jars, two module graphs, two op ledgers. That last one
  // is the whole point: the op ledger lives at module scope, so one context could never prove
  // that Dana's own id is unknown to Marco.
  const danaCtx = await browser.newContext();
  const marcoCtx = await browser.newContext();
  const dana = await danaCtx.newPage();
  const marco = await marcoCtx.newPage();

  const danaNotices = [];
  const marcoNotices = [];
  await dana.exposeFunction("__rt2Notice", (p) => danaNotices.push(p));
  await marco.exposeFunction("__rt2Notice", (p) => marcoNotices.push(p));
  await dana.addInitScript(socketTap);
  await marco.addInitScript(socketTap);
  const danaReads = countReads(dana);
  const marcoReads = countReads(marco);

  try {
    const danaWho = await signIn(dana, ORIGIN, ADMIN_EMAIL, ADMIN_PASSWORD, "Dana");
    const marcoWho = await signIn(marco, ORIGIN, TEST_EMAIL, TEST_PASSWORD, "Marco");
    console.log(`  Dana=${danaWho}   Marco=${marcoWho}\n`);

    for (const [page, who] of [
      [dana, "Dana"],
      [marco, "Marco"],
    ]) {
      await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "commit", timeout: 150000 });
      const how = await setOrganization(page, ORG_NAME);
      console.log(`  (${who} picked ${ORG_NAME} — ${how})`);
      await sleep(2500);
      await openBoard(page, who);
    }
    const startRows = (await rowTexts(marco)).length;
    ok(`both browsers have ${ORG_NAME}'s Jobs board open (${startRows} jobs)`);

    // ── 1. BOTH GRIDS SAY THEY ARE LIVE ─────────────────────────────────────────────────
    const notLive = await Promise.all(
      [dana, marco].map((p) =>
        p.evaluate(() => {
          const m = document.body.innerText.match(/Not live:[^\n]*/);
          return m ? m[0] : null;
        }),
      ),
    );
    if (notLive.some(Boolean)) bad(`a grid still says: "${notLive.find(Boolean)}"`);
    else ok("neither grid prints a \"Not live\" sentence — both ports are bound");

    await sleep(3000); // let both sockets finish joining before anything is counted
    danaReads.read_records = 0;
    danaReads.read_records_by_ids = 0;
    marcoReads.read_records = 0;
    marcoReads.read_records_by_ids = 0;
    danaNotices.length = 0;
    marcoNotices.length = 0;

    // ── 2. DANA ADDS FRIDAY'S CALL-OUT, FROM HER OWN BROWSER ────────────────────────────
    // Through the app's own client — the same `@ai-matrx/records` write that a button calls,
    // which is what mints the `_op_id` this proof turns on.
    const jobNumber = `RPC-${Math.floor(Date.now() / 1000) % 100000}`;
    // THROUGH DANA'S OWN GRID, WHICH IS THE WHOLE POINT. The op ledger lives inside this
    // page's `@ai-matrx/records`, so a write made by a client this script builds would mint an
    // id her bundle has never seen and her port would re-read — proving nothing. She clicks
    // "New record" and types, exactly as a person does.
    const opened = await dana.evaluate(() => {
      const button = Array.from(document.querySelectorAll("button")).find((b) =>
        /^(New record|Add)$/i.test((b.textContent ?? "").trim()),
      );
      if (!button) return false;
      button.scrollIntoView({ block: "center" });
      button.click();
      return true;
    });
    if (!opened) {
      bad('Dana\'s grid has no "New record" control to click');
      throw new Error("no add control");
    }
    await sleep(2500);
    // Fill the first text field the new-record surface offers and commit it.
    const wrote = await dana.evaluate(async (job) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      const fields = Array.from(document.querySelectorAll("input[type='text'], input:not([type])"))
        .filter((el) => el.offsetParent !== null && el.type !== "search");
      if (fields.length === 0) return { error: "the new-record surface offered no text field" };
      setter?.call(fields[0], job);
      fields[0].dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      const save = Array.from(document.querySelectorAll("button")).find((b) =>
        /^(Save|Create|Add|Done)$/i.test((b.textContent ?? "").trim()),
      );
      if (save) save.click();
      else fields[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return { error: null };
    }, jobNumber);

    if (wrote.error) {
      bad(`Dana could not add the job: ${wrote.error}`);
      throw new Error("write failed");
    }

    const grew = await until(
      "the new job in Marco's browser",
      async () => (await rowTexts(marco)).some((t) => t.includes(jobNumber)),
      30000,
    );
    if (grew.v) ok(`Marco's board showed ${jobNumber} ${grew.ms} ms after Dana added it, with no reload`);
    else bad(`Marco's board never showed ${jobNumber}`);

    await sleep(2500); // let any echo Dana's browser was going to act on arrive and be dropped

    // ── 3. THE COUNT, IN BOTH BROWSERS ──────────────────────────────────────────────────
    const danaAfterWrite = { ...danaReads };
    const marcoAfterWrite = { ...marcoReads };
    if (danaAfterWrite.read_records === 0 && danaAfterWrite.read_records_by_ids === 0) {
      ok("Dana's browser made ZERO reads for her own write — it recognised the echo and dropped it");
    } else {
      bad(
        `Dana's browser re-read its own write: ${danaAfterWrite.read_records} page read(s) and ` +
          `${danaAfterWrite.read_records_by_ids} id-set read(s)`,
      );
    }
    if (marcoAfterWrite.read_records_by_ids === 1 && marcoAfterWrite.read_records === 0) {
      ok("Marco's browser made exactly ONE read_records_by_ids and no page read");
    } else {
      bad(
        `Marco's browser made ${marcoAfterWrite.read_records_by_ids} id-set read(s) and ` +
          `${marcoAfterWrite.read_records} page read(s) — expected 1 and 0`,
      );
    }

    // ── 4. A COLUMN ADDED IN DANA'S BROWSER APPEARS IN MARCO'S ──────────────────────────
    const colKey = `permit_${Math.floor(Date.now() / 1000) % 100000}`;
    const colLabel = `Permit ${colKey.slice(-5)}`;
    const declared = await dana.evaluate(
      async ({ url, key, org, table, spec }) => {
        const { createClient } = await import(
          /* webpackIgnore: true */ "https://esm.sh/@supabase/supabase-js@2"
        );
        const raw = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
        const token = raw ? JSON.parse(localStorage.getItem(raw)).access_token : null;
        const c = createClient(url, key, {
          db: { schema: "custom" },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { error } = await c.rpc("field_declare", {
          p_organization_id: org,
          p_table_id: table,
          p_spec: spec,
        });
        return error?.message ?? null;
      },
      { url: SUPABASE_URL, key: SUPABASE_KEY, org: ORG, table: JOBS, spec: { key: colKey, label: colLabel, type: "text" } },
    );
    if (declared) {
      bad(`Dana could not add the column: ${declared}`);
    } else {
      const col = await until(
        "the new column in Marco's browser",
        async () => (await headerTexts(marco)).some((h) => h.includes(colLabel)),
        30000,
      );
      if (col.v) ok(`Marco's board grew the "${colLabel}" column ${col.ms} ms later, with no reload`);
      else bad(`Marco's board never grew the "${colLabel}" column`);
    }

    // ── 5. NOTHING MARCO RECEIVED CARRIED A VALUE ───────────────────────────────────────
    const leaky = marcoNotices.filter(
      (raw) => raw.includes("Thompson Blvd") || raw.includes("water heater") || raw.includes(jobNumber),
    );
    if (marcoNotices.length === 0) bad("no realtime frame reached Marco at all, so clause 5 proves nothing");
    else if (leaky.length === 0)
      ok(`${marcoNotices.length} realtime frame(s) reached Marco and not one carried a value`);
    else bad(`${leaky.length} of ${marcoNotices.length} frames carried the job's own words`);

    // ── 6. A RECORD MARCO MAY NOT SEE NEVER REACHES HIM ─────────────────────────────────
    // 🚨 SAID PLAINLY: on RINCON's own Jobs board there is no such record, and this proof does
    // not pretend otherwise. Marco is a member and the ladder answers `o_all_visible` for him
    // there — every live row of that board is genuinely his. So the hidden record is put where
    // a real wall stands: the OXNARD BRANCH, a company he is not a member of. Writing one there
    // must reach him neither as a row nor as a notice.
    marcoNotices.length = 0;
    marcoReads.read_records = 0;
    marcoReads.read_records_by_ids = 0;
    const sealed = `OXN-SEALED-${Math.floor(Date.now() / 1000) % 100000}`;
    const hidden = await dana.evaluate(
      async ({ url, key, org, table, job }) => {
        const { createClient } = await import(
          /* webpackIgnore: true */ "https://esm.sh/@supabase/supabase-js@2"
        );
        const raw = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
        const token = raw ? JSON.parse(localStorage.getItem(raw)).access_token : null;
        const c = createClient(url, key, {
          db: { schema: "custom" },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data, error } = await c.rpc("record_write", {
          p_organization_id: org,
          p_table_id: table,
          p_data: { _op_id: crypto.randomUUID(), job_number: job, notes: "Sealed bid — Oxnard only." },
        });
        return { id: data ?? null, error: error?.message ?? null };
      },
      { url: SUPABASE_URL, key: SUPABASE_KEY, org: OXNARD_ORG, table: OXNARD_TABLE, job: sealed },
    );
    if (hidden.error) {
      bad(`could not write the Oxnard record the clause needs: ${hidden.error}`);
    } else {
      await sleep(6000);
      const inRows = (await rowTexts(marco)).some((t) => t.includes(sealed));
      const inFrames = marcoNotices.some((raw) => raw.includes(hidden.id) || raw.includes(sealed));
      if (!inRows && !inFrames) {
        ok(
          `a record Marco may not see (${sealed}, Oxnard Branch) reached him neither as a row nor ` +
            `as a notice — and it cost his browser ${marcoReads.read_records} page read(s)`,
        );
      } else {
        bad(
          `the Oxnard record reached Marco: ${inRows ? "it is on his grid" : ""} ${inFrames ? "a frame named it" : ""}`,
        );
      }
    }

    // ── 7. A NON-MEMBER'S SUBSCRIBE IS REFUSED AT THE JOIN ──────────────────────────────
    // Marco's OWN session asks for the Oxnard board's topic. The refusal is the database's, at
    // the join, by the same ladder the read door asks — nothing in the client decides it.
    const verdict = await marco.evaluate(
      async ({ url, key, topic }) =>
        new Promise((done) => {
          void (async () => {
            const { createClient } = await import(
              /* webpackIgnore: true */ "https://esm.sh/@supabase/supabase-js@2"
            );
            const raw = Object.keys(localStorage).find(
              (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
            );
            const token = raw ? JSON.parse(localStorage.getItem(raw)).access_token : null;
            const c = createClient(url, key);
            await c.realtime.setAuth(token);
            const ch = c.channel(topic, { config: { private: true } });
            const t = setTimeout(() => done("TIMED_OUT_WAITING"), 15000);
            ch.subscribe((s) => {
              if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(s)) {
                clearTimeout(t);
                done(s);
              }
            });
          })();
        }),
      { url: SUPABASE_URL, key: SUPABASE_KEY, topic: `custom:table:${OXNARD_TABLE}` },
    );
    if (verdict === "SUBSCRIBED") bad("Marco joined the Oxnard branch's live topic, which he is walled out of");
    else ok(`Marco's subscribe to a company he does not belong to is refused at the join (${verdict})`);

    // ── SCREENSHOTS ─────────────────────────────────────────────────────────────────────
    await dana.screenshot({ path: `${SHOTS}/rt2-dana-writer.png`, fullPage: false });
    await marco.screenshot({ path: `${SHOTS}/rt2-marco-watcher.png`, fullPage: false });
    console.log(`\n  screenshots: scripts/realtime-proof/shots/rt2-{dana-writer,marco-watcher}.png`);

    console.log("\nREQUESTS PER CHANGE, counted off the wire in each browser:");
    console.log(`  Dana (the writer)    read_records ${danaAfterWrite.read_records}   read_records_by_ids ${danaAfterWrite.read_records_by_ids}`);
    console.log(`  Marco (the watcher)  read_records ${marcoAfterWrite.read_records}   read_records_by_ids ${marcoAfterWrite.read_records_by_ids}`);
    console.log(`  before this lane, both browsers read the whole ${startRows}-row page on every change.`);
  } finally {
    await browser.close();
  }

  const failed = results.filter(([s]) => s === "FAIL").length;
  console.log(`\n${failed === 0 ? "ALL GREEN" : `${failed} FAILED`} — ${results.length} clause(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

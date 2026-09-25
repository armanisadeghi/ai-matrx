// LANE S6 — WHAT A CLIENT IS TOLD WHEN THE BUSINESS SWITCHES ITS RECORD STORE OFF.
//
// The office (admin@admin.com, through `platform.unified_data_store_set`, the door its Database
// settings screen calls) turns Rincon Plumbing Co — Ventura Branch's store off; the client
// (test@test.com, signed in from a one-time link) then asks every door her portal pages call —
// portal_form, portal_form_submit, read_records, read_record, record_history, io_comments — and
// opens her portal pages in a headless browser. Every answer must be in a client's words: never a
// door's machine name, never "not taking writes", never the owner's "open Database Settings".
// The store is turned back ON in a finally block whatever happens.
//
//   S6_ORIGIN=http://s6.localhost:3001 S6_SLUG=… S6_CALLS=… S6_CALL=… S6_PORTAL=… S6_FORM=… \
//   [S6_OUT=dir] node scripts/campaign-tests/uichamp_s6_store_off_probe.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(new URL(".", import.meta.url).pathname, "../..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const ORG = "20b9d1bb-ca75-42ea-827b-2500f48e82c2";
const { S6_SLUG: SLUG, S6_CALLS: CALLS, S6_CALL: CALL, S6_PORTAL: PORTAL, S6_FORM: FORM } = process.env;
const ORIGIN = process.env.S6_ORIGIN ?? "http://s6.localhost:3001";
const OUT = process.env.S6_OUT ?? "/tmp/s6-store-off";
fs.mkdirSync(OUT, { recursive: true });
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SECRET = process.env.SUPABASE_SECRET_KEY;
const OWNER_SPEECH = /custom\.|not taking writes|role that owns|open Database Settings|Database Settings for this organization/i;

const clauses = [];
const clause = (name, ok, saw) => {
  clauses.push({ name, ok, saw });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  — saw: ${JSON.stringify(saw).slice(0, 400)}`}`);
};

const owner = createClient(URL_, PUB, { auth: { persistSession: false } });
const a = await owner.auth.signInWithPassword({ email: process.env.AI_ADMIN_USERNAME, password: process.env.AI_ADMIN_PASSWORD });
if (a.data?.user?.email !== "admin@admin.com") throw new Error("owner seat is not admin@admin.com");

async function magic() {
  const r = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: "test@test.com" }),
  });
  const j = await r.json();
  return j.hashed_token ?? j.properties?.hashed_token;
}
const her = createClient(URL_, PUB, { auth: { persistSession: false } });
const v = await her.auth.verifyOtp({ type: "magiclink", token_hash: await magic() });
if (v.data?.user?.email !== "test@test.com") throw new Error("client seat is not test@test.com");

const setStore = async (on) => {
  const { error } = await owner.schema("platform").rpc("unified_data_store_set", {
    p_organization_id: ORG, p_on: on, p_note: on ? "S6 store-off probe: back on" : "S6 store-off probe: what a client is told",
  });
  if (error) throw new Error(`unified_data_store_set(${on}): ${error.message}`);
};

const calls = {
  portal_form: { p_organization_id: ORG, p_portal_id: PORTAL, p_form_id: FORM },
  portal_form_submit: { p_organization_id: ORG, p_portal_id: PORTAL, p_form_id: FORM, p_payload: { unit: "Side gate", gate_code: "1190" }, p_client_key: null },
  read_records: { p_organization_id: ORG, p_table_id: CALLS, p_by_id: false, p_limit: 20, p_offset: 0 },
  read_record: { p_organization_id: ORG, p_record_id: CALL, p_by_id: false },
  record_history: { p_organization_id: ORG, p_record_id: CALL, p_limit: 20, p_offset: 0 },
  io_comments: { p_organization_id: ORG, p_record_id: CALL },
};

const receipt = { ranAt: new Date().toISOString(), doors: {} };
let browser;
try {
  await setStore(false);
  for (const [fn, args] of Object.entries(calls)) {
    const { data, error } = await her.schema("custom").rpc(fn, args);
    const said = error ? [error.message, error.hint].filter(Boolean).join(" | ") : null;
    receipt.doors[fn] = { refused: Boolean(error), code: error?.code ?? null, said, answered: error ? null : data };
    clause(`store off: ${fn} refuses her`, Boolean(error), data);
    clause(`store off: ${fn} speaks to her, not to the owner`, Boolean(said) && !OWNER_SPEECH.test(said), said);
  }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const r = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: "POST", headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: "test@test.com" }),
  });
  const hash = (await r.json()).hashed_token;
  for (const [name, dest] of [["portal", `/portal/c/${SLUG}`], ["record", `/portal/c/${SLUG}/r/${CALL}`], ["form", `/portal/c/${SLUG}/f/${FORM}`]]) {
    const url = name === "portal"
      ? `${ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=magiclink&redirectTo=${encodeURIComponent(dest)}`
      : `${ORIGIN}${dest}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300000 });
    await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
    const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    receipt[`page_${name}`] = t.slice(0, 600);
    clause(`store off: her ${name} page says the store is off, in her words`, /record store off|not open right now/i.test(t) && !OWNER_SPEECH.test(t), t.slice(0, 400));
    clause(`store off: her ${name} page shows none of her records`, !/Boiler room floor drain/.test(t) || name === "record" && false, t.slice(0, 200));
    await page.screenshot({ path: `${OUT}/store-off-${name}-phone-390.png`, fullPage: true });
  }
} finally {
  await setStore(true);
  if (browser) await browser.close();
  fs.writeFileSync(`${OUT}/store-off-probe.json`, JSON.stringify({ ...receipt, clauses }, null, 2));
}
const { data: open } = await owner.schema("custom").rpc("store_is_open", { p_organization_id: ORG });
clause("the store is back on afterwards", open === true, open);
const failed = clauses.filter((c) => !c.ok).length;
console.log(failed ? `${failed} CLAUSE(S) FAILED` : "ALL CLAUSES PASSED");
process.exit(failed ? 1 : 0);

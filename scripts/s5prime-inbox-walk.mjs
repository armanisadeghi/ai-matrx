/**
 * LANE S5-PRIME — the headless walk and REST-per-seat proof on the LIVE database, read-only.
 *
 * Rincon Plumbing Co's inbox, signed in as admin@admin.com through the login form on the shared
 * preview. Before uichamp_s5, 29 of Rincon's pending approvals were about archived tables and sat
 * in this inbox with live Approve buttons. The walk reads the page's own work_inbox answers off
 * the wire and checks: none of the 29 is listed, every row carries the new columns, and the
 * decided view shows them closed with who and when. Then REST per seat (supabase-js, the client
 * door): admin and test@test.com reach work_inbox; anon is refused; approving a withdrawn one is
 * answered already_decided with "That was withdrawn on …" (a refusal — nothing changes).
 *
 *   WITHDRAWN_IDS=<json file> node scripts/s5prime-inbox-walk.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import { signIn, setOrganization, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = "http://s5-prime.localhost:3001";
const ORG_NAME = "Rincon Plumbing Co";
const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-24/s5-prime";
mkdirSync(OUT, { recursive: true });
const withdrawn = new Set(JSON.parse(readFileSync(process.env.WITHDRAWN_IDS, "utf8")));
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const ADMIN = { email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD };
const TEST = { email: "test@test.com", password: process.env.TEST_SEAT_PASSWORD };
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

// ── the browser walk ─────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const answers = [];
page.on("response", async (r) => {
  if (!r.url().includes("/rpc/work_inbox")) return;
  try {
    const req = r.request().postDataJSON?.() ?? JSON.parse(r.request().postData() ?? "{}");
    answers.push({ req, rows: await r.json(), status: r.status() });
  } catch {}
});
try {
  const who = await signIn(page, ORIGIN, ADMIN.email, ADMIN.password, "admin");
  check("signed in as admin@admin.com", who === "admin@admin.com", who);
  await setOrganization(page, ORG_NAME);
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const got = await until("the inbox's own work_inbox answer for Rincon", async () =>
    answers.find((a) => a.req.p_organization_id === ORG && Array.isArray(a.rows)), 120000);
  const first = got.v;
  check("the page asked work_inbox for Rincon and got rows", !!first, first ? `${first.rows.length} rows, HTTP ${first.status}` : "no answer");
  if (first) {
    const leaked = first.rows.filter((r) => withdrawn.has(r.item_id));
    check("none of Rincon's 29 withdrawn approvals is listed as waiting", leaked.length === 0, `${leaked.length} leaked`);
    check("every row carries the new columns", first.rows.every((r) => "table_name" in r && "decided_at" in r && "outcome" in r));
    const approvals = first.rows.filter((r) => r.kind !== "assignment");
    check("every approval listed is pending and actionable", approvals.every((r) => r.state === "pending"), `${approvals.length} approvals`);
  }
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/rincon-inbox-live.png`, fullPage: false });
  // The inbox itself (a slot under the listings on the hub), photographed where it is drawn.
  const inbox = page.locator('[aria-label="Inbox"]').first();
  if (await inbox.count()) {
    await inbox.scrollIntoViewIfNeeded();
    await sleep(800);
    await inbox.screenshot({ path: `${OUT}/rincon-inbox-section.png` });
    const text = (await inbox.innerText()).replace(/\s+/g, " ");
    check("the drawn inbox names none of the archived tables' withdrawn changes as waiting", !/route book|truck binder/i.test(text), text.slice(0, 160));
  } else {
    check("the hub draws the inbox", false, "no [aria-label=Inbox] on /data-v2");
  }
} finally {
  await browser.close();
}

// ── REST per seat (the client door, the published key) ────────────────────────────────────────
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
async function seat(creds) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  if (creds) {
    const { error } = await c.auth.signInWithPassword(creds);
    if (error) throw new Error(`sign-in ${creds.email}: ${error.message}`);
  }
  return c.schema("custom");
}
const admin = await seat(ADMIN);
{
  const { data, error } = await admin.rpc("work_inbox", { p_organization_id: ORG, p_limit: 200, p_offset: 0, p_include_decided: true });
  const closed = (data ?? []).filter((r) => withdrawn.has(r.item_id));
  check("REST admin: decided view lists the withdrawn ones closed, with when and why", !error && closed.length > 0 &&
    closed.every((r) => r.state === "withdrawn" && !r.actionable && r.decided_at && /archived on/.test(r.outcome ?? "")),
    error ? error.message : `${closed.length} closed; e.g. "${closed[0]?.outcome}"`);
  const one = [...withdrawn][0];
  const d = await admin.rpc("work_decide_many", { p_organization_id: ORG, p_decisions: [{ item: one, decision: "approve" }] });
  const v = d.data?.results?.[0];
  check("REST admin: approving a withdrawn one is refused, and says why", !d.error && v?.verdict === "already_decided" && /^That was withdrawn on/.test(v?.sentence ?? ""),
    d.error ? d.error.message : `${v?.verdict}: "${v?.sentence}"`);
}
if (TEST.password) {
  const test = await seat(TEST);
  const { data, error } = await test.rpc("work_inbox", { p_organization_id: "8cb71c8b-5b49-4563-a5fe-d77ff600f8ee", p_limit: 50, p_offset: 0, p_include_decided: false });
  check("REST test@test.com: reaches work_inbox in her own organization", !error, error ? error.message : `${data.length} rows`);
  // She is a member of Rincon too: her Rincon inbox lists none of the withdrawn ones either.
  const mine = await test.rpc("work_inbox", { p_organization_id: ORG, p_limit: 200, p_offset: 0, p_include_decided: false });
  check("REST test@test.com: her Rincon inbox lists none of the withdrawn ones", !mine.error && (mine.data ?? []).every((x) => !withdrawn.has(x.item_id)),
    mine.error ? mine.error.message : `${mine.data.length} rows`);
  // Rincon's Ojai Branch is an organization she is not in.
  const r = await test.rpc("work_inbox", { p_organization_id: "ca0c5df9-462f-4ff3-a423-77eeb0c7f00b", p_limit: 50, p_offset: 0, p_include_decided: false });
  // ACCESS IS PERSONAL: the door lets a person ask any organization for what is HERS there (an
  // item shared to her, an approval addressed to her); where she holds nothing it answers nothing.
  check("REST test@test.com: in an organization she is not in, nothing of theirs is shown", !!r.error || (r.data ?? []).length === 0,
    r.error ? `${r.error.code} ${r.error.message}` : `${r.data.length} rows`);
}
{
  const anon = await seat(null);
  const { error } = await anon.rpc("work_inbox", { p_organization_id: ORG, p_limit: 5, p_offset: 0, p_include_decided: false });
  check("REST anon: refused", !!error, error ? `${error.code} ${error.message}` : "answered");
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

/**
 * LANE S5-PRIME-2 — REST per seat on the LIVE database, through the client door (supabase-js),
 * for the per-person inbox state: snooze / unsnooze / clear / unclear / counts.
 *
 * Every write here is one person's OWN inbox state about an item already in their inbox, and every
 * one is put back before the script ends (snooze → unsnooze). Nothing about an approval or a record
 * is written. Seats: admin@admin.com (AI_ADMIN_* in .env.local), test@test.com (TEST_SEAT_PASSWORD),
 * anon.
 *
 *   TEST_SEAT_PASSWORD=… node scripts/s5prime2-inbox-rest.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const seat = async (email, password) => {
  const c = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c.schema("custom");
};

const anon = createClient(URL_, KEY, { auth: { persistSession: false } }).schema("custom");
const admin = await seat(env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD);
const test = await seat("test@test.com", process.env.TEST_SEAT_PASSWORD);

// ── anon is refused every door ───────────────────────────────────────────────────────────────
{
  const { error } = await anon.rpc("inbox_counts", {});
  check("anon: inbox_counts refused", !!error && /permission denied|42501/.test(`${error.code} ${error.message}`), `${error?.code} ${error?.message}`);
  const s = await anon.rpc("inbox_snooze", { p_organization_id: "00000000-0000-0000-0000-000000000000", p_item_id: "00000000-0000-0000-0000-000000000000", p_until: new Date(Date.now() + 3600e3).toISOString() });
  check("anon: inbox_snooze refused", !!s.error && /permission denied|42501/.test(`${s.error.code} ${s.error.message}`), `${s.error?.code}`);
}

// ── each seat counts its own inbox across every organization it belongs to ───────────────────
const countsOf = async (c, who) => {
  const { data, error } = await c.rpc("inbox_counts", {});
  check(`${who}: inbox_counts (every organization of theirs)`, !error && Array.isArray(data), error ? error.message : `${data.length} organizations, ${data.reduce((a, r) => a + r.waiting, 0)} waiting`);
  return data ?? [];
};
const adminCounts = await countsOf(admin, "admin");
const testCounts = await countsOf(test, "test");

// ── the badge's number is the inbox's number, per organization ───────────────────────────────
for (const [c, who, counts] of [[admin, "admin", adminCounts], [test, "test", testCounts]]) {
  const row = counts.find((r) => r.waiting > 0 && r.waiting < 200);
  if (!row) continue;
  const { data, error } = await c.rpc("work_inbox", { p_organization_id: row.organization_id, p_limit: 200 });
  check(`${who}: work_inbox in ${row.organization_name} lists exactly the badge's ${row.waiting}`, !error && data.length === row.waiting, error ? error.message : `${data.length} rows`);
}

// ── one shared item: admin snoozes it, test still sees it; then it is put back ────────────────
let shared = null;
for (const row of adminCounts.filter((r) => testCounts.some((t) => t.organization_id === r.organization_id))) {
  const a = await admin.rpc("work_inbox", { p_organization_id: row.organization_id, p_limit: 200 });
  const t = await test.rpc("work_inbox", { p_organization_id: row.organization_id, p_limit: 200 });
  const both = (a.data ?? []).find((i) => (t.data ?? []).some((j) => j.item_id === i.item_id));
  if (both) { shared = { org: row.organization_id, name: row.organization_name, item: both }; break; }
}
if (!shared) {
  check("a shared item exists for the one-person-only clause", false, "no item sits in both inboxes");
} else {
  const until = new Date(Date.now() + 2 * 86400e3).toISOString();
  const s = await admin.rpc("inbox_snooze", { p_organization_id: shared.org, p_item_id: shared.item.item_id, p_until: until });
  check(`admin: snoozes "${shared.item.title}" in ${shared.name}`, !s.error && s.data?.state === "snoozed", s.error?.message ?? s.data?.sentence);
  const a = await admin.rpc("work_inbox", { p_organization_id: shared.org, p_limit: 200 });
  check("admin: it left admin's inbox", !a.error && !a.data.some((i) => i.item_id === shared.item.item_id));
  const as = await admin.rpc("work_inbox", { p_organization_id: shared.org, p_limit: 200, p_view: "snoozed" });
  check("admin: it is in admin's snoozed view with its time and snoozed_count", !as.error && as.data.some((i) => i.item_id === shared.item.item_id && i.snoozed_until && i.snoozed_count >= 1));
  const t = await test.rpc("work_inbox", { p_organization_id: shared.org, p_limit: 200 });
  check("test: one person's snooze is invisible to the other — it is still in test's inbox", !t.error && t.data.some((i) => i.item_id === shared.item.item_id));
  const tu = await test.rpc("inbox_unsnooze", { p_organization_id: shared.org, p_item_id: shared.item.item_id });
  check("test: cannot take admin's snooze off (changes nothing of admin's)", !tu.error && tu.data?.changed === false, tu.error?.message ?? tu.data?.sentence);
  const u = await admin.rpc("inbox_unsnooze", { p_organization_id: shared.org, p_item_id: shared.item.item_id });
  check("admin: puts it back", !u.error && u.data?.changed === true, u.error?.message ?? u.data?.sentence);
  const a2 = await admin.rpc("work_inbox", { p_organization_id: shared.org, p_limit: 200 });
  check("admin: it is back in admin's inbox", !a2.error && a2.data.some((i) => i.item_id === shared.item.item_id));
  if (shared.item.kind !== "assignment" && shared.item.state === "pending") {
    const c = await admin.rpc("inbox_clear", { p_organization_id: shared.org, p_item_id: shared.item.item_id });
    check("admin: clearing a decision still owed is refused by name", !!c.error && /needs a decision/.test(c.error.message), c.error?.message);
  }
}

// ── an invented id is refused, the same for everybody ─────────────────────────────────────────
{
  const org = adminCounts[0]?.organization_id;
  if (org) {
    const s = await admin.rpc("inbox_snooze", { p_organization_id: org, p_item_id: "7b0c7d4e-2f59-4a5b-9d47-1f2a0e5c9a31", p_until: new Date(Date.now() + 3600e3).toISOString() });
    check("admin: snoozing an id not in the inbox is refused by name", !!s.error && /nothing in your inbox/.test(s.error.message), s.error?.message);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

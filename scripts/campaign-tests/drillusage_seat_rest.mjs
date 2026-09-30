/**
 * DRILL-USAGE-PAGE — the questions /administration/usage asks, from admin@admin.com's seat over
 * PostgREST with the admin lane open (the header the app's browser client stamps on
 * /administration/**), exactly as the page asks them. Read-only except `platform.ai_usage_recount`
 * of the last two hours (a derived rollup, rebuilt from the ledger).
 *
 *   node scripts/campaign-tests/drillusage_seat_rest.mjs
 *
 * Checks each of the page's screens answers, that every grouped answer's groups + Other add up to
 * its total, that the same seat WITHOUT the admin lane is refused, and times each door.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const aidreamEnv = Object.fromEntries(
  readFileSync(new URL("../../../aidream/.env", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const EMAIL = env.AI_ADMIN_USERNAME ?? aidreamEnv.AI_ADMIN_USERNAME;
const PASSWORD = env.AI_ADMIN_PASSWORD ?? aidreamEnv.AI_ADMIN_PASSWORD;
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace (the seat's own organization)
const SRC = { kind: "entity", token: "ai_usage" };
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const seat = async (headers) => {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false }, global: { headers } });
  const { data, error } = await c.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`sign-in: ${error.message}`);
  return { c, email: data.user.email };
};
const admin = await seat({ "x-matrx-admin-lane": "1" });
check("seat is admin@admin.com", admin.email === "admin@admin.com", admin.email);
const outside = await seat({});
const day = 86_400_000;
const w = (days) => ({ key: "at", from: new Date(Date.now() - days * day).toISOString(), to: new Date().toISOString() });

async function ask(client, question) {
  const t0 = Date.now();
  const { data, error } = await client.schema("platform").rpc("drill_ask", { p_organization_id: ORG, p_source: SRC, p_question: { lane: "platform", ...question } });
  return { data, error, ms: Date.now() - t0 };
}
const total = (rows) => rows.find((r) => r.kind === "total" && (!r.groups || Object.keys(r.groups).length === 0));
const addsUp = (rows, m = "cost") => {
  const t = Number(total(rows)?.measures?.[m] ?? 0);
  const s = rows.filter((r) => r.kind === "group" || r.kind === "other").reduce((a, r) => a + Number(r.measures?.[m] ?? 0), 0);
  return Math.abs(t - s) < 1e-6 ? null : `groups+other ${s} total ${t}`;
};

const { data: names } = await admin.c.schema("platform").rpc("ai_usage_names", { p_organization_id: ORG, p_ids: {} });
check("names door: freshness", Boolean(names?.counted_through), `counted through ${names?.counted_through}`);
const r0 = Date.now();
const { data: rc, error: rce } = await admin.c.schema("platform").rpc("ai_usage_recount", { p_organization_id: ORG, p_from: new Date(Date.now() - 2 * 3_600_000).toISOString(), p_to: new Date().toISOString() });
check("recount the last 2 hours", !rce, rce ? rce.message : `${rc?.rows} rows in ${Date.now() - r0} ms (server ${rc?.ms} ms)`);

const screens = [
  ["1 usage by person, 30 days", { by: ["person"], show: ["cost", "requests", "tokens_in", "tokens_out"], window: w(30), sort: { key: "cost", direction: "desc" } }],
  ["2 one person by day", { by: ["at:day"], show: ["cost"], where: { person: "87a6e699-3622-4869-8843-d0867456c0dd" }, window: w(30) }],
  ["3 by organization", { by: ["organization"], show: ["cost", "people"], window: w(30), sort: { key: "cost", direction: "desc" } }],
  ["4 one organization by person", { by: ["person"], show: ["cost"], where: { organization: ORG }, window: w(30), sort: { key: "cost", direction: "desc" } }],
  ["5 by provider", { by: ["provider"], show: ["cost", "calls"], window: w(30), sort: { key: "cost", direction: "desc" } }],
  ["6 model within anthropic", { by: ["model"], show: ["cost", "tokens_in", "tokens_cached"], where: { provider: "anthropic" }, window: w(30), sort: { key: "cost", direction: "desc" } }],
  ["7 app then feature", { by: ["app", "feature"], show: ["cost"], window: w(30), sort: { key: "cost", direction: "desc" } }],
  ["8 month over all time", { by: ["at:month"], show: ["cost", "calls"] }],
  ["9 manual/automated × origin", { by: ["trigger", "origin"], show: ["cost"], window: w(30) }],
  ["10 person × month (pivot crossing)", { by: ["person", "at:month"], show: ["cost"], window: w(365), sort: { key: "cost", direction: "desc" } }],
  ["11 day series", { by: ["at:day"], show: ["cost"], window: w(30) }],
  ["12 provider vs previous 90 days", { by: ["provider"], show: ["cost"], window: w(90), compare: { against: "previous_period", from: w(90).from, to: w(90).to } }],
];
for (const [name, q] of screens) {
  const got = await ask(admin.c, q);
  if (got.error) {
    check(name, false, got.error.message);
    continue;
  }
  const bad = addsUp(got.data);
  const groups = got.data.filter((r) => r.kind === "group").length;
  check(name, !bad && groups > 0, bad ?? `${groups} groups, total $${Number(total(got.data)?.measures?.cost ?? 0).toFixed(2)}, ${got.ms} ms`);
}
const refused = await ask(outside.c, { by: ["person"], show: ["cost"] });
check("the same admin OUTSIDE the admin apps is refused", refused.error?.code === "42501", refused.error?.message ?? "answered");
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

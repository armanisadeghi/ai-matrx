/**
 * DRILL-STANDARD-DOOR — the drill doors from a REAL seat, over PostgREST (the client door).
 *
 * Signs in as test@test.com (the non-admin seat) and admin@admin.com with supabase-js and asks
 * platform.drill_describe / drill_ask / drill_rows exactly as a browser does. The oracle for every
 * number is a plain PostgREST count of the same table by the same seat — what she can open.
 * Read-only: it writes nothing anywhere.
 *
 *   TEST_SEAT_PASSWORD=… node scripts/campaign-tests/drillstd_seat_rest.mjs
 *
 * Checks: (1) her ask total = her rows total = her plain count, in each of her organizations, for
 * an inferred standard table (agent) and a declared fact (agents_by_model); (2) shown groups +
 * Other = total under a cap; (3) an organization she is not in, and the platform lane, are refused;
 * (4) admin inside the admin apps (x-matrx-admin-lane) counts every row the admin lane opens, and
 * outside them is refused; (5) timing: median of 5 end-to-end calls per door, budget 1500 ms.
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
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const seat = async (email, password, headers = {}) => {
  const c = createClient(URL_, KEY, { auth: { persistSession: false }, global: { headers } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { c, uid: data.user.id };
};
if (!process.env.TEST_SEAT_PASSWORD) throw new Error("TEST_SEAT_PASSWORD is required (the test@test.com seat)");

const test = await seat("test@test.com", process.env.TEST_SEAT_PASSWORD);
const platform = test.c.schema("platform");
const ask = async (c, org, source, question) => {
  const { data, error } = await c.schema("platform").rpc("drill_ask", { p_organization_id: org, p_source: source, p_question: question });
  return { data, error };
};
const totalOf = (rows) => rows?.find((r) => r.kind === "total" && (!r.groups || Object.keys(r.groups).length === 0));

// her organizations (the membership list she herself reads)
const { data: orgRows, error: orgErr } = await test.c.schema("iam").rpc("my_orgs");
const orgs = orgErr ? [] : (Array.isArray(orgRows) ? orgRows : []).map((r) => (typeof r === "string" ? r : r.my_orgs ?? Object.values(r)[0]));
check("her organizations are readable", orgs.length > 0, orgErr ? orgErr.message : `${orgs.length} organizations`);

// (1) leakage
let fails = [];
let n = 0;
for (const org of orgs) {
  const { count: plain, error: pErr } = await test.c.schema("agent").from("definition").select("id", { count: "exact", head: true })
    .eq("organization_id", org).is("deleted_at", null);
  if (pErr) { fails.push(`${org} plain: ${pErr.message}`); continue; }
  for (const token of ["agent", "agents_by_model"]) {
    n++;
    const a = await ask(test.c, org, { kind: "entity", token }, { by: [], show: ["count"] });
    const r = await platform.rpc("drill_rows", { p_organization_id: org, p_source: { kind: "entity", token }, p_question: { limit: 1 } });
    const t = totalOf(a.data)?.measures?.count;
    if (a.error || r.error || t !== plain || r.data?.total !== plain) {
      fails.push(`${org}/${token}: ask=${t ?? a.error?.message} rows=${r.data?.total ?? r.error?.message} plain=${plain}`);
    }
  }
}
check("(1) her ask total = rows total = her plain count, every organization x 2 sources", fails.length === 0 && n > 0, `${n} checks; ${fails.join(" | ")}`);

// (2) the cap
const ORG = orgs.includes("884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f") ? "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f" : orgs[0];
{
  const a = await ask(test.c, ORG, { kind: "entity", token: "agents_by_model" }, { by: ["model"], show: ["count"], limit: 2 });
  const shown = (a.data ?? []).filter((r) => r.kind === "group");
  const other = (a.data ?? []).find((r) => r.kind === "other");
  const total = totalOf(a.data);
  const sum = shown.reduce((s, r) => s + r.measures.count, 0) + (other?.measures.count ?? 0);
  check("(2) shown groups + Other = total, and the total says the cut", !a.error && shown.length <= 2 && sum === total?.measures.count && (!other || /Other/.test(total?.says ?? "")),
    a.error ? a.error.message : `${shown.length} shown + other ${other?.measures.count ?? 0} = ${sum} of ${total?.measures.count}; ${total?.says ?? ""}`);
}

// (3) refusals
{
  const outside = await ask(test.c, "39c38960-d30c-4840-b0c1-c9960de95582", { kind: "entity", token: "agent" }, { by: [] });
  check("(3a) an organization she is not in is refused", orgs.includes("39c38960-d30c-4840-b0c1-c9960de95582") || outside.error?.code === "42501", outside.error?.code ?? "answered");
  const plat = await ask(test.c, ORG, { kind: "entity", token: "agent" }, { by: [], lane: "platform" });
  check("(3b) the platform lane is refused to a member", plat.error?.code === "42501", plat.error?.code ?? "answered");
}

// (4) admin, inside and outside the admin apps
{
  const outside = await seat(env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD);
  const o = await ask(outside.c, ORG, { kind: "entity", token: "agent" }, { by: [], lane: "platform" });
  check("(4a) admin outside the admin apps: platform lane refused", o.error?.code === "42501", o.error?.code ?? "answered");
  const inside = await seat(env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, { "x-matrx-admin-lane": "1" });
  const i = await ask(inside.c, ORG, { kind: "entity", token: "agent" }, { by: [], lane: "platform" });
  const { count } = await inside.c.schema("agent").from("definition").select("id", { count: "exact", head: true }).is("deleted_at", null);
  check("(4b) admin inside the admin apps: platform lane = every row the admin lane opens", !i.error && totalOf(i.data)?.measures.count === count,
    i.error ? i.error.message : `ask ${totalOf(i.data)?.measures.count} plain ${count}`);
}

// (5) timing, end to end through PostgREST
{
  const calls = {
    "describe agent": () => platform.rpc("drill_describe", { p_organization_id: ORG, p_source: { kind: "entity", token: "agent" } }),
    "ask agent by kind": () => ask(test.c, ORG, { kind: "entity", token: "agent" }, { by: ["agent_type"] }),
    "ask agents_by_model by provider": () => ask(test.c, ORG, { kind: "entity", token: "agents_by_model" }, { by: ["provider"], show: ["count", "people", "model_context"] }),
    "ask agent pivot": () => ask(test.c, ORG, { kind: "entity", token: "agent" }, { by: ["agent_type"], across: "created_at:month" }),
    "rows agent": () => platform.rpc("drill_rows", { p_organization_id: ORG, p_source: { kind: "entity", token: "agent" }, p_question: { limit: 50 } }),
  };
  const lines = [];
  let worst = 0;
  for (const [name, fn] of Object.entries(calls)) {
    const ms = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const r = await fn();
      if (r.error) { lines.push(`${name}: ${r.error.message}`); worst = Infinity; break; }
      ms.push(performance.now() - t0);
    }
    ms.sort((a, b) => a - b);
    const med = ms[2] ?? Infinity;
    worst = Math.max(worst, med);
    lines.push(`${name} ${Math.round(med)} ms`);
  }
  check("(5) every drill door answers the seat under 1500 ms end to end (median of 5)", worst < 1500, lines.join("; "));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

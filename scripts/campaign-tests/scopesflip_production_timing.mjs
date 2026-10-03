#!/usr/bin/env node
/**
 * LANE 9 SCOPES-ON-THE-STORE (the flip) — the scope doors' timing as each test seat sees it, through PostgREST.
 *
 *   node scripts/campaign-tests/scopesflip_production_timing.mjs [--target production|clone] [--runs 7]
 *
 * Read only: signs in as admin@admin.com and test@test.com (credentials from .env.local / .env, never printed) and
 * calls, as that person, custom.context_archived_types (Cedar Ridge Physical Therapy), custom.context_tree_types
 * (her organizations, no counts), custom.context_tree_type_scopes (the largest type, 200) and
 * custom.context_tree_search ("therapy"), one warm-up then RUNS timed calls each; prints first, median and all.
 * Measures, never gates (the acceptance's budgets are printed beside each line).
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "..");
const require = createRequire(resolve(ROOT, "package.json"));
const { createClient } = require("@supabase/supabase-js");
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const target = arg("--target", "production");
const RUNS = Number(arg("--runs", 7));
const env = {};
for (const f of target === "clone" ? [".env.clone.local", ".env.local", ".env"] : [".env.local", ".env"]) {
  const p = resolve(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
for (const [seat, user, pass, budgetTypes] of [
  ["test@test.com", env.AI_MEMBER_USERNAME, env.AI_MEMBER_PASSWORD, 100],
  ["admin@admin.com", env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, 300],
]) {
  const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who, error } = await c.auth.signInWithPassword({ email: user, password: pass });
  if (error) throw new Error(`sign-in refused for ${seat}: ${error.message}`);
  // Her organizations, as the web asks them (membershipsService.forUser → public.mbr_for_user).
  void who;
  const { data: mem, error: mErr } = await c.rpc("mbr_for_user", { p_container_type: "organization" });
  if (mErr) throw new Error(`memberships for ${seat}: ${mErr.message}`);
  const all = [...new Set(mem.map((m) => m.container_id ?? m.organization_id))].filter(Boolean);
  // …minus the archived ones, as getScopeTree's liveOrgIds drops them.
  const { data: live, error: oErr } = await c.schema("iam").from("organizations").select("id, archived_at").in("id", all);
  if (oErr) throw new Error(`organizations for ${seat}: ${oErr.message}`);
  const orgs = live.filter((o) => !o.archived_at).map((o) => o.id);
  const types = await c.schema("custom").rpc("context_tree_types", { p_organization_ids: orgs, p_with_counts: true });
  const biggest = (types.data?.types ?? []).sort((a, b) => Number(b.scope_count ?? 0) - Number(a.scope_count ?? 0))[0];
  const calls = [
    ["context_archived_types (Cedar Ridge)", () => c.schema("custom").rpc("context_archived_types", { p_organization_id: ORG }), "old body ≤ 700, aim ≤ 300"],
    [`context_tree_types no counts (${orgs.length} orgs)`, () => c.schema("custom").rpc("context_tree_types", { p_organization_ids: orgs, p_with_counts: false }), `≤ ${budgetTypes}`],
    [`context_tree_type_scopes 200 (${biggest?.label_plural ?? "?"}, ${biggest?.scope_count ?? "?"})`, () => c.schema("custom").rpc("context_tree_type_scopes", { p_scope_type_id: biggest?.id ?? null, p_offset: 0, p_limit: 200 }), "≤ 150"],
    ['context_tree_search "therapy"', () => c.schema("custom").rpc("context_tree_search", { p_organization_ids: orgs, p_query: "therapy", p_limit: 100 }), "≤ 200"],
  ];
  for (const [name, call, budget] of calls) {
    const ms = [];
    let failed = null, size = null;
    for (let i = 0; i <= RUNS; i++) {
      const t0 = performance.now();
      const r = await call();
      const t = performance.now() - t0;
      if (r.error) { failed = `${r.error.code} ${r.error.message}`; break; }
      if (i === 0) size = Array.isArray(r.data) ? r.data.length : JSON.stringify(r.data).length;
      ms.push(t);
    }
    console.log(failed
      ? `${seat} ${name}: FAILED ${failed}`
      : `${seat} ${name}: first ${ms[0].toFixed(0)} ms, median of ${RUNS} warm ${median(ms.slice(1)).toFixed(0)} ms (${budget}); size ${size}; all ${ms.slice(1).map((x) => x.toFixed(0)).join(" ")}`);
  }
}

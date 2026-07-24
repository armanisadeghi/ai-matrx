#!/usr/bin/env tsx
/**
 * Shared Knowledge DRIFT GUARDS — `pnpm check:access-drift`
 *
 * Four loud, non-blocking guards (wired like `pnpm check:schema`; --strict
 * exits 1) that make the cascade failure class extinct:
 *
 *   1. EDGE COVERAGE — every live data_store member whose kind has a
 *      registered conveying rule has its association edge, every conveying
 *      edge has its reachability row, and no member kind is silently
 *      unruled ("the trigger stopped firing" / "a new member kind forgot
 *      its edge").
 *   2. JUDGE/RLS AGREEMENT — for the default store's tree, the kernel judge
 *      (`has_access_as`) must agree with what RLS actually returns to a
 *      real user JWT (the rag.data_stores judge-yes/RLS-zero bug class).
 *   3. DEAD POLICY — an RLS policy exists for authenticated but the role
 *      lacks schema USAGE or any SELECT privilege (the processed_documents
 *      near-miss; also the recurring schema-move USAGE-grant gap).
 *   4. REGISTRY CYCLES — type-level cycles in platform.entity_relationships
 *      and row-level parent-chain loops in self-containment tables, either
 *      of which would stack-overflow `has_access_for_base` at RLS time.
 *
 * SQL side lives in public.access_drift_report()
 * (migrations/access_matrix_probe_helpers.sql).
 */

import process from "node:process";
import { C, loadEnv, mintUserJwt, rlsCount, rpc, type Env } from "./lib";

const STRICT = process.argv.includes("--strict");

const DEFAULT_STORE = "0158e878-1bab-4c91-9597-da4e8951c2a7";
const ENTITLED = "77c6af70-a35e-4724-a304-64a0dd789674";

/** Policies that LOOK dead but are intentional. Every entry needs a reason. */
const DEAD_POLICY_ALLOWLIST: { schema: string; table: string; policy: string; reason: string }[] = [
  { schema: "billing", table: "stripe_event", policy: "stripe_event_no_access", reason: "deliberate deny-all policy — webhook-only table" },
  { schema: "cron", table: "job", policy: "cron_job_policy", reason: "pg_cron extension schema; not app-facing" },
  { schema: "cron", table: "job_run_details", policy: "cron_job_run_details_policy", reason: "pg_cron extension schema; not app-facing" },
];

interface DriftReport {
  members_missing_edge: unknown[];
  unruled_member_kinds: string[];
  edges_missing_reachability: number;
  dead_policies: { schema: string; table: string; policy: string; cmd: string; missing: string }[];
  registry_cycles: unknown[];
  row_cycles: unknown[];
  orphan_members: unknown[];
}

interface Tree {
  store: { id: string } | null;
  files: string[];
  docs: { id: string; archived: boolean }[];
}

async function main(): Promise<number> {
  const env = loadEnv();
  if (!env) {
    console.log(`${C.yellow}[WARN]${C.reset} access-drift: Supabase creds absent — skipped.`);
    return 0;
  }
  let findings = 0;
  const fail = (msg: string): void => {
    findings += 1;
    console.log(`  ${C.red}DRIFT${C.reset} ${msg}`);
  };
  const pass = (msg: string): void => console.log(`  ${C.green}OK${C.reset} ${msg}`);

  console.log(`${C.bold}Shared Knowledge drift guards${C.reset}\n`);
  const r = await rpc<DriftReport>(env, "access_drift_report", {});

  // 1. Edge coverage
  if (r.members_missing_edge.length > 0) fail(`edge coverage: ${r.members_missing_edge.length} live member(s) missing their association edge: ${JSON.stringify(r.members_missing_edge)}`);
  else pass("edge coverage: every ruled member has its edge");
  if (r.unruled_member_kinds.length > 0) {
    // Deliberately-not-shareable kinds are documented in features/rag/FEATURE.md.
    const documented = new Set(["project", "task", "research", "scraped"]);
    const undocumented = r.unruled_member_kinds.filter((k) => !documented.has(k));
    if (undocumented.length > 0) fail(`unruled member kinds NOT documented as not-library-shareable: ${undocumented.join(", ")}`);
    else pass(`unruled member kinds present but documented (${r.unruled_member_kinds.join(", ")})`);
  } else pass("no unruled member kinds");
  if (r.edges_missing_reachability > 0) fail(`${r.edges_missing_reachability} conveying edge(s) have NO reachability row — closure is stale (run platform.rebuild_reachability())`);
  else pass("every conveying edge has its reachability row");
  if (r.orphan_members.length > 0) fail(`orphan members outlived their files: ${JSON.stringify(r.orphan_members)}`);
  else pass("no orphan members");

  // 2. Judge/RLS agreement (real JWT, real rows)
  try {
    const tree = await rpc<Tree>(env, "access_matrix_tree", { p_store: DEFAULT_STORE });
    const jwt = await mintUserJwt(env, ENTITLED);
    const samples: { type: string; id: string; schema: string; table: string }[] = [
      { type: "data_store", id: DEFAULT_STORE, schema: "rag", table: "data_stores" },
      ...(tree?.files ?? []).map((f) => ({ type: "file", id: f, schema: "files", table: "files" })),
    ];
    let disagreements = 0;
    for (const s of samples) {
      const judge = await rpc<boolean>(env, "has_access_as", { p_user: ENTITLED, p_type: s.type, p_id: s.id, p_required: "viewer" });
      const rows = await rlsCount(env, jwt, s.schema, s.table, `id=eq.${s.id}`);
      if (rows === -1) { fail(`judge/RLS: could not read ${s.schema}.${s.table} as user (schema exposed?)`); continue; }
      if (judge !== rows > 0) { disagreements += 1; fail(`judge/RLS DISAGREE on ${s.type} ${s.id}: judge=${judge}, RLS rows=${rows}`); }
    }
    if (disagreements === 0) pass(`judge/RLS agree on ${samples.length} sampled row(s)`);
  } catch (err) {
    fail(`judge/RLS agreement probe crashed: ${String(err)}`);
  }

  // 3. Dead policies
  const dead = r.dead_policies.filter(
    (p) => !DEAD_POLICY_ALLOWLIST.some((a) => a.schema === p.schema && a.table === p.table && a.policy === p.policy),
  );
  if (dead.length > 0) {
    fail(`${dead.length} dead polic(ies) — policy exists but authenticated lacks the privilege (schema-move USAGE gap class):`);
    for (const p of dead) console.log(`        ${C.yellow}${p.schema}.${p.table}${C.reset} ${p.policy} (${p.cmd}) — missing ${p.missing}`);
  } else pass("no dead policies outside the allowlist");

  // 4. Registry cycles
  if (r.registry_cycles.length > 0) fail(`type-level registry cycles: ${JSON.stringify(r.registry_cycles)}`);
  else pass("no type-level registry cycles");
  if (r.row_cycles.length > 0) fail(`ROW-level containment cycles (would stack-overflow RLS): ${JSON.stringify(r.row_cycles)}`);
  else pass("no row-level containment cycles");

  console.log("");
  if (findings > 0) {
    console.error(`${C.red}${C.bold}ACCESS DRIFT: ${findings} finding(s).${C.reset} Loud, non-blocking; --strict exits 1.`);
    return STRICT ? 1 : 0;
  }
  console.log(`${C.green}${C.bold}ACCESS DRIFT CLEAN${C.reset}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${C.red}[FAIL]${C.reset} access-drift crashed: ${String(err)}`);
    process.exit(STRICT ? 1 : 0);
  });

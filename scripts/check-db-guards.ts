#!/usr/bin/env npx tsx
/**
 * DB guard liveness — are the platform event triggers actually BOUND?
 *
 * A guard's function body is not proof of anything. `pg_event_trigger` is the
 * only proof (db-rules FEATURE.md §1). This gate exists because of a known,
 * already-realised killer failure mode:
 *
 *   `CREATE EVENT TRIGGER` needs superuser, so a project restore silently
 *   skips every one. Between the changeover and 2026-08-20 the functions
 *   `platform._ddl_guard()`, `_bound_ddl_lock_wait()`,
 *   `_graveyard_outbound_fk_guard()`, `sync_entity_types_on_ddl()` and
 *   `flag_entity_types_on_drop()` all existed and NONE of them was bound.
 *   Nothing errored. Nothing warned. The registry's text columns silently
 *   rotted for weeks and every hand-rolled entity table sailed through.
 *
 * Since 2026-08-21 `ddl_guard` also hard-ERRORs on entity-looking tables
 * created outside `platform.create_entity_table`, so a silently-dropped
 * binding now also means that block is gone. Hence: blocking gate, both repos
 * (the aidream half lives in aidream/scripts/release.sh).
 *
 * A DISABLED trigger fails just like a missing one — the sanctioned escape
 * hatch is `ALTER EVENT TRIGGER ddl_guard DISABLE; <DDL>; ... ENABLE;` inside
 * ONE transaction, so a guard left disabled at rest is a mistake, not a state.
 *
 * SECOND DETECTOR — THE PLANNER MUST NEVER RUN THE ACCESS WALK.
 *
 * On 2026-08-24 every authenticated read of `files.folders` and `files.files`
 * returned HTTP 500 / SQLSTATE 57014 (statement timeout). Nothing was slow to
 * EXECUTE — a bare `EXPLAIN` (plan only, zero rows touched) took 14,254 ms and
 * read 296,867 buffers, while execution took 4.7 ms. The cause: the generated
 * RLS policy carried its parent-cascade arms as
 *
 *     <fk> in (select unnest(iam.accessible_entity_ids('<type>', ...)))
 *     <fk> = any(iam.accessible_entity_ids('<type>', ...))
 *
 * `unnest` has a planner support function, and `= ANY (array)` is costed by
 * scalararraysel; BOTH call estimate_expression_value(), which deliberately
 * const-folds STABLE functions. So Postgres EXECUTED the recursive, security-
 * definer access walk during PLANNING of every single statement — including the
 * overwhelming case where the row's own `created_by = auth.uid()` arm short-
 * circuits first and those subplans are never executed at all.
 *
 * The fix routes the array through `iam.unnest_uuids`, a set-returning function
 * with NO support function, so the planner cannot reach inside it. This detector
 * asserts no policy ever goes back. It is a POLICY-SHAPE check, not a timing
 * check: it is deterministic, cheap, and cannot false-positive on a slow day.
 *
 *   pnpm check:db-guards            # loud, non-blocking (exit 0)
 *   pnpm check:db-guards --strict   # exit 1 when a guard is missing/disabled
 *
 * Exit codes: 0 clean (or creds absent) · 1 missing/disabled AND --strict
 *             · 2 unexpected error (DB unreachable)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { unwrapRows } from "../lib/integrity/unwrap";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The platform event triggers that MUST be bound and enabled. Adding a guard
 * to the database means adding it here in the same change — a guard nobody
 * asserts is a guard that can vanish on the next restore.
 */
const EXPECTED: ReadonlyArray<{ name: string; why: string }> = [
  {
    name: "ddl_guard",
    why: "blocks reserved `visibility` column type, new project_id FKs, _mirror_fk_to_assoc, and (since 2026-08-21) hand-rolled entity tables",
  },
  {
    name: "ddl_lock_timeout_guard",
    why: "bounds an unbounded DDL lock wait to 8s so a live request cannot hold the lock queue open",
  },
  {
    name: "graveyard_outbound_fk_guard",
    why: "blocks a graveyard table keeping a live outbound FK",
  },
  {
    name: "entity_types_ddl_sync",
    why: "keeps platform.entity_types schema_name/table_name in step with renames and moves",
  },
  {
    name: "entity_types_drop_flag",
    why: "flags the registry row when its table is dropped",
  },
];

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  ok: `${C.green}[ OK ]${C.reset} `,
};

function loadEnv(): { url: string; key: string } | null {
  const env: Record<string, string> = {};
  // ONE name for the Supabase URL — no second candidate, no fallback chain.
  // See common-docs/policies/package-vs-implementation.md
  const want = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
  for (const k of want) if (process.env[k]) env[k] = process.env[k] as string;

  if (!env.SUPABASE_SECRET_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
    for (const f of [
      ".env.local",
      ".env.production.local",
      ".env.production",
      ".env",
    ]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        if (want.includes(k) && !env[k])
          env[k] = (raw ?? "").replace(/^['"]|['"]$/g, "");
      }
    }
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = env.SUPABASE_SECRET_KEY ?? "";
  return url && key ? { url, key } : null;
}

/**
 * `evtenabled` is `"O"` (origin), `"R"`, `"A"` — all live — or `"D"` disabled.
 * Anything not `"D"` counts as enabled.
 */
interface TriggerRow {
  evtname: string;
  evtenabled: string;
  fn: string;
}

const QUERY = `
  select t.evtname,
         t.evtenabled::text as evtenabled,
         t.evtfoid::regprocedure::text as fn
  from pg_catalog.pg_event_trigger t
  join pg_catalog.pg_proc p on p.oid = t.evtfoid
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'platform'
  order by t.evtname
`;

/**
 * Any RLS policy expression that hands a STABLE access-walk call to the planner
 * in a position the planner pre-evaluates. Both forms are checked; the sanctioned
 * shape is `in (select iam.unnest_uuids(<call>))`, which this deliberately does
 * NOT match (the `unnest(` form below requires the bare `unnest(` spelling).
 */
const PLANNER_TRAP_QUERY = `
  select p.schemaname || '.' || p.tablename as relation,
         p.policyname,
         case
           when coalesce(p.qual,'') || coalesce(p.with_check,'') like '%unnest(iam.accessible%'
             then 'unnest(<stable fn>) — array_unnest_support pre-evaluates the argument'
           else '= ANY (<stable fn>) — scalararraysel pre-evaluates the array'
         end as form
  from pg_catalog.pg_policies p
  where coalesce(p.qual,'') || coalesce(p.with_check,'') like '%unnest(iam.accessible%'
     or lower(coalesce(p.qual,'') || coalesce(p.with_check,'')) like '%any (iam.accessible%'
  order by 1, 2
`;

interface PlannerTrapRow {
  relation: string;
  policyname: string;
  form: string;
}

/**
 * Reports policies that would make the planner execute the access walk.
 * Returns the number of offending policies (0 = clean).
 */
function reportPlannerTraps(rows: PlannerTrapRow[]): number {
  console.log("");
  console.log(
    `${C.bold}RLS planner traps${C.reset} ${C.dim}(no policy may hand the access walk to the planner)${C.reset}`,
  );
  if (!rows.length) {
    console.log(
      `${TAG.ok}No policy pre-evaluates iam.accessible_entity_ids at plan time.`,
    );
    return 0;
  }
  for (const r of rows) {
    console.log(`  ${TAG.fail}${r.relation} ${C.dim}(${r.policyname})${C.reset} — ${r.form}`);
  }
  console.log(
    `${TAG.warn}${rows.length} policy expression(s) will be EXECUTED BY THE PLANNER on every` +
      ` statement against those tables — the 2026-08-24 files.folders 57014 outage exactly.` +
      ` Route the array through iam.unnest_uuids (fix the emitter in iam.entity_read_expr /` +
      ` iam._apply_rls_unchecked, then re-run iam.apply_rls for each table), never hand-edit the policy.`,
  );
  return rows.length;
}

async function main(): Promise<number> {
  const strict = process.argv.includes("--strict");
  const env = loadEnv();
  if (!env) {
    console.log(`${TAG.warn}DB guards: Supabase creds absent — check skipped`);
    return 0;
  }

  const supabase = createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let rows: TriggerRow[];
  try {
    const { data, error } = await supabase.rpc("execute_admin_query", {
      query: QUERY,
    });
    if (error) throw new Error(error.message);
    rows = unwrapRows(data) as unknown as TriggerRow[];
  } catch (err) {
    console.error(`${TAG.fail}DB guards: query failed — ${String(err)}`);
    return 2;
  }

  const byName = new Map(rows.map((r) => [r.evtname, r]));
  const missing = EXPECTED.filter((e) => !byName.has(e.name));
  const disabled = EXPECTED.filter(
    (e) => byName.get(e.name)?.evtenabled === "D",
  );
  const extra = rows.filter((r) => !EXPECTED.some((e) => e.name === r.evtname));

  console.log(
    `${C.bold}DB guard liveness${C.reset} ${C.dim}(pg_event_trigger, schema platform)${C.reset}`,
  );
  for (const e of EXPECTED) {
    const row = byName.get(e.name);
    const state = !row
      ? `${TAG.fail}MISSING  `
      : row.evtenabled === "D"
        ? `${TAG.fail}DISABLED `
        : `${TAG.ok}bound    `;
    console.log(`  ${state} ${e.name}${row ? ` ${C.dim}→ ${row.fn}${C.reset}` : ""}`);
  }
  for (const r of extra) {
    console.log(
      `  ${TAG.info}unlisted  ${r.evtname} ${C.dim}→ ${r.fn}${C.reset} — add it to EXPECTED in scripts/check-db-guards.ts`,
    );
  }

  let trapRows: PlannerTrapRow[];
  try {
    const { data, error } = await supabase.rpc("execute_admin_query", {
      query: PLANNER_TRAP_QUERY,
    });
    if (error) throw new Error(error.message);
    trapRows = unwrapRows(data) as unknown as PlannerTrapRow[];
  } catch (err) {
    console.error(`${TAG.fail}Planner-trap check: query failed — ${String(err)}`);
    return 2;
  }
  const traps = reportPlannerTraps(trapRows);

  if (!missing.length && !disabled.length) {
    console.log("");
    console.log(
      `${TAG.ok}All ${EXPECTED.length} platform event triggers are bound and enabled.`,
    );
    return traps > 0 && strict ? 1 : 0;
  }

  console.log("");
  for (const e of [...missing, ...disabled]) {
    console.log(
      `${TAG.fail}${e.name} is ${missing.includes(e) ? "NOT BOUND" : "DISABLED"} — ${e.why}`,
    );
  }
  console.log(
    `${TAG.warn}A restore drops event triggers SILENTLY (CREATE EVENT TRIGGER needs superuser).` +
      ` Re-apply from matrx-frontend/migrations/ (ddl_guard_sentinel.sql, ddl_lock_timeout_guard.sql,` +
      ` graveyard_outbound_fk_ddl_guard.sql) or re-ENABLE, then re-run. See db-rules FEATURE.md §1.`,
  );
  return strict ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${TAG.fail}DB guards: unexpected error — ${String(err)}`);
    process.exit(2);
  },
);

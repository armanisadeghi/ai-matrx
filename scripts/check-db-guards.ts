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
 * THIRD DETECTOR — RLS policy overlap (context only; see its own comment block).
 *
 * FOURTH DETECTOR — PUBLIC EXPOSURE. What a logged-out visitor can reach, and
 * whether anyone declared it on purpose. Born from a real leak on 2026-08-25 —
 * a policy called `guests_can_check_own_limits` whose predicate was `USING
 * (true)` handed 21,840 rows of IP addresses and browser fingerprints to
 * anyone with the publishable key. Full contract in its own comment block.
 *
 *   pnpm check:db-guards            # loud, non-blocking (exit 0)
 *   pnpm check:db-guards --strict   # exit 1 on a missing/disabled guard, a
 *                                   # planner trap, or an UNDECLARED exposure
 *
 * Exit codes: 0 clean (or creds absent) · 1 missing/disabled, planner trap, or
 *             undeclared public exposure, AND --strict
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

/**
 * THIRD DETECTOR — MULTIPLE PERMISSIVE POLICIES ON ONE ROLE+COMMAND.
 *
 * Postgres OR's every permissive policy that applies to a (role, command), and
 * it evaluates ALL of them for every row — there is no short-circuit across
 * policies. Two policies on one table+role+command is therefore a permanent
 * per-row tax, and it is invisible: nothing errors, the rows are correct, the
 * query is just slower forever.
 *
 * The dominant instance here is structural, not accidental. `iam.apply_rls`
 * emits BOTH a standalone `platform_admin_all` policy (USING/CHECK
 * `is_platform_admin()`) AND `std_select|insert|update|delete`, each of whose
 * predicates ALREADY opens with `is_platform_admin() OR …`. Because permissive
 * policies are OR'd, `(admin OR X) OR admin` ≡ `admin OR X` — the standalone
 * policy grants nothing whatsoever and costs one extra evaluation per row.
 *
 * 🚨 DO NOT "FIX" THIS BY DROPPING `platform_admin_all`. That was tried on
 * 2026-08-25 across 387 tables and reverted the same day. It was proven
 * access-safe, and it still had to come back, for two reasons:
 *
 *   1. ZERO BENEFIT. The advisor's model assumes a per-row cost. Since the
 *      2026-08-22 InitPlan sweep the predicate is `( SELECT is_platform_admin() )`,
 *      which the planner lifts into an InitPlan — evaluated ONCE per query, then
 *      OR'd as a cached boolean. Measured on agent.definition: 6.097 ms with the
 *      policy vs 6.275 ms without. Noise.
 *   2. IT BREAKS CERTIFICATION. `iam.verify_canonical` expects
 *      `platform_admin_all` for most variants ("canonical, not drift"), and the
 *      platform gates done-ness on `iam.canonical_certify_ok`. Every dropped
 *      table reported `policies_canonical FAIL — missing={platform_admin_all}`.
 *
 * `redundant_admin_tables` therefore reports where the policy is ALGEBRAICALLY
 * redundant — useful context, NOT a worklist. It is also not redundant
 * everywhere: on tables with no `std_*` policy for some command it is the only
 * grant of admin access, and dropping it would REMOVE access (db-rules §6 —
 * narrowing is as serious as widening).
 *
 * The number is kept visible so the shape stays known, not because it is a
 * defect. Full write-up, measurements and proofs:
 * common-docs/systems/platform/access/POLICY_OVERLAP.md
 */
const OVERLAP_QUERY = `
  with pol as (
    select p.polrelid, n.nspname as sch, c.relname as tbl, p.polname, p.polpermissive,
           case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                when 'd' then 'DELETE' else 'ALL' end as cmd,
           coalesce(array_agg(distinct pg_get_userbyid(r.oid)) filter (where r.oid is not null),
                    array['PUBLIC']) as roles
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join lateral unnest(p.polroles) as pr(oid) on true
    left join pg_roles r on r.oid = pr.oid
    group by 1,2,3,4,5,6
  ),
  norm as (
    select sch, tbl, polname, role,
           unnest(case when cmd = 'ALL'
                       then array['SELECT','INSERT','UPDATE','DELETE']
                       else array[cmd] end) as cmd
    from (select sch, tbl, polname, cmd, unnest(roles) as role from pol where polpermissive) e
  ),
  combo as (
    select sch, tbl, role, cmd, count(*) as n
    from norm group by 1,2,3,4 having count(*) > 1
  ),
  adm as (
    select p.polrelid, n.nspname as sch, c.relname as tbl
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.polname = 'platform_admin_all'
  ),
  cmds(cmd, code) as (values ('SELECT','r'),('INSERT','a'),('UPDATE','w'),('DELETE','d')),
  cell as (
    select a.sch, a.tbl, k.cmd,
      exists(
        select 1 from pg_policy q
        where q.polrelid = a.polrelid
          and q.polname in ('std_select','std_insert','std_update','std_delete')
          and (q.polcmd = k.code::"char" or q.polcmd = '*')
          and coalesce(pg_get_expr(q.polqual, q.polrelid),
                       pg_get_expr(q.polwithcheck, q.polrelid))
              like '(( SELECT is_platform_admin() AS is_platform_admin) OR %'
          and (q.polcmd <> 'w'::"char" or (
                pg_get_expr(q.polqual, q.polrelid) like '(( SELECT is_platform_admin()%'
            and pg_get_expr(q.polwithcheck, q.polrelid) like '(( SELECT is_platform_admin()%'))
      ) as safe
    from adm a cross join cmds k
  ),
  redundant as (select sch, tbl from cell group by sch, tbl having bool_and(safe))
  select 'overlapping_combos' as metric, count(*)::bigint as value from combo
  union all select 'tables_with_overlap', count(distinct sch || '.' || tbl)::bigint from combo
  union all select 'redundant_admin_tables', (select count(*)::bigint from redundant)
  union all select 'combos_cleared_by_drop',
    (select count(*)::bigint from combo c
      where c.role = 'authenticated' and c.n = 2
        and exists (select 1 from redundant r where r.sch = c.sch and r.tbl = c.tbl))
  order by 1
`;

interface OverlapRow {
  metric: string;
  value: number;
}

/** Reports the overlap census. Returns the number of overlapping combos. */
function reportOverlaps(rows: OverlapRow[]): number {
  const m = new Map(rows.map((r) => [r.metric, Number(r.value)]));
  const combos = m.get("overlapping_combos") ?? 0;
  const tables = m.get("tables_with_overlap") ?? 0;
  const redundant = m.get("redundant_admin_tables") ?? 0;
  const clearable = m.get("combos_cleared_by_drop") ?? 0;

  console.log("");
  console.log(
    `${C.bold}RLS policy overlap${C.reset} ${C.dim}(permissive policies sharing a role+command are all evaluated, every row)${C.reset}`,
  );
  if (!combos) {
    console.log(`${TAG.ok}Every role+command is served by a single permissive policy.`);
    return 0;
  }
  console.log(
    `  ${TAG.info}${combos} overlapping role+command combos across ${tables} tables` +
      ` ${C.dim}(context, not a defect)${C.reset}`,
  );
  console.log(
    `  ${TAG.info}${clearable} of them (${redundant} tables) are the algebraically-redundant` +
      ` \`platform_admin_all\` pattern.`,
  );
  console.log(
    `${C.dim}       Measured 2026-08-25: dropping these buys NOTHING (the predicate is an` +
      ` InitPlan, evaluated once per query) and breaks canonical certification.${C.reset}`,
  );
  console.log(
    `${C.dim}       Do not "fix" this without reading common-docs/systems/platform/access/POLICY_OVERLAP.md${C.reset}`,
  );
  return combos;
}

/**
 * FOURTH DETECTOR — WHAT A LOGGED-OUT VISITOR CAN REACH, AND DID WE MEAN IT.
 *
 * Born from a real leak (2026-08-25): `users.guest_executions` carried a policy
 * named `guests_can_check_own_limits` whose predicate was `USING (true)`. Any
 * anonymous caller could download 21,840 rows of `ip_address`, `fingerprint` and
 * the fingerprint→account linkage using only the publishable key that ships in
 * the frontend bundle. Nothing flagged it, because nothing was looking: a policy
 * name is not a policy, and no guard compared the two.
 *
 * REACHABILITY IS THREE LAYERS, and a check on any one of them cries wolf:
 *   1. an RLS policy granting `anon`/PUBLIC UNCONDITIONAL access (literally
 *      `true` — the deliberate `visibility = 'public'` family is gated and does
 *      NOT count);
 *   2. the `anon` role actually holding schema USAGE + the table privilege
 *      (this is what makes `growth.*` unreachable despite a `true` policy); and
 *   3. the schema being exposed by PostgREST.
 *
 * This detector checks 1 AND 2, which are the two the database can answer. Layer
 * 3 lives in PostgREST's own config, outside SQL — where it matters, the reason
 * text below says so. That is deliberately conservative: a table failing 3 but
 * passing 1+2 is still misconfigured, and one config change away from live.
 *
 * THE CONTRACT: every exposure is declared here with a REASON, or the check
 * FAILS. Adding a row to the allowlist is the act of saying "this is intentional"
 * — do not add one to silence the guard. An entry carrying `defect` is a known
 * wrong we have not fixed yet; it warns rather than fails, and it goes away when
 * the defect does. The key includes the command, so a policy widening from
 * SELECT to ALL reads as a NEW undeclared exposure rather than passing silently.
 */
interface PublicExposure {
  /** `schema.table` */
  relation: string;
  policy: string;
  /** SELECT / INSERT / UPDATE / DELETE / ALL */
  cmd: string;
  why: string;
  /** Set when this exposure is known-wrong and tracked — warns instead of passing. */
  defect?: string;
}

const PUBLIC_EXPOSURE_ALLOWED: ReadonlyArray<PublicExposure> = [
  // — Pricing and plan catalogue, rendered on the public marketing pages —
  { relation: "billing.product", policy: "product_read", cmd: "SELECT", why: "public pricing page renders products before sign-in" },
  { relation: "billing.price", policy: "price_read", cmd: "SELECT", why: "public pricing page renders prices before sign-in" },
  { relation: "billing.plan_limit", policy: "plan_limit_public_read", cmd: "SELECT", why: "plan comparison table on the public pricing page" },
  { relation: "billing.capability", policy: "capability_read", cmd: "SELECT", why: "plan capability catalogue shown on the public pricing page" },
  { relation: "billing.capability_limit", policy: "capability_limit_read", cmd: "SELECT", why: "plan capability limits shown on the public pricing page" },

  // — Reference/catalogue data with no personal content —
  { relation: "crm.jurisdiction_policy", policy: "jurisdiction_policy_select_all", cmd: "SELECT", why: "outreach-compliance reference rules; jurisdictional policy, no personal data" },
  { relation: "iam.industries", policy: "industries_select_all", cmd: "SELECT", why: "industry picker must populate on the sign-up form, before an account exists" },
  { relation: "platform.assurance_level", policy: "assurance_level_select_all", cmd: "SELECT", why: "static reference enum" },
  { relation: "platform.source_authority", policy: "source_authority_select_all", cmd: "SELECT", why: "static reference enum" },
  { relation: "platform.shareable_resource_registry", policy: "shareable_resource_registry_select", cmd: "SELECT", why: "entity-type registry — describes shapes, contains no user rows" },
  { relation: "platform.feature_knob", policy: "feature_knob_read", cmd: "SELECT", why: "client feature gating has to resolve before sign-in" },
  { relation: "public.app_config", policy: "app_config_public_read", cmd: "SELECT", why: "client bootstrap config (min supported version); read before auth by design" },

  // — Public tool / UI catalogues the shell needs before auth —
  { relation: "tool.executor", policy: "ref_select", cmd: "SELECT", why: "public tool catalogue" },
  { relation: "tool.mcp_config", policy: "ref_select", cmd: "SELECT", why: "public tool catalogue" },
  { relation: "tool.mcp_server", policy: "ref_select", cmd: "SELECT", why: "public tool catalogue" },
  { relation: "tool.surface_defaults", policy: "ref_select", cmd: "SELECT", why: "public tool catalogue" },
  { relation: "ui.ui_client", policy: "ui_client_read_anon", cmd: "SELECT", why: "surface catalogue — the shell renders public routes before sign-in" },
  { relation: "ui.ui_surface", policy: "ui_surface_read_anon", cmd: "SELECT", why: "surface catalogue — the shell renders public routes before sign-in" },
  { relation: "ui.ui_surface_value", policy: "ui_surface_value_read_anon", cmd: "SELECT", why: "surface catalogue values for public routes" },
  { relation: "ui.ui_surface_agent_role", policy: "ui_surface_agent_role_read", cmd: "SELECT", why: "surface catalogue agent roles for public routes" },
  { relation: "ui.ui_surface_client_tool", policy: "ui_surface_client_tool_read_anon", cmd: "SELECT", why: "surface catalogue client tools for public routes" },
  { relation: "ui.ui_surface_write_target", policy: "ui_surface_write_target_read_anon", cmd: "SELECT", why: "surface catalogue write targets for public routes" },

  // — Deliberately public product surfaces —
  { relation: "education.content_certification", policy: "cc_public_read", cmd: "SELECT", why: "certification badges shown on public education content" },
  { relation: "education.math_course_structure", policy: "Public can view course structure", cmd: "SELECT", why: "public curriculum outline" },
  { relation: "users.user_follows", policy: "Follows are viewable by everyone", cmd: "SELECT", why: "follow graph is public on creator profiles (/c/{handle})" },
  { relation: "extend.wbx_recipe", policy: "wbx_recipe_read_all", cmd: "SELECT", why: "browser-automation recipe catalogue; no credentials — discloses which sites/routes we automate, accepted" },

  // — Anonymous WRITES: each is a public form or the guest flow. INSERT only. —
  { relation: "communication.emails", policy: "form_insert", cmd: "INSERT", why: "public contact form submits without an account; INSERT only, anon cannot read the table back" },
  { relation: "users.guest_executions", policy: "Allow guest execution inserts", cmd: "INSERT", why: "a guest must be able to create their own usage row before signing up; INSERT only — the anon READ of this table was the 2026-08-25 leak and is closed" },
  { relation: "users.guest_execution_log", policy: "Allow guest execution inserts", cmd: "INSERT", why: "per-execution guest usage log; INSERT only, same guest flow" },

  // — KNOWN WRONG, tracked. These warn until fixed, then get deleted from here. —
  {
    relation: "extend.wbx_demo",
    policy: "wbx_demo_svc",
    cmd: "ALL",
    why: "policy named for the service role but created TO PUBLIC — anon can read AND write. Table is empty so nothing has leaked. The `extend` schema IS PostgREST-exposed, so this one is internet-reachable. Needs the matrx-extend owner to confirm the extension does not write as anon, then scope it to service_role.",
    defect: "D257",
  },
];

const EXPOSURE_QUERY = `
  select n.nspname || '.' || c.relname as relation,
         p.polname as policy,
         case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
              when 'd' then 'DELETE' else 'ALL' end as cmd,
         (p.polcmd in ('a','w','d','*')
          and (has_table_privilege('anon', c.oid, 'INSERT')
            or has_table_privilege('anon', c.oid, 'UPDATE')
            or has_table_privilege('anon', c.oid, 'DELETE'))) as write_open
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where p.polpermissive
    -- polroles = {0} is PUBLIC, which includes anon
    and (p.polroles = '{0}'::oid[]
         or 'anon' = any(select pg_get_userbyid(x) from unnest(p.polroles) x))
    -- UNCONDITIONAL only. A gated predicate (visibility='public') is not this.
    and (pg_get_expr(p.polqual, p.polrelid) = 'true'
         or pg_get_expr(p.polwithcheck, p.polrelid) = 'true')
    -- layer 2: anon must actually hold the grants for this to be reachable
    and has_schema_privilege('anon', n.nspname, 'USAGE')
    and (has_table_privilege('anon', c.oid, 'SELECT')
      or has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE')
      or has_table_privilege('anon', c.oid, 'DELETE'))
  order by write_open desc, 1, 2
`;

interface ExposureRow {
  relation: string;
  policy: string;
  cmd: string;
  write_open: boolean;
}

const exposureKey = (e: { relation: string; policy: string; cmd: string }) =>
  `${e.relation}::${e.policy}::${e.cmd}`;

/** Returns the number of UNDECLARED exposures (0 = every one is intentional). */
function reportPublicExposure(rows: ExposureRow[]): number {
  const declared = new Map(
    PUBLIC_EXPOSURE_ALLOWED.map((e) => [exposureKey(e), e]),
  );
  const live = new Set(rows.map(exposureKey));

  const undeclared = rows.filter((r) => !declared.has(exposureKey(r)));
  const tracked = rows.filter((r) => declared.get(exposureKey(r))?.defect);
  const stale = PUBLIC_EXPOSURE_ALLOWED.filter(
    (e) => !live.has(exposureKey(e)),
  );

  console.log("");
  console.log(
    `${C.bold}Public exposure${C.reset} ${C.dim}(what a logged-out visitor can reach — every one must be declared)${C.reset}`,
  );
  console.log(
    `${C.dim}       ${rows.length} live · ${declared.size - stale.length} declared intentional · ${tracked.length} tracked-wrong${C.reset}`,
  );

  for (const r of undeclared) {
    console.log(
      `  ${TAG.fail}UNDECLARED ${r.relation} ${C.dim}(${r.policy}, ${r.cmd})${C.reset}` +
        `${r.write_open ? ` ${C.red}— ANON CAN WRITE${C.reset}` : ""}`,
    );
  }
  for (const r of tracked) {
    const d = declared.get(exposureKey(r));
    console.log(
      `  ${TAG.warn}tracked    ${r.relation} ${C.dim}(${r.policy}, ${r.cmd})${C.reset} — ${d?.defect}` +
        `${r.write_open ? ` ${C.red}— ANON CAN WRITE${C.reset}` : ""}`,
    );
  }
  for (const e of stale) {
    console.log(
      `  ${TAG.info}stale      ${e.relation} ${C.dim}(${e.policy}, ${e.cmd})${C.reset} — no longer exposed; remove it from PUBLIC_EXPOSURE_ALLOWED`,
    );
  }

  if (!undeclared.length) {
    console.log(
      `${TAG.ok}Every public exposure is declared and reasoned.`,
    );
  } else {
    console.log(
      `${TAG.fail}${undeclared.length} exposure(s) nobody declared. A logged-out visitor can reach these.`,
    );
    console.log(
      `${C.dim}       If intentional, add it to PUBLIC_EXPOSURE_ALLOWED in this file WITH a reason.` +
        ` If not, fix the policy — do not add a row to silence the check.${C.reset}`,
    );
    console.log(
      `${C.dim}       Precedent: common-docs/systems/platform/access/POLICY_OVERLAP.md § What this investigation actually bought${C.reset}`,
    );
  }
  return undeclared.length;
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

  try {
    const { data, error } = await supabase.rpc("execute_admin_query", {
      query: OVERLAP_QUERY,
    });
    if (error) throw new Error(error.message);
    reportOverlaps(unwrapRows(data) as unknown as OverlapRow[]);
  } catch (err) {
    console.error(`${TAG.fail}Policy-overlap census: query failed — ${String(err)}`);
    return 2;
  }

  let undeclaredExposures = 0;
  try {
    const { data, error } = await supabase.rpc("execute_admin_query", {
      query: EXPOSURE_QUERY,
    });
    if (error) throw new Error(error.message);
    undeclaredExposures = reportPublicExposure(
      unwrapRows(data) as unknown as ExposureRow[],
    );
  } catch (err) {
    console.error(`${TAG.fail}Public-exposure check: query failed — ${String(err)}`);
    return 2;
  }

  if (!missing.length && !disabled.length) {
    console.log("");
    console.log(
      `${TAG.ok}All ${EXPECTED.length} platform event triggers are bound and enabled.`,
    );
    return (traps > 0 || undeclaredExposures > 0) && strict ? 1 : 0;
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

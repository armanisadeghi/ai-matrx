#!/usr/bin/env npx tsx
/**
 * IMPL DOORS — an `_impl_` helper is never a client door, and a grandfather row
 * on a function that is not a declared door is a silent stand-down.
 *
 * db-rules FEATURE.md §6d-4. Born from DD-098 (2026-09-11): every
 * `public._d31_impl_*` function — 15 of them, 12 anon-callable — was a
 * `SECURITY DEFINER` implementation behind a guarded wrapper, and `anon` held
 * EXECUTE on it. `_d31_impl_add_data_row_to_user_table` inserts straight into
 * `workbench.udt_dataset_rows` with no access check of any kind; an
 * unauthenticated caller holding a dataset UUID minted rows in it. Reproduced
 * live, then closed by
 * `migrations/d31_impl_doors_closed_and_schema_templates_anon_revoke.sql`.
 *
 * WHY A GUARD AND NOT JUST THE MIGRATION. Two halves of that fix have very
 * different durability:
 *
 *  - The REVOKE is protected going forward by the §6d-4 event trigger
 *    `platform.enforce_definer_client_grants`, which takes a client GRANT back
 *    inside the GRANT statement and writes a `platform.ddl_guard_log` row.
 *  - The GRANDFATHER DELETE is protected by nothing at all. Every function that
 *    existed on 2026-08-28 is listed in
 *    `platform.definer_client_grant_grandfather`, and for a listed function the
 *    event trigger deliberately STANDS DOWN. Re-inserting those 15 rows would
 *    silently restore the stand-down, and then any path that establishes a
 *    default grant — a fresh `CREATE` after a `DROP`, a hand-written `GRANT` —
 *    re-opens the door with no warning and no log row. Deleting the grandfather
 *    row is the fix; revoking alone is not.
 *
 * So this gate asserts the END STATE against the live database, not the file:
 *
 *   D1  No `SECURITY DEFINER` function in `public` whose name contains `_impl_`
 *       holds EXECUTE for `anon`, `authenticated` or `PUBLIC`. The wrapper is
 *       the door; the impl is not. (A definer wrapper runs as its owner, which
 *       owns the impl, so the wrapper needs no grant on it.)
 *   D2  No `platform.definer_client_grant_grandfather` row names a function that
 *       is not also declared in `platform.client_callable_door`. A grandfather
 *       row is "the guard stands down here" — it belongs only on a function
 *       somebody has actually declared safe for clients.
 *   D2b No `platform.definer_client_grant_grandfather` row names a function that
 *       ALSO has a `platform.client_callable_door` row. D2 counts only rows with
 *       NO door, so a row beside a declared door was invisible to it — measured,
 *       not guessed (B-63 inserted one for `public.update_scope` and the gate
 *       stayed green). ABSOLUTE: DD-169 batch 2 deleted the 33 that existed.
 *   D2c Every surviving grandfather row outside `pgsodium` names its REASON and
 *       its OWNER in `scripts/impl-doors/grandfather-allowlist.json`. A count
 *       baseline caps how many stand-downs exist; it says nothing about WHICH, so
 *       the population could rotate underneath it. ABSOLUTE.
 *   D2d Every allowlist entry still matches a live grandfather row. A stale entry
 *       pre-authorizes a stand-down that has not happened — that is how a deleted
 *       row comes back unnoticed. ABSOLUTE; the file may only shrink.
 *
 *   D3  `anon` holds NO table privilege on `workbench.schema_templates`. That
 *       table has RLS OFF, zero policies and no owner column, so a table GRANT
 *       to `anon` IS the access decision: with `workbench` in `pgrst.db_schemas`
 *       the published anon key could rewrite or delete every row over
 *       `/rest/v1/schema_templates`. Until the table is registered or retired
 *       (DD-033), "anon has nothing" is the only thing holding it shut.
 *   D4  No CLIENT role (`anon`, `authenticated`, `PUBLIC`) holds INSERT, UPDATE,
 *       DELETE, TRUNCATE or REFERENCES on `workbench.schema_templates`. B-8
 *       (2026-09-11) typed it REFERENCE data — authenticated reads, writes go
 *       through `public.admin_{create,update,delete}_schema_template` (gated on
 *       `admin.admins`) or `service_role`. Before that, any signed-in user of
 *       any organization could rewrite or delete all five rows; proven live as
 *       `test@test.com`. SELECT is deliberately not checked — reference data is
 *       meant to be read.
 *
 *   D5  No `SECURITY DEFINER`, non-trigger function that `anon` can EXECUTE is
 *       missing a `platform.client_callable_door` row. THIS IS THE CLASS GUARD
 *       for DD-110/B-14: D1 protects one naming convention, D5 protects the
 *       whole anonymous surface. An anon-executable definer with no door row is
 *       a function the published anon key can call that nobody ever declared
 *       safe for a caller with no account — which is how
 *       `public.execute_admin_query(text)` came to run arbitrary SQL as
 *       `postgres` for anyone holding that key (proven live as `anon`,
 *       2026-09-11, before the B-14 migration closed it).
 *
 * D2 is deliberately WIDER than the `_d31_impl_*` family this was born from:
 * fix the class, not the instance. It is expected to report a large
 * pre-existing population — the 2026-08-28 grandfather snapshot is ~1,788 rows,
 * almost none of them declared doors — so it is reported against a BASELINE
 * (`scripts/impl-doors/grandfather-baseline.json`) and fails only on GROWTH.
 * The baseline may only shrink; that is the same contract
 * `migration_checksum_honesty_guard` uses for its UNVERIFIABLE list.
 *
 * D5 carries the same kind of shrink-only baseline
 * (`scripts/impl-doors/anon-definer-baseline.json`) for the same reason: 370
 * undeclared anonymous doors remain after B-14, and a gate that fails on all
 * of them every run is a gate nobody reads. It fails on GROWTH.
 *
 * D1, D3 and D4 have no baseline and no allowlist. They are absolutes.
 *
 *   D7  No SECURITY DEFINER, non-trigger function that a CLIENT role (`anon`,
 *       `authenticated`, `PUBLIC`) can EXECUTE contains DDL, unless its body
 *       gates on a platform-admin predicate before it. DD-146 (2026-09-12):
 *       `platform.retrofit_entity` and `platform.create_entity_table` were
 *       SECURITY DEFINER owned by `postgres`, granted to `anon`, and ran
 *       `execute format('alter table …')` with no gate — proven live as `anon`,
 *       whose call entered the body. Absolute: no baseline, no allowlist.
 *
 *   D9  No SECURITY INVOKER, non-trigger function in a PostgREST-exposed schema
 *       whose body WRITES may be executed by `anon`, unless a
 *       `platform.client_callable_door` row declares it with an ANONYMOUS
 *       purpose. DD-197 (2026-09-13): 66 of them could be, and not one held a
 *       door row. An invoker function runs AS THE CALLER, so `anon`'s empty
 *       privileges applied inside — which is why the refusals came from deep in
 *       the body and told the truth about nothing. Proven live over HTTPS with
 *       the published key and no JWT, before the DD-197 migration:
 *         rpc/cx_canvas_toggle_favorite -> 42501 "permission denied for table
 *                 canvas_items", hint "GRANT UPDATE ON canvas.canvas_items TO anon;"
 *         rpc/wsp_upsert_system_task    -> 42501 "permission denied for FUNCTION
 *                 ensure_personal_organization" — an internal helper the caller
 *                 never named, and an accidental reason
 *         rpc/reorder_keywords          -> 204 NO CONTENT. It RAN, and returned
 *                 success, because the body's first branch returns before it
 *                 touches a table. Nothing recorded that anon had been inside.
 *       An invoker writer is not a door at any width: a door is SECURITY DEFINER
 *       with a gate and a declared row. Reach is measured with
 *       `has_function_privilege`, never by reading role names out of `proacl` —
 *       28 of the 66 were reachable through PostgreSQL's own default (a function
 *       created with no GRANT has `proacl = null`, i.e. EXECUTE for PUBLIC), and
 *       a grant-name census cannot see one of those. ABSOLUTE: no baseline, no
 *       allowlist. The population is zero and zero is the only correct number.
 *
 *  D12 In HR, a CAPABILITY is asked before a ROLE. A function that reads both
 *       a capability (`hr.capability` / `hr._l1_capabilities`) and an
 *       organization membership role (`hr._l1_org_role`, or `role into <var>`
 *       off `iam.memberships` / `iam.organization_member`), and that RAISES or
 *       RETURNS on the role before the capability is ever consulted, is a
 *       finding. DD-206 (2026-09-14): `hr.capability`'s source of truth is an
 *       EMPLOYMENT, never a membership row, so a capability holder who is not a
 *       member is constructible — and `hr_structure_list`, `hr_directory_list`
 *       and `hr_org_chart` refused exactly that person with "no standing in this
 *       employer" while `hr_knob_index` served them the whole settings index.
 *       Comments are stripped before the positions are compared, so prose about
 *       a role helper is not a finding. ABSOLUTE: no baseline, no allowlist.
 *
 *   D15 No `platform.client_callable_door` row fails to resolve to exactly one
 *       live function. DD-210 (2026-09-14): 28 rows named none. ABSOLUTE.
 *   D16 The register and the grants agree in BOTH directions — (a) no door row's
 *       `signed_in_callers`/`anonymous_callers` disagrees with the live
 *       `authenticated`/`anon` EXECUTE grant, and (b) no client-executable
 *       SECURITY DEFINER function carries no door row at all. ABSOLUTE.
 *   D17 Every entry in `scripts/door-rows/by-design-allowlist.json` names its
 *       owner, its reason and the cross-boundary SHAPE it permits. ABSOLUTE.
 *   D18 No CLOSED helper is reached by a client path. For `authenticated` and
 *       `anon`, walk every place the database runs code AS THE CALLER —
 *       SECURITY INVOKER trigger functions on tables the role can write,
 *       SECURITY INVOKER functions the role can execute (for `anon`, only those
 *       declared with an anonymous purpose), RLS policies on tables the role can
 *       touch, views it can read, column defaults on tables it can insert into —
 *       and fail on a call to a function of which NO overload the role can
 *       execute. EXECUTE on a function called inside an invoker body is checked
 *       against the CALLER, so every hit is a 42501 inside a working user path.
 *       DD-169 batch 3 closed helpers after a census that never read invoker
 *       bodies: `seo.fn_geo_area_sync_meaning` is called by the
 *       `seo.site_geo_area` trigger, and every geo-area edit answered `42501
 *       permission denied for function fn_geo_area_sync_meaning` (2026-09-14;
 *       the same census found conversation delete and the cross-site rank list
 *       broken the same way). Calls are read by name from the body with comments
 *       and string literals stripped, so a generator that only WRITES a call
 *       into policy text is not a call. Hits that predate this gate live in
 *       `scripts/impl-doors/closed-helper-reach-baseline.json`, each with a
 *       reason; the file may only shrink and a stale entry fails.
 *
 *   D13 Every `platform.client_callable_door` row's `anonymous_callers` flag
 *       says the same thing as the live `anon` EXECUTE grant on its function.
 *       DD-212 (2026-09-14) made the FLAG the declaration — before it, D5/D9 and
 *       the DD-202 birth trigger all read `reason ~* '(anonymous|signed[- ]out|
 *       guest|kiosk|outsider)'`, and V-68 proved a row reading "SIGNED-IN door …
 *       No anonymous caller exists" opened the birth door for a new INVOKER
 *       function. A flag is only as good as its agreement with the database, so
 *       this arm holds the two together in both directions: TRUE with no grant is
 *       a stand-down waiting to hand anon back on the next CREATE OR REPLACE;
 *       FALSE with a grant is DD-207's silent door (16 rows on 2026-09-14,
 *       `public.admin_spend_headline` declared SUPER-ADMIN-ONLY while the
 *       published anon key could call it). Rows whose function does not exist
 *       under that exact identity_args are out of the population. ABSOLUTE.
 *
 *   D14 Every ASSOCIATION door's declared reason names BOTH ENDS of the edge.
 *       An association is the one row shape with two subjects, and a gate that
 *       asks about one of them is a direction, not a gate. DD-195 (2026-09-13)
 *       gated the end an edge REVEALS and said so honestly — "The door does NOT
 *       gate the anchor the caller named" — and that true, incomplete sentence
 *       survived a whole verification round because incomplete read as fine.
 *       DD-205 (2026-09-14) measured what it left open: passing nine ids the
 *       kernel refused you as the ANCHOR returned all nine edges. So a reason
 *       that does not say `both ends`, or that disclaims gating an end, is the
 *       finding — the class is the sentence, not the one door. ABSOLUTE: no
 *       baseline, no allowlist; the population is every
 *       `platform.client_callable_door` row whose function name starts
 *       `assoc_`, and it was 11 of 11 green the day this shipped.
 *
 *   pnpm check:impl-doors            # loud, non-blocking (exit 0)
 *   pnpm check:impl-doors:strict     # exit 1 on any finding
 *
 * CREDENTIALS. This reads the live DB through `execute_admin_query` and needs
 * `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`. Without them it CANNOT
 * measure anything, so it says UNMEASURED loudly and, under `--strict`, exits
 * 1 — never a silent pass. A gate that goes green because it could not run is
 * worse than no gate (matrx-frontend CLAUDE.md §CI, the UNMEASURED rule).
 *
 * Exit codes: 0 clean (or findings without --strict) · 1 findings/UNMEASURED
 * with --strict · 2 script error.
 */

import { exitAfterDrain } from "./lib/exit-after-drain";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { unwrapRows } from "../lib/integrity/unwrap";

const ROOT = process.cwd();

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[97m",
};
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  ok: `${C.green}[ OK ]${C.reset} `,
};

function loadEnv(): { url: string; key: string } | null {
  const env: Record<string, string> = {};
  const want = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
  for (const k of want) if (process.env[k]) env[k] = process.env[k] as string;

  if (!env.SUPABASE_SECRET_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        if (want.includes(k) && !env[k]) env[k] = (raw ?? "").replace(/^['"]|['"]$/g, "");
      }
    }
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = env.SUPABASE_SECRET_KEY ?? "";
  return url && key ? { url, key } : null;
}

// ─── D1: `_impl_` helpers are not client-callable ────────────────────────────

const OPEN_IMPL_QUERY = `
  select n.nspname || '.' || p.proname as fn,
         pg_get_function_identity_arguments(p.oid) as args,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
         exists (
           select 1 from aclexplode(p.proacl) a
           where a.grantee = 0 and a.privilege_type = 'EXECUTE'
         ) as public_x
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.proname like '%\\_impl\\_%'
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or exists (
        select 1 from aclexplode(p.proacl) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
    )
  order by 1, 2
`;

interface OpenImplRow {
  fn: string;
  args: string;
  anon_x: boolean;
  auth_x: boolean;
  public_x: boolean;
}

// ─── D2: grandfather rows only on declared doors ─────────────────────────────

const UNDECLARED_GRANDFATHER_QUERY = `
  select g.schema_name || '.' || g.function_name as fn,
         g.identity_args as args
  from platform.definer_client_grant_grandfather g
  where not exists (
    select 1 from platform.client_callable_door d
    where d.schema_name = g.schema_name
      and d.function_name = g.function_name
      and d.identity_args = g.identity_args
  )
  order by 1, 2
`;

interface GrandfatherRow {
  fn: string;
  args: string;
}

// ─── D2b/D2c/D2d: the grandfather table names its reasons, or it is empty ────
//
// DD-169 batch 2 (B-64, 2026-09-13). D2 above counts grandfather rows whose
// function has NO door row, against a shrink-only baseline. B-63 reported the
// hole that leaves, and it was measured, not guessed: a grandfather row on a
// function that ALSO has a door row is invisible to D2, so one can be inserted
// with the gate staying green (proven by inserting one for public.update_scope).
// It is redundant rather than dangerous — the door row is the decision either
// way — but a rule the guard cannot see is not a rule.
//
// D2b closes it as an ABSOLUTE: no grandfather row may duplicate a declared
// door. B-64 deleted the 33 that existed, so the only correct number is zero.
//
// 🚨 DD-223 (B-118, 2026-09-14): this used to join `d.identity_args = g.identity_args`
// — two renderings of the same signature, each written by whoever happened to be
// connected. The grandfather table has keyed on `proargtypes` since hr_l3_109 and
// the register does now too, so the join is the catalog's key on both sides and a
// duplicate can no longer hide behind a different spelling of the same types.
const DUPE_DOOR_GRANDFATHER_QUERY = `
  select g.schema_name || '.' || g.function_name as fn,
         g.identity_args as args
  from platform.definer_client_grant_grandfather g
  where exists (
    select 1 from platform.client_callable_door d
    where d.schema_name = g.schema_name
      and d.function_name = g.function_name
      and array_to_string(d.identity_argtypes, ' ') = g.argtypes
  )
  order by 1, 2
`;

// D2c/D2d are the other half. A count baseline says "no more than this many
// stand-downs"; it says nothing about WHICH, so the population could rotate
// underneath it. Every surviving row outside `pgsodium` must therefore appear in
// `scripts/impl-doors/grandfather-allowlist.json` WITH a reason and an owner
// (D2c), and every allowlist entry must still correspond to a live row (D2d) so
// the file can never pre-authorize a stand-down that has not happened yet.
// pgsodium is excluded for the same reason it is excluded everywhere else: the
// extension owns those functions, this role cannot revoke on them, and the
// schema is absent from `pgrst.db_schemas`.
const ALL_GRANDFATHER_QUERY = `
  select g.schema_name || '.' || g.function_name as fn,
         g.identity_args as args
  from platform.definer_client_grant_grandfather g
  where g.schema_name <> 'pgsodium'
  order by 1, 2
`;

interface AllowlistEntry {
  fn: string;
  args: string;
  reason: string;
  owner: string;
}

interface GrandfatherAllowlist {
  why: string;
  generatedAt: string;
  generatedBy: string;
  entries: AllowlistEntry[];
}

function loadGrandfatherAllowlist(): GrandfatherAllowlist | null {
  const p = resolve(ROOT, "scripts/impl-doors/grandfather-allowlist.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as GrandfatherAllowlist;
  } catch {
    return null;
  }
}

// ─── D3: anon has nothing on workbench.schema_templates ──────────────────────

const ANON_TEMPLATE_GRANTS_QUERY = `
  select privilege_type
  from information_schema.role_table_grants
  where table_schema = 'workbench'
    and table_name = 'schema_templates'
    and grantee = 'anon'
  order by 1
`;

interface PrivRow {
  privilege_type: string;
}

// ─── D4: no client role WRITES workbench.schema_templates ────────────────────
//
// B-8 (2026-09-11) typed that table as REFERENCE data: its 5 rows are field
// shapes created 2025-05-15/16, they carry no organization, no creator and no
// user content (discovery D13), and the table is registered nowhere, so there is
// no owner an RLS policy could key on. Reference means exactly one thing here:
// `authenticated` READS, and every WRITE goes through the admin doors
// `public.admin_{create,update,delete}_schema_template` (gated on
// `public.is_admin()` → admin.admins) or through `service_role`.
//
// D3 keeps `anon` at zero. D4 is the other half: a direct INSERT/UPDATE/DELETE
// grant to ANY client role re-opens "any signed-in user of any organization can
// rewrite all five rows", which is the hole B-8 closed — proven live before the
// fix: as `test@test.com` (non-admin, 2 orgs) UPDATE, DELETE and INSERT all
// SUCCEEDED. SELECT is deliberately NOT checked: reference data is meant to be
// readable, and `utils/user-table-utls/template-utils.ts` reads it as the
// signed-in user.
//
// No baseline, no allowlist — like D1 and D3 this is an absolute.
const CLIENT_TEMPLATE_WRITE_QUERY = `
  select grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'workbench'
    and table_name = 'schema_templates'
    and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES')
  order by 1, 2
`;

interface ClientWriteRow {
  grantee: string;
  privilege_type: string;
}

// ─── D5: every anon-callable SECURITY DEFINER declares its door ──────────────
//
// db-rules §6d-4 says a new client door MUST declare itself. The grandfathered
// population (D2) is the set where the event trigger stands down, so nothing in
// the database asserts this for them. D5 asserts the end state directly: if
// `anon` can execute it and it is SECURITY DEFINER, there is a row saying why an
// anonymous caller may reach it. Trigger functions are excluded (a trigger is
// not called by a client); extension-owned `pgsodium.*` is left to Supabase.
//
// 🚨 DD-212 (2026-09-14) STRENGTHENED IT: the row must carry
// `anonymous_callers = true`, not merely exist. Before that, ANY door row
// satisfied D5, so 16 functions `anon` could execute passed on a row that
// described a signed-in caller and never considered a stranger (DD-207:
// `public.admin_spend_headline` held anon EXECUTE behind a door row saying
// SUPER-ADMIN-ONLY). Those 16 were decided in
// `migrations/dd212_an_anonymous_door_is_declared_never_inferred.sql` —
// `log_client_error` declared, the other 15 revoked — so this strengthening
// costs the baseline nothing: the population was 8 before it and is 8 after.
const UNDECLARED_ANON_DEFINER_QUERY = `
  select n.nspname || '.' || p.proname as fn,
         pg_get_function_identity_arguments(p.oid) as args
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and p.prokind = 'f'
    and p.prorettype <> 'trigger'::regtype
    and n.nspname not in ('pg_catalog', 'information_schema')
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and not exists (
      select 1 from platform.client_callable_door d
      where d.schema_name = n.nspname
        and d.function_name = p.proname
        and d.identity_args = pg_get_function_identity_arguments(p.oid)
        and d.anonymous_callers
    )
  order by 1, 2
`;

interface AnonDefinerRow {
  fn: string;
  args: string;
}

// ─── D6: a declared ANONYMOUS door that reads visibility-bearing rows must gate on it ──
//
// DD-116 / B-15 (2026-09-11). D5 asks whether a door was DECLARED. D6 asks
// whether the declaration is HONEST. `public.get_agent_public(uuid)` was a
// properly declared anonymous door whose entire body was
// `where d.id = p_agent_id and d.deleted_at is null` — no visibility test at
// all. Proven live as `anon` in a rolled-back transaction: it returned the name,
// description, launch variables and context policies of a `card_visibility=
// 'internal'` agent (628 of 1,040 live agents were in that class) to anyone
// holding the published anon key and a UUID. Declaring a door is a claim that an
// anonymous caller may reach it; it is not a claim that every ROW behind it is
// public, and nothing in the database was checking the difference.
//
// THE RULE. A declared anon door whose body names a table that carries a
// `visibility` or `card_visibility` column must show ONE of:
//   * a visibility test in its own body (`visibility` / `card_visibility`);
//   * the platform's access resolver (`iam.has_access`, `has_permission`,
//     `resolve_share_token`, `accessible_entity_ids`);
//   * a credential-shaped argument — `secret` / `token` / `code` / `pin` /
//     `password` (hr_l3_70's structural rule: an anonymous caller may reach a
//     door only when the door carries its own credential); or
//   * `auth.uid()`, i.e. the body resolves the caller's identity itself.
//
// IT IS A TEXT TEST OVER THE LIVE BODY, AND THAT IS DELIBERATE. It cannot prove
// a gate is CORRECT — only that one is present. It is exactly strong enough to
// catch the defect class it was born from (a door with no gate at all), it reads
// `pg_get_functiondef` on the live database rather than a file, and it cannot go
// green because someone edited a migration. A door that satisfies it by
// mentioning a visibility column in a comment is a lie a human must still catch;
// a door that satisfies nothing is caught here.
//
// TWO BLIND SPOTS, BOTH FOUND BY THE DD-116 INDEPENDENT VERIFIER AND BOTH FIXED
// HERE (DD-116 fix 1, 2026-09-11):
//
//  (a) UNQUALIFIED TABLE NAMES WERE INVISIBLE. The table match was
//      `schema.table` only, so a body that says `from definition d` under
//      `SET search_path TO 'agent','public'` — which is how several of these
//      functions are actually written — matched no table and was never
//      examined at all. A door could drop its gate AND stay green just by not
//      schema-qualifying. The query now reads each function's own
//      `proconfig` search_path and matches a bare table name when that table's
//      schema is on it. Bare-name matching over-matches a little (a table named
//      `definition` matches the word in a comment too); that direction only ever
//      ADDS examinations, which is the safe direction for a security gate.
//
//  (b) THE GATE VOCABULARY WAS A GUESS AND IT WAS WRONG. It listed four names
//      off the top of an agent's head and missed `iam.has_org_access`, which is
//      exactly how `public.cmt_list` — whose body ends
//      `and iam.has_org_access(c.organization_id)` — was reported as ungated.
//      A false positive in a gate is not harmless: it is the thing that teaches
//      people to raise the baseline. The vocabulary is now DERIVED from the
//      live database — every boolean / `uuid[]` / `SETOF uuid` function in the
//      `iam` schema whose name starts with an access-predicate prefix — so a new
//      platform gate is understood the day it ships, without editing this file.
//
// Shrink-only baseline (`scripts/impl-doors/anon-door-visibility-baseline.json`)
// for the same reason D5 has one: 6 declared anon doors are in this state after
// DD-116 fix 1, each needing its own judgement, and a gate that screams about
// all of them every run is a gate nobody reads. It fails on GROWTH.
const UNGATED_ANON_DOOR_QUERY = `
  with doors as (
    select d.schema_name, d.function_name, d.identity_args, d.gate_predicate,
           pg_get_functiondef(p.oid) as def,
           -- The function's OWN search_path, so an unqualified table name in its
           -- body can be resolved the way Postgres resolves it.
           coalesce((
             select string_to_array(
                      replace(replace(split_part(cfg, '=', 2), '"', ''), ' ', ''), ',')
             from unnest(p.proconfig) cfg
             where cfg like 'search\\_path=%'
           ), array['public']) as spath
    from platform.client_callable_door d
    join pg_catalog.pg_proc p on p.proname = d.function_name
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace and n.nspname = d.schema_name
    where p.prosecdef
      and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and pg_get_function_identity_arguments(p.oid) = d.identity_args
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  vis_tables as (
    select distinct c.table_schema as sch, c.table_name as tbl
    from information_schema.columns c
    where c.column_name in ('visibility', 'card_visibility')
      and c.table_schema not in ('information_schema', 'pg_catalog')
  ),
  -- The gate vocabulary, READ from the live database rather than guessed: every
  -- access predicate the iam schema actually publishes.
  gate_rx as (
    select '(' || array_to_string(array_agg(distinct p.proname), '|')
               || '|has_permission|resolve_share_token|card_visibility|\\mvisibility\\M)' as rx
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'iam'
      and pg_get_function_result(p.oid) in ('boolean', 'uuid[]', 'SETOF uuid')
      and p.proname ~ '^(has_|is_|can_|my_|org_|accessible_|discoverable_|membership_|runnable_|scraper_)'
  )
  select d.schema_name || '.' || d.function_name as fn,
         d.identity_args as args
  from doors d cross join gate_rx g
  where (
      -- DD-173 / B-74: where a door has DECLARED its own gate predicate
      -- (platform.client_callable_door.gate_predicate), that declaration is the whole
      -- check — RED only if the literal text is absent from the door's live body. This
      -- replaces vocabulary-guessing for every door that has been censused, and is why
      -- billing.public_plans() (predicate is_public) no longer depends on a fixed
      -- word list that never anticipated a plain column-name gate.
      (d.gate_predicate is not null and strpos(lower(d.def), lower(d.gate_predicate)) = 0)
      or (
        -- Fallback for every door NOT yet censused with a gate_predicate: the original
        -- vis-table + vocabulary heuristic, unchanged, so this migration can only make
        -- checked doors more precise — it cannot turn any other door's check off.
        d.gate_predicate is null
        and exists (
          select 1 from vis_tables v
          where d.def ~* ('\\m' || replace(v.sch || '.' || v.tbl, '.', '\\.') || '\\M')
             or (v.sch = any(d.spath) and d.def ~* ('\\m' || v.tbl || '\\M'))
        )
        and d.def !~* g.rx
        and d.identity_args !~* '(secret|token|code|pin|password|passcode|session)'
        and d.def !~* 'auth\\.uid\\(\\)'
      )
    )
  order by 1, 2
`;

interface UngatedDoorRow {
  fn: string;
  args: string;
}


// ─── D7: no client-executable SECURITY DEFINER function runs DDL ─────────────
//
// DD-146 / B-35 (2026-09-12). D5 asks whether an anon-callable definer DECLARED
// itself. D6 asks whether the declaration is honest about the rows behind it.
// D7 asks a different question entirely: what does the function DO? A
// SECURITY DEFINER owned by `postgres` whose body runs DDL is not a door at any
// width — it is the provisioner, and a client role holding EXECUTE on it is
// `ALTER TABLE` as the superuser over HTTP.
//
// Measured live before the fix (`platform` is in the authenticator role's
// `pgrst.db_schemas`, and anon/authenticated both hold schema USAGE, so every
// one of these was `/rest/v1/rpc/<name>` with the published anon key):
//
//   platform.retrofit_entity               anon+auth    alter table … add column, create/drop trigger
//   platform.create_entity_table           anon+auth+PUBLIC  create table / index / trigger
//   platform._drop_custom_field_index      anon+auth+PUBLIC  DROP INDEX
//   platform.enforce_definer_client_grants anon+auth+PUBLIC  revoke execute … (the §6d-4 guard itself)
//
// Proven live as `anon` in a rolled-back transaction:
//   select platform.retrofit_entity('__zz_nonexistent_probe_b35__', …)
//   -->  [P0001] retrofit_entity: public.__zz_nonexistent_probe_b35__ not found
// i.e. the privilege check PASSED and the body ran; only the deliberately
// nonexistent table name stopped it.
//
// THE RULE. A SECURITY DEFINER, non-trigger function that `anon`,
// `authenticated` or `PUBLIC` can EXECUTE may not contain DDL unless its body
// names a platform-admin gate (`is_super_admin` / `is_platform_admin` /
// `is_admin(` / `admin.admins`). Two genuinely gated functions live in that
// state today and are meant to: `public.admin_set_association_enforcement`
// (`IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'admin only'`) and
// `public.admin_spend_breakdown` (same opening; its DDL is a CREATE TEMP TABLE
// in the caller's own temp schema).
//
// DDL is matched per LINE, deliberately: a body whose only "create table" is
// inside `format('Failed to create table: %s', SQLERRM)` is not a DDL function
// (`public.create_new_user_table_dynamic` is exactly that), so a line qualifies
// only when it pairs `execute` with a DDL statement shape, or when the line
// itself STARTS with one. Like D1/D3/D4 this is an ABSOLUTE — no baseline, no
// allowlist. The population is zero, and zero is the only correct number.
const CLIENT_DEFINER_DDL_QUERY = `
  select n.nspname || '.' || p.proname as fn,
         pg_get_function_identity_arguments(p.oid) as args,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
         (p.proacl is null or exists (
            select 1 from aclexplode(p.proacl) a
            where a.grantee = 0 and a.privilege_type = 'EXECUTE')) as public_x
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and p.prokind = 'f'
    and p.prorettype <> 'trigger'::regtype
    and n.nspname not in ('pg_catalog','information_schema','pgsodium','pgsodium_masks',
                          'extensions','graphql','graphql_public','vault','auth','storage',
                          'realtime','supabase_functions','supabase_migrations','net','cron','pgbouncer')
    and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or p.proacl is null
      or exists (select 1 from aclexplode(p.proacl) a
                 where a.grantee = 0 and a.privilege_type = 'EXECUTE')
    )
    and p.prosrc !~* '(is_super_admin|is_platform_admin|admin\\.admins|\\mis_admin\\s*\\()'
    and exists (
      select 1 from unnest(string_to_array(p.prosrc, chr(10))) l
      where (l ~* '\\mexecute\\M' and l ~* '\\m(alter|create|drop|truncate)\\s+(table|index|trigger|view|policy|schema|type|sequence|materialized|unique|or\\s+replace|extension)\\M')
         or (l ~* '\\mexecute\\M' and l ~* '\\m(grant|revoke)\\s+(execute|all|select|insert|update|delete)\\M')
         or (l ~* '^\\s*(alter|create|drop|truncate)\\s+(table|index|trigger|view|policy|schema|type|sequence|materialized|unique)\\M')
         or (l ~* '^\\s*(grant|revoke)\\s+(execute|all|select|insert|update|delete)\\M')
    )
  order by 1, 2
`;

interface DefinerDdlRow {
  fn: string;
  args: string;
  anon_x: boolean;
  auth_x: boolean;
  public_x: boolean;
}

// ─── D8: no container-authority caller compares a role that can be NULL ──────
//
// DD-191 / B-85 (2026-09-13). `iam._container_authz` answers with the actor's
// membership role in a container, and for a NON-MEMBER that role is NULL.
// Three callers compared it with `not in`:
//
//     if v_personal or v_actor_role not in ('owner', 'admin') then raise ...
//
// `NULL not in (...)` is NULL, `false or NULL` is NULL, the `if` never fires,
// and the refusal is dead code for exactly the population it exists to stop.
// Measured live over HTTPS as `test@test.com`, a member of NEITHER organization:
// `inv_list` returned AI Matrx's pending invitation WITH its acceptance token,
// `inv_get_managed` returned the whole row, and `inv_create` minted an ADMIN
// invitation into that organization (rolled back, 0 rows persisted).
//
// The structural fix is in the helper — it now raises 42501 before any caller
// can compare anything. D8 is the second half, the belt to that brace: no
// caller may reach a role comparison that a NULL can walk through, so the
// guard still holds if a future edit opts a caller out of the strict helper.
//
// THE RULE. In any function whose body calls `iam._container_authz`, every
// comparison of an `actor_role` variable must be wrapped in `coalesce(...)`.
// The query strips the coalesce-wrapped uses first, then looks for any bare
// `actor_role` still standing next to `in (`, `not in (`, `=`, `<>` or
// `is distinct from`. Assignments and `select ... into` are not comparisons and
// do not match. Like D1/D3/D4/D7 this is an ABSOLUTE — the population is zero.
//
// Proven failing-then-passing 2026-09-13 against the live database: with the
// pre-fix `public.inv_list` body restored inside a rolled-back transaction the
// query returns that one row; against the shipped bodies it returns none.
const NULL_UNSAFE_ROLE_TEST_QUERY = `
  with bodies as (
    select n.nspname || '.' || p.proname as fn,
           pg_get_function_identity_arguments(p.oid) as args,
           regexp_replace(
             p.prosrc,
             'coalesce\\s*\\(\\s*[a-z_]*\\.?[a-z_]*actor_role\\b[^)]*\\)',
             'ROLE_SAFE', 'gi') as src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosrc like '%_container_authz%'
      and p.proname <> '_container_authz'
  )
  select fn, args
  from bodies
  where src ~* '[a-z_]*\\.?[a-z_]*actor_role\\s*(not\\s+in\\s*\\(|in\\s*\\(|=|<>|is\\s+distinct\\s+from)'
  order by 1
`;

interface NullUnsafeRoleRow {
  fn: string;
  args: string;
}

// ─── D9: no SECURITY INVOKER writer is reachable by a signed-out caller ──────
//
// DD-197 / B-89 (2026-09-13). D5 asks whether an anon-callable SECURITY DEFINER
// declared itself a door. D9 asks the question D5 cannot: what about the
// functions that are NOT definers? An invoker runs as the caller, so it was
// treated as harmless — and B-75's "the declared doors hold no anon" was read as
// if it covered the whole anonymous EXECUTE surface. It did not: it bounded the
// 471 functions somebody had registered, and said nothing about the 66 nobody had.
//
// THE RULE. A SECURITY INVOKER, non-trigger function in a PostgREST-exposed
// schema whose body writes may not be executable by `anon` unless a
// `platform.client_callable_door` row declares it with `anonymous_callers = true`.
//
// 🚨 DD-212 (2026-09-14) CHANGED WHAT "DECLARES" MEANS. Until then this test was
// `reason ~* '(anonymous|signed[- ]out|guest|kiosk|outsider)'` — a substring over
// prose, and prose has no polarity. V-68 planted a row reading "SIGNED-IN door
// (authenticated only; anon revoked). No anonymous caller exists for it in any
// repo." on a new INVOKER function and the DD-202 birth guard, reading the same
// regex, let it keep `anon` EXECUTE: a sentence that said the OPPOSITE of an
// anonymous purpose opened the door. It was not a rare wording either — 314 of
// 971 live door rows matched that regex while only 47 named a function `anon`
// could actually execute. The declaration is now a FLAG a human sets beside an
// `anonymous_purpose` sentence, and D12 below keeps the flag honest against the
// live grant. No regex over `reason` decides anything here any more.
const ANON_INVOKER_WRITER_QUERY = `
  select n.nspname || '.' || p.proname as fn,
         pg_get_function_identity_arguments(p.oid) as args,
         (p.proacl is null) as via_public_default,
         (select count(*) from platform.client_callable_door d
           where d.schema_name = n.nspname and d.function_name = p.proname)::int as door_rows
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where not p.prosecdef
    and p.prokind = 'f'
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.prosrc ~* '(^|[^a-z_.])(insert into|update |delete from|merge into)'
    and n.nspname = any (array[
      'api','public','rag','scraper','workflow','files','legal','knowledge','agent','ai','app',
      'chat','context','skill','tool','workspace','work','admin','billing','browser','canvas',
      'code','communication','content_ir','crm','dictionary','docproc','education','extend',
      'graveyard','growth','hindsight','history','iam','interview','marketing','meta','ops','pdf',
      'plan','platform','podcast','research','runtime','scheduler','seo','transcripts','ui',
      'users','web','workbench','assignment','audit','batch','mandate','commerce'])
    and not exists (
      select 1 from platform.client_callable_door d
      where d.schema_name = n.nspname
        and d.function_name = p.proname
        and d.anonymous_callers
    )
  order by 1, 2
`;

interface AnonInvokerWriterRow {
  fn: string;
  args: string;
  via_public_default: boolean;
  door_rows: number;
}

// ─── D10: no membership-role reader lets a NULL past a comparison ────────────
//
// DD-199 / B-91 (2026-09-13), the generalisation of D8. D8 guards ONE family —
// callers of `iam._container_authz` and their `actor_role`. V-54 proved the same
// class open one helper family over: `hr._l1_org_role(user, org)` is a plain
// `select m.role from iam.memberships …`, NULL for a non-member, and two of its
// fourteen callers decided privilege from it with a bare `not in` / `in`:
//
//   public.hr_module_set_enabled('5dc930e9-… AI Matrx', true) as test@test.com,
//     a member of neither organization → {"ok": true, "module_enabled": true}.
//     A stranger switched another organization's HR module ON (rolled back).
//   POST /rest/v1/rpc/hr_knob_index {"p_organization_id":"5dc930e9-…"} → HTTP 200,
//     the whole knob index of an organization the caller does not belong to.
//
// THE RULE, and it is an ABSOLUTE (population zero). In any function that reads
// an organization membership role — either by calling `hr._l1_org_role` or with
// `select … role into <var>` from `iam.memberships` / `iam.organization_member` —
// every comparison of that role must be NULL-safe: wrapped in `coalesce(...)`, or
// written as `is null` / `is not null` / `is [not] distinct from`. A bare `in (`,
// `not in (`, `=` or `<>` on a value a NULL can reach is a finding, because
// `NULL not in (…)` is NULL and the `if` that refuses never fires.
//
// The query has two halves: tainted VARIABLES (assigned from the helper or from
// a `role into` select) and INLINE call sites compared in place. Both were proven
// failing-then-passing 2026-09-13 against the live database, with the pre-fix
// `public.hr_module_set_enabled` body (variable half) and the pre-fix
// `public.hr_knob_index` body (inline half) restored inside rolled-back
// transactions: one row each while restored, zero rows after the rollback. No
// file on disk was weakened to produce either RED.
const NULL_UNSAFE_ROLE_HELPER_QUERY = `
  with cand as (
    select n.nspname || '.' || p.proname as fn,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prosrc as raw
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog','information_schema','pg_toast','extensions',
                            'graphql','graphql_public','pgbouncer','vault','realtime','storage',
                            'supabase_functions','net','cron','auth','pgsodium','pgsodium_masks')
      and p.proname <> '_l1_org_role'
      and (p.prosrc ~ 'hr[.]_l1_org_role'
           or p.prosrc ~* '[^a-z_]role[[:space:]]+into[[:space:]]+[a-z_]+'
           or p.prosrc ~* '[.]role[[:space:]]+into[[:space:]]+[a-z_]+')
  ),
  names as (
    select c.fn, c.args, c.raw, z.nm
    from cand c
    cross join lateral (
      select m[1] as nm from regexp_matches(c.raw, '([a-z_]+)[[:space:]]*:=[[:space:]]*hr[.]_l1_org_role', 'gi') m
      union
      select m[1] from regexp_matches(c.raw, '[^a-z_.]role[[:space:]]+into[[:space:]]+([a-z_]+)', 'gi') m
      union
      select m[1] from regexp_matches(c.raw, '[.]role[[:space:]]+into[[:space:]]+([a-z_]+)', 'gi') m
    ) z
  ),
  var_unsafe as (
    select fn, args, nm as site
    from (
      select fn, args, nm,
             regexp_replace(
               regexp_replace(raw,
                 'coalesce[[:space:]]*\\([[:space:]]*' || nm || '\\M[^)]*\\)', 'ROLE_SAFE', 'gi'),
               nm || '\\M[[:space:]]+is[[:space:]]+(not[[:space:]]+)?(null|distinct[[:space:]]+from)',
               'ROLE_SAFE', 'gi') as s
      from names
    ) z
    where s ~ ('(^|[^a-z_.])' || nm ||
               '\\M[[:space:]]*(not[[:space:]]+in[[:space:]]*\\(|in[[:space:]]*\\(|=[^=]|<>)')
  ),
  call_unsafe as (
    select fn, args, 'hr._l1_org_role(...)' as site
    from (
      select fn, args,
             regexp_replace(raw,
               'coalesce[[:space:]]*\\([[:space:]]*hr[.]_l1_org_role[[:space:]]*\\([^()]*\\)[^)]*\\)',
               'ROLE_SAFE', 'gi') as s
      from cand
      where raw ~ 'hr[.]_l1_org_role'
    ) z
    where s ~* 'hr[.]_l1_org_role[[:space:]]*\\([^()]*\\)[[:space:]]*(not[[:space:]]+in[[:space:]]*\\(|in[[:space:]]*\\(|=[^=]|<>)'
  )
  select fn, args, site from var_unsafe
  union all
  select fn, args, site from call_unsafe
  order by 1, 3
`;

// ─── D12: in HR a capability is asked before a role ─────────────────────────
//
// DD-206 (2026-09-14), the chair's ruling: a capability is an authority in its
// own right everywhere in HR, and every HR door tests capability first, then
// role, in that order.
//
// WHY THE ORDER IS THE WHOLE DEFECT. `hr.capability` resolves through
// `hr.employments_of` → `hr.role_assignment` → `hr.access_role.capabilities`,
// tenant-bounded by `ra.organization_id`. It never reads `iam.memberships`. So
// an HR admin whose standing is an EMPLOYMENT and not a membership row is
// constructible, and V-61/V-67/B-98 constructed one (rolled back) and measured
// the same identity, same organization, same probe run:
//
//   hr_knob_index      -> ADMITTED, 215 keys
//   hr_structure_list  -> 42501 "hr_structure_list: no standing in this employer"
//   hr_directory_list  -> 42501 "hr_directory_list: no standing in this employer"
//   hr_org_chart       -> 42501 "hr_org_chart: no standing in this employer"
//
// Each refusal fired on `role is null` BEFORE the body ever asked about a
// capability — in `hr_structure_list` the capability call sits nine lines below
// the raise it can never reach.
//
// THE RULE. In any function that reads both a capability and an organization
// membership role, the FIRST capability reference must precede the FIRST
// membership-role reference whenever a `raise` or a `return` sits between them.
// A lenient role READ ahead of a capability is not a finding — `hr._l1_viewer`
// resolves `v_org_role` first and then decides self → capability → manager →
// role, which IS capability-first — because nothing refuses in between. What is
// a finding is a REFUSAL decided from a role the body has not yet earned the
// right to decide from.
//
// Comments are stripped first (`--` to end of line, and `/* … */`), so a
// migration's prose about `hr._l1_org_role` cannot make a correct door look
// wrong. `hr.capability`, `hr._l1_capabilities` and `hr._l1_org_role` are
// excluded from the population: they ARE the readers.
//
// Proven failing-then-passing 2026-09-14 against the live database with a
// rolled-back restore of the pre-fix `public.hr_structure_list` body — one row
// while restored, zero rows after the rollback. No file on disk was weakened to
// produce the RED. ABSOLUTE: no baseline, no allowlist.
const ROLE_BEFORE_CAPABILITY_QUERY = `
  with stripped as (
    select n.nspname || '.' || p.proname as fn,
           pg_get_function_identity_arguments(p.oid) as args,
           regexp_replace(
             regexp_replace(p.prosrc, '/\\*.*?\\*/', ' ', 'gs'),
             '--[^' || chr(10) || ']*', ' ', 'g') as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname not in ('pg_catalog','information_schema','pg_toast','extensions',
                             'graphql','graphql_public','pgbouncer','vault','realtime','storage',
                             'supabase_functions','net','cron','auth','pgsodium','pgsodium_masks')
       and p.prokind in ('f','p')
       and p.proname not in ('capability','_l1_capabilities','_l1_org_role')
  ),
  pos as (
    select fn, args, src,
           least(nullif(strpos(src, 'hr.capability('), 0),
                 nullif(strpos(src, 'hr._l1_capabilities('), 0)) as cap_pos,
           least(nullif(strpos(src, 'hr._l1_org_role('), 0),
                 (select nullif(strpos(src, t.m), 0)
                    from (select substring(src from
                            '[^a-z_.]role[[:space:]]+into[[:space:]]+[a-z_]+') as m) t
                   where t.m is not null)) as role_pos
      from stripped
     where (strpos(src, 'hr.capability(') > 0 or strpos(src, 'hr._l1_capabilities(') > 0)
  )
  select fn, args,
         substring(btrim(regexp_replace(
           substring(src from role_pos for (cap_pos - role_pos)),
           '[[:space:]]+', ' ', 'g')) for 150) as between_text
    from pos
   where cap_pos is not null
     and role_pos is not null
     and role_pos < cap_pos
     and substring(src from role_pos for (cap_pos - role_pos))
           ~* '(raise[[:space:]]+exception|[^a-z_]return[^a-z_])'
   order by 1, 2
`;

interface RoleBeforeCapabilityRow {
  fn: string;
  args: string;
  between_text: string;
}

// ─── D11: a door's declared reason names the gate its body actually reaches ──
//
// DD-195 (2026-09-13). D5 asks whether an anon-callable definer DECLARED itself; D6 asks whether
// the declared `gate_predicate` is still in the body. Neither reads the REASON — the English
// sentence every later reviewer trusts instead of opening the function.
//
// Measured live before the DD-195 migration: `platform.client_callable_door` said of
// `public.assoc_for_entity`, `assoc_for_sources` and `assoc_for_targets` that each "resolves access
// per entity via iam.has_access before touching an edge". Not one of the three had ever called
// `iam.has_access`. All three are SECURITY DEFINER over `platform.associations`, so they bypass its
// RLS entirely, and their whole gate was an ORGANIZATION-level predicate — a plain member of the
// row's organization was handed edges revealing rows the kernel said they could not read (two
// `personal` conversations and the `personal` working document they hang off, all authored by
// somebody else). The body was the defect; the sentence is what kept anyone from finding it.
//
// THE RULE. If a door's reason names an ACCESS PREDICATE from the live gate vocabulary, the door
// must actually reach that predicate. Three deliberate choices:
//
//  (a) THE VOCABULARY IS READ FROM THE DATABASE, never guessed — the same derivation D6 uses (every
//      boolean / `uuid[]` / `SETOF uuid` function in `iam` whose name starts with an access-predicate
//      prefix). So prose that merely mentions `iam.entity_read_expr` (returns text) or
//      `iam.canonical_certify` is not a gate claim and is not a finding, and a new platform gate is
//      understood the day it ships without editing this file.
//  (b) ONE HOP. A door that reaches the kernel through a named helper is honest — `assoc_for_entity`
//      now calls `iam.assoc_side_readable`, which calls `iam.has_access` — so the closure is the
//      door's own body PLUS the bodies of the functions its body names. Only suspects pay for that
//      second pass, so the cost is bounded by the finding count, not by the door count.
//  (c) ABSOLUTE — no baseline, no allowlist. The population was 3 and is now 0, and zero is the only
//      correct number: a reason that overstates its gate can always be rewritten to the truth.
const REASON_CLAIMS_UNREACHED_GATE_QUERY = `
  with gate_vocab as (
    select distinct lower('iam.' || p.proname) as fn
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'iam'
       and pg_get_function_result(p.oid) in ('boolean', 'uuid[]', 'SETOF uuid')
       and p.proname ~ '^(has_|is_|can_|my_|org_|accessible_|discoverable_|membership_|runnable_|scraper_|assoc_)'
  ),
  doors as (
    select d.schema_name, d.function_name, d.identity_args, d.reason,
           p.oid as oid, pg_get_functiondef(p.oid) as def
      from platform.client_callable_door d
      join pg_catalog.pg_proc p on p.proname = d.function_name
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace and n.nspname = d.schema_name
     where p.prokind = 'f'
       and pg_get_function_identity_arguments(p.oid) = d.identity_args
  ),
  suspects as (
    select d.schema_name, d.function_name, d.identity_args, d.def, m.claimed
      from doors d
      cross join lateral (
        select distinct lower(x[1]) as claimed
          from regexp_matches(d.reason, '(iam\\.[a-z_][a-z0-9_]*)', 'g') x
      ) m
     where m.claimed in (select fn from gate_vocab)
       and strpos(lower(d.def), m.claimed) = 0
  )
  select s.schema_name || '.' || s.function_name as fn,
         s.identity_args as args,
         s.claimed as claimed
    from suspects s
   where not exists (
     select 1
       from pg_catalog.pg_proc h
       join pg_catalog.pg_namespace hn on hn.oid = h.pronamespace
      where hn.nspname in ('iam', 'public', 'platform')
        and h.prokind = 'f'
        and strpos(lower(s.def), lower(hn.nspname || '.' || h.proname)) > 0
        and strpos(lower(pg_get_functiondef(h.oid)), s.claimed) > 0
   )
   order by 1, 3
`;

interface ReasonClaimRow {
  fn: string;
  args: string;
  claimed: string;
}

interface NullUnsafeRoleHelperRow {
  fn: string;
  args: string;
  site: string;
}

// ─── D14: an association door's reason names BOTH ends of the edge ───────────
//
// DD-205 (2026-09-14). D11 asks whether a door reaches the gate it names. This asks the question
// D11 cannot: whether the sentence is COMPLETE. An association row has two subjects — the anchor the
// caller named and the row at the other end — and every one of the eleven `assoc_*` doors touches
// both. Until DD-205 the readers gated one of them, and the door register said so in a sentence that
// was true and incomplete: "The door does NOT gate the anchor the caller named, so a caller holding
// an id they cannot read can still learn an edge touches it." Measured live the day after: as a
// plain member of the row's organization, passing nine `confidential` `personal` `agent_run` ids the
// kernel refused him as the ANCHOR returned all nine edges, with their roles, labels, positions and
// metadata. Two more doors carried the same shape unnoticed — `assoc_list` gated only the anchor,
// `assoc_members_visible` admitted an edge on an organization predicate OR'd with the anchor check.
//
// THE RULE, and why it is worded as prose rather than as body analysis. The bodies of these eleven
// doors gate their ends five different ways (a materialized anchor boolean, a reduced id array, an
// up-front RAISE, a per-edge conjunct, and one hop down into `assoc_add`/`assoc_remove`), so no
// single structural pattern recognises "both ends are gated" across all of them without lying about
// at least one. What every one of them CAN do is say which ends it gates, in the register row that
// is the only thing most reviewers ever read. So: the reason must contain `both ends`, and must not
// contain a disclaimer that an end is ungated. A door that genuinely gates one end may not pass this
// by rewording — it has to be fixed, and then the sentence is true. ABSOLUTE: no baseline.
const ASSOC_DOOR_REASON_QUERY = `
  select d.schema_name || '.' || d.function_name as fn,
         d.identity_args as args,
         case
           when d.reason ~* 'not gate the (anchor|other|far)'
             then 'its reason DISCLAIMS gating an end'
           else 'its reason never says what happens to BOTH ENDS'
         end as problem
    from platform.client_callable_door d
   where d.function_name ~ '^assoc_'
     and (d.reason !~* 'both ends' or d.reason ~* 'not gate the (anchor|other|far)')
   order by 1
`;

interface AssocDoorReasonRow {
  fn: string;
  args: string;
  problem: string;
}

// ─── D13: the declared flag and the live anon grant say the same thing ───────
//
// DD-212 / DD-207 (2026-09-14). Every other arm here asks about the DATABASE.
// This one asks whether the REGISTER still tells the truth about it, because
// after DD-212 the register is what the birth trigger and D5/D9 obey. Two ways
// it can lie, and both have happened:
//
//   * `anonymous_callers = true` while `anon` holds no EXECUTE — a door row that
//     will hand a `CREATE OR REPLACE` its anon grant back at birth, for a
//     function somebody deliberately closed. A stand-down waiting for a rebuild.
//   * `anonymous_callers = false` while `anon` DOES hold EXECUTE — DD-207's
//     class, measured at 16 rows on 2026-09-14: `public.admin_spend_headline`
//     declared SUPER-ADMIN-ONLY with `anon` holding EXECUTE, plus the four
//     `ues_*`, the four `cmt_*`, `cat_list`, `can_curate_library_document`
//     (whose reason claimed "2 live policies, anon included" — zero policies
//     named it and `anon` could not SELECT the table at all), the two
//     `agx_get_shared_*`, `agx_build_shortcut_menu_m` and
//     `platform._confirmation_admission`. Fifteen were revoked and
//     `log_client_error` was declared; the population is 0 and 0 is the only
//     correct number.
//
// Rows whose function does not exist under that exact identity_args are OUT of
// the population — 28 of them on 2026-09-14, a separate staleness question this
// arm must not silently answer. ABSOLUTE: no baseline, no allowlist.
const DOOR_FLAG_VS_GRANT_QUERY = `
  select d.schema_name || '.' || d.function_name as fn,
         d.identity_args as args,
         d.anonymous_callers as flag,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_executes,
         (d.anonymous_purpose is not null) as has_purpose
    from platform.client_callable_door d
    join pg_catalog.pg_namespace n on n.nspname = d.schema_name
    join pg_catalog.pg_proc p
      on p.pronamespace = n.oid
     and p.proname = d.function_name
     -- 🚨 DD-223: the catalog's key, not the rendered signature. An exact string
     -- join here dropped web.create_site out of D13's population entirely,
     -- because its row is spelled the way the 6d-4 guard renders it and this
     -- gate reads over PostgREST under a different search_path.
     and platform.door_argtypes(p.proargtypes) = d.identity_argtypes
   where d.anonymous_callers <> has_function_privilege('anon', p.oid, 'EXECUTE')
   order by 1, 2
`;

interface DoorFlagRow {
  fn: string;
  args: string;
  flag: boolean;
  anon_executes: boolean;
  has_purpose: boolean;
}

// ─── D15/D16: the register names only LIVE, correctly granted doors ──────────
//
// DD-210 (B-108, 2026-09-14). D13 asks whether a door row's anonymous flag
// matches the live grant, over the rows whose function it can find. These two ask
// the questions D13 deliberately left open, in both directions:
//
//   D15  Does the row name anything at all? 28 of the 971 rows named no live
//        function under their identity_args: 15 were a second, wrongly-spelled
//        copy of a door already declared correctly, 11 named a live function no
//        client may execute (the access kernel's internal helpers), and 2 spelled
//        `(view)` for a VIEW entered in a FUNCTION register. None of them was
//        inert: the §6d-4 guard STANDS DOWN on a function that has a door row, so
//        a row that names nothing is a stand-down reserved for a name.
//
//   D16  Does the grant match the declaration, BOTH WAYS?
//          (a) `signed_in_callers` / `anonymous_callers` against the live
//              `authenticated` / `anon` EXECUTE grant. A TRUE with no grant is a
//              door the platform believes it has and nobody can open; a FALSE
//              with a grant is a door nobody declared.
//          (b) A SECURITY DEFINER function a CLIENT can execute with no door row
//              at all. D5 asks this for `anon` against a shrink-only baseline;
//              this asks it for `authenticated`, where the population is 0 and 0
//              is the only correct number (DD-169 finished the census).
//
// 🚨 WHY THE COMPARISON STRIPS SCHEMA QUALIFIERS FROM BOTH SIDES.
// `pg_get_function_identity_arguments` renders a type BARE when its schema is on
// the caller's search_path and SCHEMA-QUALIFIED when it is not, so the SAME row
// matches or does not match depending on who asks. The §6d-4 guard reads the
// register under `SET search_path TO 'platform', 'public', 'pg_catalog'`; this
// gate reads it over PostgREST as `"$user", public, extensions`. Measured
// 2026-09-14: `web.create_site`'s row is spelled `p_visibility visibility` — the
// guard's rendering, and the one that keeps the guard from revoking the site
// builder's grant — and an exact string join from HERE drops it silently. So both
// sides are normalised (`platform.visibility` → `visibility`) and a normalised
// match that is not unique is itself a finding. The deeper fix is to key the
// register on `proargtypes` the way `platform.definer_client_grant_grandfather`
// already does (hr_l3_109) — that is a change to the §6d-4 guard, reported to the
// Data Doctrine chair rather than made here.
//
// 🚨 DD-223 (B-118, 2026-09-14) CLOSED THE CLASS THE PARAGRAPH ABOVE DESCRIBES.
// Stripping schema qualifiers from both sides made two renderings comparable; it
// did not make either of them an identity, and two different functions in the same
// schema could still normalise to the same string. `platform.client_callable_door`
// now carries `identity_argtypes` — `pg_proc.proargtypes` through
// `platform.door_argtypes` — and every arm below joins on THAT. `identity_args` is
// a display column from today; nothing matches on it anywhere in this file, in
// either DDL guard, or in the database.
const DOOR_KEY = `d.identity_argtypes`;
const FN_KEY = `platform.door_argtypes(p.proargtypes)`;

const STALE_DOOR_ROW_QUERY = `
  select d.schema_name || '.' || d.function_name as fn,
         d.identity_args as args,
         coalesce(d.declared_by, '(none)') as declared_by,
         (select count(*) from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = d.schema_name and p.proname = d.function_name) as siblings
    from platform.client_callable_door d
   where (select count(*) from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
           where n.nspname = d.schema_name and p.proname = d.function_name
             and ${FN_KEY} = ${DOOR_KEY}) <> 1
   order by 1, 2
`;

interface StaleDoorRow {
  fn: string;
  args: string;
  declared_by: string;
  siblings: number;
}

const DOOR_GRANT_VS_DECLARATION_QUERY = `
  select d.schema_name || '.' || d.function_name as fn,
         d.identity_args as args,
         d.signed_in_callers as signed_in_flag,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_executes,
         d.anonymous_callers as anon_flag,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_executes
    from platform.client_callable_door d
    join pg_catalog.pg_namespace n on n.nspname = d.schema_name
    join pg_catalog.pg_proc p
      on p.pronamespace = n.oid
     and p.proname = d.function_name
     and ${FN_KEY} = ${DOOR_KEY}
   where d.signed_in_callers <> has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or d.anonymous_callers <> has_function_privilege('anon', p.oid, 'EXECUTE')
   order by 1, 2
`;

interface DoorGrantRow {
  fn: string;
  args: string;
  signed_in_flag: boolean;
  auth_executes: boolean;
  anon_flag: boolean;
  anon_executes: boolean;
}

// The §6d-4 guard's own exempt-schema list, verbatim, plus its extension and
// grandfather escapes — so this arm names exactly the functions the guard would
// have closed, and never an extension's function this role cannot revoke.
const UNDECLARED_CLIENT_DEFINER_QUERY = `
  select n.nspname || '.' || p.proname as fn,
         pg_get_function_identity_arguments(p.oid) as args,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and p.prokind in ('f','p')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and n.nspname <> all (array['pg_catalog','information_schema','pg_toast','extensions','graphql',
                                 'graphql_public','pgbouncer','realtime','_realtime','storage','auth',
                                 'cron','net','vault','pgsodium','pgsodium_masks','supabase_functions',
                                 'supabase_migrations','dashboard','pgtle','tiger','tiger_data','topology'])
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and not exists (select 1 from pg_catalog.pg_depend dp where dp.objid = p.oid and dp.deptype = 'e')
     and not exists (select 1 from platform.definer_client_grant_grandfather g
                      where g.schema_name = n.nspname and g.function_name = p.proname
                        and g.argtypes = p.proargtypes::text)
     and not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = n.nspname and d.function_name = p.proname
                        and ${DOOR_KEY} = ${FN_KEY})
   order by 1, 2
`;

interface UndeclaredClientDefinerRow {
  fn: string;
  args: string;
  anon_x: boolean;
  auth_x: boolean;
}

// ─── D17: the by-design allowlist is fully reasoned ──────────────────────────
//
// `scripts/door-rows/by-design-allowlist.json` excuses a door that crosses the
// organization boundary ON PURPOSE from the wide `check:door-rows` lane — the
// single most dangerous shape on this platform. That gate already refuses an
// entry with no owner or a one-word reason and FAILS on a stale entry (DD-208).
// DD-210 adds the third thing a reader needs and the file did not carry: the
// SHAPE the entry permits — what crosses, in which direction, and how far. It is
// checked here rather than in `check-door-rows.ts` only because another lane owns
// that file this week; the two gates run side by side in the blocking list.
// ABSOLUTE: no baseline. The file may only shrink.
interface ByDesignEntry {
  door: string;
  owner: string;
  reason: string;
  shape?: string;
}

interface ByDesignAllowlist {
  entries: ByDesignEntry[];
}

function loadByDesignAllowlist(): ByDesignAllowlist | null {
  const p = resolve(ROOT, "scripts/door-rows/by-design-allowlist.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ByDesignAllowlist;
  } catch {
    return null;
  }
}

// ─── D18: no closed helper is reached by a client path ───────────────────────
//
// See the D18 header note. `closed` is (role, schema, name) where NO overload is
// executable — a name-only match cannot tell overloads apart, so a function with
// one open overload is never reported. An unqualified call resolves against the
// caller's own `search_path` (or `public`), and is skipped when any schema on that
// path holds an executable function of the name. Every name is rendered from the
// catalog (schema + relname / oidvectortypes), never through `::regclass` or
// `::regprocedure`, which drop the schema for whatever the session's search_path
// holds and would make the baseline keys depend on who runs the gate.
//
// One statement per KIND of client path: `execute_admin_query` dies at ~8 s, and
// the single union over every kind measured 25 s. Each body is tokenized ONCE
// (`bodies`), however many roles reach it.
const REACH_KINDS = ["trigger", "invoker", "policy", "view", "default"] as const;
type ReachKind = (typeof REACH_KINDS)[number];

const REACH_FN_PATH = `coalesce((select string_to_array(replace(replace(substring(c from '^search_path=(.*)$'), '"', ''), ' ', ''), ',')
                       from unnest(p.proconfig) c where c like 'search_path=%'), array['public'])`;
const REACH_FN_SIG = `n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')'`;
const REACH_INVOKER_FN = `not p.prosecdef
       and p.prolang in (select oid from pg_catalog.pg_language where lanname in ('plpgsql', 'sql'))
       and n.nspname not like 'pg\\_%' and n.nspname <> 'information_schema'
       and not exists (select 1 from pg_catalog.pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')`;

// Every arm yields (r, via, caller, obj_key, body, path).
const REACH_SRC: Record<ReachKind, string> = {
  trigger: `
    select ro.r, 'trigger on ' || tn.nspname || '.' || tc.relname as via, ${REACH_FN_SIG} as caller,
           'fn:' || p.oid as obj_key, p.prosrc as body, ${REACH_FN_PATH} as path
      from roles ro
      cross join pg_catalog.pg_trigger t
      join pg_catalog.pg_proc p on p.oid = t.tgfoid
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      join pg_catalog.pg_class tc on tc.oid = t.tgrelid
      join pg_catalog.pg_namespace tn on tn.oid = tc.relnamespace
     where ${REACH_INVOKER_FN}
       and not t.tgisinternal and t.tgenabled <> 'D'
       and (has_table_privilege(ro.r, t.tgrelid, 'INSERT')
         or has_table_privilege(ro.r, t.tgrelid, 'UPDATE')
         or has_table_privilege(ro.r, t.tgrelid, 'DELETE'))`,
  invoker: `
    select ro.r, 'client-executable invoker function' as via, ${REACH_FN_SIG} as caller,
           'fn:' || p.oid as obj_key, p.prosrc as body, ${REACH_FN_PATH} as path
      from roles ro
      cross join pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where ${REACH_INVOKER_FN}
       and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
       and has_function_privilege(ro.r, p.oid, 'EXECUTE')
       and (ro.r = 'authenticated' or exists (
             select 1 from platform.client_callable_door d
              where d.schema_name = n.nspname and d.function_name = p.proname
                and d.identity_argtypes = platform.door_argtypes(p.proargtypes) and d.anonymous_callers))`,
  policy: `
    select ro.r, 'policy ' || pol.policyname || ' on ' || pol.schemaname || '.' || pol.tablename as via,
           '' as caller, 'policy:' || pol.schemaname || '.' || pol.tablename || '.' || pol.policyname as obj_key,
           coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') as body, array['public'] as path
      from roles ro cross join pg_catalog.pg_policies pol
     where pol.roles && array[ro.r::name, 'public'::name]
       and has_any_column_privilege(ro.r, format('%I.%I', pol.schemaname, pol.tablename)::regclass,
                                    'SELECT,INSERT,UPDATE')`,
  view: `
    select ro.r, 'view ' || vn.nspname || '.' || vc.relname as via, '' as caller,
           'view:' || vc.oid as obj_key, pg_get_viewdef(vc.oid) as body, array['public'] as path
      from roles ro
      cross join pg_catalog.pg_class vc
      join pg_catalog.pg_namespace vn on vn.oid = vc.relnamespace
     where vc.relkind in ('v', 'm')
       and vn.nspname not like 'pg\\_%' and vn.nspname <> 'information_schema'
       and has_table_privilege(ro.r, vc.oid, 'SELECT')`,
  default: `
    select ro.r, 'column default on ' || dn.nspname || '.' || dc.relname as via, '' as caller,
           'default:' || ad.oid as obj_key, pg_get_expr(ad.adbin, ad.adrelid) as body, array['public'] as path
      from roles ro
      cross join pg_catalog.pg_attrdef ad
      join pg_catalog.pg_class dc on dc.oid = ad.adrelid
      join pg_catalog.pg_namespace dn on dn.oid = dc.relnamespace
     where has_table_privilege(ro.r, ad.adrelid, 'INSERT')`,
};

function closedHelperReachQuery(kind: ReachKind): string {
  return `
  with roles(r) as (values ('authenticated'), ('anon')),
  fns as (
    select p.oid, n.nspname as sch, p.proname as nm
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where p.prokind = 'f'
       and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
       and n.nspname not like 'pg\\_%' and n.nspname <> 'information_schema'
  ),
  reach as (
    select ro.r, f.sch, f.nm, bool_or(has_function_privilege(ro.r, f.oid, 'EXECUTE')) as can
      from roles ro cross join fns f
     group by ro.r, f.sch, f.nm
  ),
  closed as materialized (select r, sch, nm from reach where not can),
  open_by_name as materialized (
    select r, nm, array_agg(sch::text) as schs from reach where can group by r, nm
  ),
  src as materialized (${REACH_SRC[kind]}),
  bodies as (select distinct on (obj_key) obj_key, body from src),
  toks as (
    select distinct b.obj_key, lower(m[1]) as sch, lower(m[2]) as nm
      from bodies b
      cross join lateral regexp_matches(
        regexp_replace(regexp_replace(regexp_replace(b.body,
          '--[^\\n]*', '', 'g'),
          '/\\*([^*]|\\*+[^*/])*\\*+/', '', 'g'),
          '''([^'']|'''')*''', '''''', 'g'),
        '(([A-Za-z_][A-Za-z0-9_]*)"?\\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\\s*\\(', 'g') as mm(m0)
      cross join lateral (select array[mm.m0[2], mm.m0[3]] as m) x
  ),
  -- Tokens meet their source BEFORE the closed set: joined the other way the
  -- planner pairs every closed function with every source row on role alone
  -- (2M rows, a 500 MB on-disk sort, 6.6 s measured).
  src_toks as materialized (
    select s.r, s.via, s.caller, s.path, t.sch as tsch, t.nm as tnm
      from src s join toks t on t.obj_key = s.obj_key
  )
  select distinct st.r as role, st.via, coalesce(st.caller, '') as caller, c.sch || '.' || c.nm as callee
    from src_toks st
    join closed c on c.r = st.r and c.nm = st.tnm
    left join open_by_name o on o.r = st.r and o.nm = st.tnm
   where (st.tsch is not null and c.sch = st.tsch)
      or (st.tsch is null and c.sch = any (st.path)
          and not coalesce(o.schs && (st.path || array['pg_catalog']), false))
   order by 1, 4, 2, 3
`;
}

interface ClosedHelperReachRow {
  role: string;
  via: string;
  caller: string;
  callee: string;
}

interface ClosedHelperReachBaseline {
  entries: { key: string; reason: string }[];
}

function closedHelperReachKey(r: ClosedHelperReachRow): string {
  return `${r.role} | ${r.via} | ${r.caller} | ${r.callee}`;
}

function loadClosedHelperReachBaseline(): ClosedHelperReachBaseline | null {
  const p = resolve(ROOT, "scripts/impl-doors/closed-helper-reach-baseline.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ClosedHelperReachBaseline;
  } catch {
    return null;
  }
}

// ─── Baseline for D2 (may only shrink) ───────────────────────────────────────

interface Baseline {
  count: number;
  why: string;
  capturedAt: string;
}

function loadBaseline(
  file = "scripts/impl-doors/grandfather-baseline.json",
): Baseline | null {
  const p = resolve(ROOT, file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Baseline;
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const strict = process.argv.includes("--strict");
  const env = loadEnv();

  console.log(
    `${C.bold}Impl doors${C.reset} ${C.dim}(db-rules §6d-4 — an _impl_ helper is never a client door; DD-098)${C.reset}`,
  );

  if (!env) {
    console.log(
      `${TAG.warn}${C.bold}UNMEASURED${C.reset} — NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY absent, so nothing was checked.`,
    );
    console.log(
      `${C.dim}       This is NOT a pass. Set both and re-run, or run it where the creds live.${C.reset}`,
    );
    if (strict) {
      console.log(
        `${TAG.fail}--strict: an unmeasured gate fails. Exit 1.`,
      );
      return 1;
    }
    return 0;
  }

  const supabase = createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function q<T>(query: string, label: string): Promise<T[]> {
    const { data, error } = await supabase.rpc("execute_admin_query", { query });
    if (error) throw new Error(`${label}: ${error.message}`);
    return unwrapRows(data) as unknown as T[];
  }

  let openImpls: OpenImplRow[];
  let undeclared: GrandfatherRow[];
  let dupeDoorGrandfathers: GrandfatherRow[];
  let allGrandfathers: GrandfatherRow[];
  let anonPrivs: PrivRow[];
  let clientWrites: ClientWriteRow[];
  let anonDefiners: AnonDefinerRow[];
  let ungatedDoors: UngatedDoorRow[];
  let definerDdl: DefinerDdlRow[];
  let nullUnsafeRoles: NullUnsafeRoleRow[];
  let nullUnsafeHelpers: NullUnsafeRoleHelperRow[];
  let anonInvokerWriters: AnonInvokerWriterRow[];
  let unreachedGateClaims: ReasonClaimRow[];
  let roleBeforeCapability: RoleBeforeCapabilityRow[];
  let doorFlagMismatches: DoorFlagRow[];
  let assocDoorReasons: AssocDoorReasonRow[];
  let staleDoorRows: StaleDoorRow[];
  let doorGrantMismatches: DoorGrantRow[];
  let undeclaredClientDefiners: UndeclaredClientDefinerRow[];
  let closedHelperReach: ClosedHelperReachRow[];
  try {
    openImpls = await q<OpenImplRow>(OPEN_IMPL_QUERY, "D1 open impls");
    undeclared = await q<GrandfatherRow>(
      UNDECLARED_GRANDFATHER_QUERY,
      "D2 undeclared grandfather rows",
    );
    dupeDoorGrandfathers = await q<GrandfatherRow>(
      DUPE_DOOR_GRANDFATHER_QUERY,
      "D2b grandfather rows duplicating a declared door",
    );
    allGrandfathers = await q<GrandfatherRow>(
      ALL_GRANDFATHER_QUERY,
      "D2c grandfather rows outside pgsodium",
    );
    anonPrivs = await q<PrivRow>(
      ANON_TEMPLATE_GRANTS_QUERY,
      "D3 anon grants on workbench.schema_templates",
    );
    clientWrites = await q<ClientWriteRow>(
      CLIENT_TEMPLATE_WRITE_QUERY,
      "D4 client write grants on workbench.schema_templates",
    );
    anonDefiners = await q<AnonDefinerRow>(
      UNDECLARED_ANON_DEFINER_QUERY,
      "D5 undeclared anon-callable SECURITY DEFINER functions",
    );
    ungatedDoors = await q<UngatedDoorRow>(
      UNGATED_ANON_DOOR_QUERY,
      "D6 declared anon doors with no visibility gate",
    );
    definerDdl = await q<DefinerDdlRow>(
      CLIENT_DEFINER_DDL_QUERY,
      "D7 client-executable SECURITY DEFINER functions that run DDL",
    );
    nullUnsafeRoles = await q<NullUnsafeRoleRow>(
      NULL_UNSAFE_ROLE_TEST_QUERY,
      "D8 container-authority callers with a NULL-unsafe role test",
    );
    nullUnsafeHelpers = await q<NullUnsafeRoleHelperRow>(
      NULL_UNSAFE_ROLE_HELPER_QUERY,
      "D10 membership-role readers with a NULL-unsafe comparison",
    );
    anonInvokerWriters = await q<AnonInvokerWriterRow>(
      ANON_INVOKER_WRITER_QUERY,
      "D9 anon-executable SECURITY INVOKER functions that write",
    );
    unreachedGateClaims = await q<ReasonClaimRow>(
      REASON_CLAIMS_UNREACHED_GATE_QUERY,
      "D11 door reasons naming a gate the body never reaches",
    );
    roleBeforeCapability = await q<RoleBeforeCapabilityRow>(
      ROLE_BEFORE_CAPABILITY_QUERY,
      "D12 HR functions that refuse on a role before asking a capability",
    );
    doorFlagMismatches = await q<DoorFlagRow>(
      DOOR_FLAG_VS_GRANT_QUERY,
      "D13 door rows whose anonymous_callers flag disagrees with the live anon grant",
    );
    assocDoorReasons = await q<AssocDoorReasonRow>(
      ASSOC_DOOR_REASON_QUERY,
      "D14 association door reasons that do not name both ends",
    );
    staleDoorRows = await q<StaleDoorRow>(
      STALE_DOOR_ROW_QUERY,
      "D15 door rows naming no live function",
    );
    doorGrantMismatches = await q<DoorGrantRow>(
      DOOR_GRANT_VS_DECLARATION_QUERY,
      "D16a door declarations that disagree with the live client grant",
    );
    undeclaredClientDefiners = await q<UndeclaredClientDefinerRow>(
      UNDECLARED_CLIENT_DEFINER_QUERY,
      "D16b client-executable SECURITY DEFINER functions with no door row",
    );
    closedHelperReach = [];
    for (const kind of REACH_KINDS) {
      closedHelperReach.push(
        ...(await q<ClosedHelperReachRow>(
          closedHelperReachQuery(kind),
          `D18 closed helpers reached by a client path (${kind})`,
        )),
      );
    }
  } catch (err) {
    console.error(`${TAG.fail}Impl doors: query failed — ${String(err)}`);
    return 2;
  }

  let findings = 0;

  // ── D1 ────────────────────────────────────────────────────────────────────
  if (openImpls.length === 0) {
    console.log(
      `${TAG.ok}D1 no SECURITY DEFINER public.%_impl_% function is client-callable`,
    );
  } else {
    findings += openImpls.length;
    console.log(
      `${TAG.fail}D1 ${openImpls.length} SECURITY DEFINER ${C.white}public.%_impl_%${C.reset} function(s) hold client EXECUTE:`,
    );
    for (const r of openImpls) {
      const roles = [
        r.public_x ? "PUBLIC" : null,
        r.anon_x ? "anon" : null,
        r.auth_x ? "authenticated" : null,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(`  ${C.white}- ${r.fn}(${r.args})${C.reset} ${C.dim}→ ${roles}${C.reset}`);
    }
    console.log(
      `${C.dim}       An _impl_ helper carries no access check — the WRAPPER does. A SECURITY DEFINER${C.reset}`,
    );
    console.log(
      `${C.dim}       wrapper runs as its owner, which owns the impl, so it needs no grant here. Fix:${C.reset}`,
    );
    console.log(
      `${C.dim}       revoke all on function <fn>(<args>) from public, anon, authenticated, service_role;${C.reset}`,
    );
    console.log(
      `${C.dim}       and DELETE its platform.definer_client_grant_grandfather row, or the §6d-4 guard${C.reset}`,
    );
    console.log(
      `${C.dim}       stands down and the next default grant re-opens it silently.${C.reset}`,
    );
  }

  // ── D2 ────────────────────────────────────────────────────────────────────
  const baseline = loadBaseline();
  const n = undeclared.length;
  if (!baseline) {
    console.log(
      `${TAG.warn}D2 ${n} grandfather row(s) name a function with no platform.client_callable_door row — no baseline file to compare against`,
    );
    console.log(
      `${C.dim}       Create scripts/impl-doors/grandfather-baseline.json with {"count": ${n}, "why": "...", "capturedAt": "..."}.${C.reset}`,
    );
    findings += 1;
  } else if (n > baseline.count) {
    findings += n - baseline.count;
    console.log(
      `${TAG.fail}D2 undeclared grandfather rows GREW: ${baseline.count} → ${n} (+${n - baseline.count})`,
    );
    console.log(
      `${C.dim}       A grandfather row means "the §6d-4 guard stands down for this function". It belongs${C.reset}`,
    );
    console.log(
      `${C.dim}       ONLY on a function someone declared safe for clients in platform.client_callable_door.${C.reset}`,
    );
    console.log(
      `${C.dim}       Adding one back to an _impl_ helper silently restores the DD-098 hole. Never re-insert${C.reset}`,
    );
    console.log(
      `${C.dim}       to clear this — either declare the door, or delete the grandfather row.${C.reset}`,
    );
  } else {
    const shrank = baseline.count - n;
    console.log(
      `${TAG.ok}D2 undeclared grandfather rows ${n} ${C.dim}(baseline ${baseline.count}${shrank > 0 ? `, ${shrank} fewer` : ""} — may only shrink)${C.reset}`,
    );
    if (shrank > 0) {
      console.log(
        `${C.dim}       Lower the baseline to ${n} in scripts/impl-doors/grandfather-baseline.json so the win is held.${C.reset}`,
      );
    }
  }

  // ── D2b: no grandfather row duplicates a declared door (ABSOLUTE) ─────────
  if (dupeDoorGrandfathers.length === 0) {
    console.log(
      `${TAG.ok}D2b no grandfather row duplicates a declared client_callable_door`,
    );
  } else {
    findings += dupeDoorGrandfathers.length;
    console.log(
      `${TAG.fail}D2b ${dupeDoorGrandfathers.length} grandfather row(s) duplicate a DECLARED door`,
    );
    for (const r of dupeDoorGrandfathers.slice(0, 20)) {
      console.log(`  ${C.white}- ${r.fn}(${r.args})${C.reset}`);
    }
    console.log(
      `${C.dim}       The door row IS the decision. A grandfather row beside it is a second, silent${C.reset}`,
    );
    console.log(
      `${C.dim}       one that D2 cannot see (it counts only rows with NO door), so it is the one way${C.reset}`,
    );
    console.log(
      `${C.dim}       a stand-down can be re-inserted past this gate. Fix: delete the grandfather row.${C.reset}`,
    );
  }

  // ── D2c / D2d: every surviving grandfather row names a reason and an owner ─
  const gfAllow = loadGrandfatherAllowlist();
  if (!gfAllow) {
    findings += 1;
    console.log(
      `${TAG.fail}D2c scripts/impl-doors/grandfather-allowlist.json is missing or unreadable — UNMEASURED`,
    );
    console.log(
      `${C.dim}       Every grandfather row outside pgsodium must name its reason and owner there.${C.reset}`,
    );
  } else {
    const keyOf = (fn: string, args: string) => `${fn}(${args})`;
    const allowed = new Map(
      gfAllow.entries.map((e) => [keyOf(e.fn, e.args), e]),
    );
    const live = new Set(
      allGrandfathers.map((r) => keyOf(r.fn, r.args)),
    );

    const undeclaredRows = allGrandfathers.filter(
      (r) => !allowed.has(keyOf(r.fn, r.args)),
    );
    const unnamed = gfAllow.entries.filter(
      (e) =>
        live.has(keyOf(e.fn, e.args)) &&
        (!e.reason?.trim() || !e.owner?.trim()),
    );
    const stale = gfAllow.entries.filter((e) => !live.has(keyOf(e.fn, e.args)));

    if (undeclaredRows.length === 0 && unnamed.length === 0) {
      console.log(
        `${TAG.ok}D2c all ${allGrandfathers.length} grandfather row(s) outside pgsodium name a reason and an owner`,
      );
    } else {
      findings += undeclaredRows.length + unnamed.length;
      if (undeclaredRows.length > 0) {
        console.log(
          `${TAG.fail}D2c ${undeclaredRows.length} grandfather row(s) are in NO declared allowlist entry`,
        );
        for (const r of undeclaredRows.slice(0, 20)) {
          console.log(`  ${C.white}- ${r.fn}(${r.args})${C.reset}`);
        }
        console.log(
          `${C.dim}       A grandfather row is "the §6d-4 guard stands down here". Somebody must write${C.reset}`,
        );
        console.log(
          `${C.dim}       down WHY and WHO owns the decision in scripts/impl-doors/grandfather-allowlist.json,${C.reset}`,
        );
        console.log(
          `${C.dim}       or delete the row. Never add an entry just to clear this line.${C.reset}`,
        );
      }
      if (unnamed.length > 0) {
        console.log(
          `${TAG.fail}D2c ${unnamed.length} allowlist entr(y/ies) carry an empty reason or owner`,
        );
        for (const e of unnamed.slice(0, 20)) {
          console.log(`  ${C.white}- ${e.fn}(${e.args})${C.reset}`);
        }
      }
    }

    if (stale.length === 0) {
      console.log(
        `${TAG.ok}D2d no stale allowlist entries ${C.dim}(${gfAllow.entries.length} entries, all still live — the file may only shrink)${C.reset}`,
      );
    } else {
      findings += stale.length;
      console.log(
        `${TAG.fail}D2d ${stale.length} allowlist entr(y/ies) name a grandfather row that no longer exists`,
      );
      for (const e of stale.slice(0, 20)) {
        console.log(`  ${C.white}- ${e.fn}(${e.args})${C.reset}`);
      }
      console.log(
        `${C.dim}       A stale entry pre-authorizes a stand-down that has not happened, which is how${C.reset}`,
      );
      console.log(
        `${C.dim}       a deleted grandfather row comes back unnoticed. Delete the entry — the win is${C.reset}`,
      );
      console.log(
        `${C.dim}       held by removing it, never by leaving room for the row to return.${C.reset}`,
      );
    }
  }

  // ── D3 ────────────────────────────────────────────────────────────────────
  if (anonPrivs.length === 0) {
    console.log(
      `${TAG.ok}D3 anon holds no table privilege on workbench.schema_templates`,
    );
  } else {
    findings += anonPrivs.length;
    console.log(
      `${TAG.fail}D3 anon holds ${anonPrivs.map((p) => p.privilege_type).join(", ")} on ${C.white}workbench.schema_templates${C.reset}`,
    );
    console.log(
      `${C.dim}       That table has RLS OFF, zero policies and no owner column, so the GRANT *is* the access${C.reset}`,
    );
    console.log(
      `${C.dim}       decision — workbench is in pgrst.db_schemas, so the published anon key reaches it over${C.reset}`,
    );
    console.log(
      `${C.dim}       /rest/v1/schema_templates. Fix: revoke all on table workbench.schema_templates from anon;${C.reset}`,
    );
    console.log(
      `${C.dim}       The real close is registering or retiring the table (DD-033).${C.reset}`,
    );
  }

  // ── D4 ────────────────────────────────────────────────────────────────────
  if (clientWrites.length === 0) {
    console.log(
      `${TAG.ok}D4 no client role can write workbench.schema_templates directly ${C.dim}(writes go through public.admin_*_schema_template or service_role)${C.reset}`,
    );
  } else {
    findings += clientWrites.length;
    console.log(
      `${TAG.fail}D4 client write grant(s) on ${C.white}workbench.schema_templates${C.reset}:`,
    );
    for (const r of clientWrites) {
      console.log(`  ${C.white}- ${r.grantee}${C.reset} ${C.dim}→ ${r.privilege_type}${C.reset}`);
    }
    console.log(
      `${C.dim}       The table has RLS OFF, no organization, no creator and no user content, so it is${C.reset}`,
    );
    console.log(
      `${C.dim}       typed REFERENCE (B-8): authenticated READS, and every write goes through${C.reset}`,
    );
    console.log(
      `${C.dim}       public.admin_{create,update,delete}_schema_template (gated on admin.admins) or${C.reset}`,
    );
    console.log(
      `${C.dim}       service_role. A direct write grant to a client role restores the hole B-8 closed:${C.reset}`,
    );
    console.log(
      `${C.dim}       any signed-in user of any organization rewriting all five rows. Fix:${C.reset}`,
    );
    console.log(
      `${C.dim}       revoke insert, update, delete on table workbench.schema_templates from <role>;${C.reset}`,
    );
  }

  // ── D5 ────────────────────────────────────────────────────────────────────
  const anonBaseline = loadBaseline("scripts/impl-doors/anon-definer-baseline.json");
  const a = anonDefiners.length;
  if (!anonBaseline) {
    findings += 1;
    console.log(
      `${TAG.warn}D5 ${a} anon-executable SECURITY DEFINER function(s) have no platform.client_callable_door row — no baseline file to compare against`,
    );
    console.log(
      `${C.dim}       Create scripts/impl-doors/anon-definer-baseline.json with {"count": ${a}, "why": "...", "capturedAt": "..."}.${C.reset}`,
    );
  } else if (a > anonBaseline.count) {
    findings += a - anonBaseline.count;
    console.log(
      `${TAG.fail}D5 undeclared ANONYMOUS definer doors GREW: ${anonBaseline.count} → ${a} (+${a - anonBaseline.count})`,
    );
    console.log(
      `${C.dim}       A SAMPLE of the ${a}-function population follows — the baseline stores a count, not a${C.reset}`,
    );
    console.log(
      `${C.dim}       list, so the new door is not necessarily one of these. Find it with:${C.reset}`,
    );
    console.log(
      `${C.dim}       select * from platform.ddl_guard_log where rule = 'definer_client_grant_revoked' order by id desc;${C.reset}`,
    );
    for (const r of anonDefiners.slice(0, 5)) {
      console.log(`  ${C.white}- ${r.fn}(${r.args})${C.reset}`);
    }
    console.log(
      `${C.dim}       Something granted anon EXECUTE on a SECURITY DEFINER function that declares no door.${C.reset}`,
    );
    console.log(
      `${C.dim}       Either an anonymous caller must reach it by design — then declare it, in the same${C.reset}`,
    );
    console.log(
      `${C.dim}       migration, BEFORE the grant: insert into platform.client_callable_door${C.reset}`,
    );
    console.log(
      `${C.dim}       (schema_name, function_name, identity_args, reason) values (...);${C.reset}`,
    );
    console.log(
      `${C.dim}       — or it must not, and then: revoke all on function <fn>(<args>) from public, anon;${C.reset}`,
    );
  } else {
    const shrank = anonBaseline.count - a;
    console.log(
      `${TAG.ok}D5 undeclared anonymous definer doors ${a} ${C.dim}(baseline ${anonBaseline.count}${shrank > 0 ? `, ${shrank} fewer` : ""} — may only shrink)${C.reset}`,
    );
    if (shrank > 0) {
      console.log(
        `${C.dim}       Lower the baseline to ${a} in scripts/impl-doors/anon-definer-baseline.json so the win is held.${C.reset}`,
      );
    }
  }

  // ── D6 ────────────────────────────────────────────────────────────────────
  const doorBaseline = loadBaseline("scripts/impl-doors/anon-door-visibility-baseline.json");
  const g = ungatedDoors.length;
  if (!doorBaseline) {
    findings += 1;
    console.log(
      `${TAG.warn}D6 ${g} declared ANONYMOUS door(s) read visibility-bearing rows with no gate of any kind — no baseline file to compare against`,
    );
    console.log(
      `${C.dim}       Create scripts/impl-doors/anon-door-visibility-baseline.json with {"count": ${g}, "why": "...", "capturedAt": "..."}.${C.reset}`,
    );
  } else if (g > doorBaseline.count) {
    findings += g - doorBaseline.count;
    console.log(
      `${TAG.fail}D6 ungated ANONYMOUS doors GREW: ${doorBaseline.count} → ${g} (+${g - doorBaseline.count})`,
    );
    for (const r of ungatedDoors) {
      console.log(`  ${C.white}- ${r.fn}(${r.args})${C.reset}`);
    }
    console.log(
      `${C.dim}       A declared door says "an anonymous caller may reach this function". It does NOT say${C.reset}`,
    );
    console.log(
      `${C.dim}       "every row behind it is public" — DD-116: public.get_agent_public was a properly${C.reset}`,
    );
    console.log(
      `${C.dim}       declared door whose body was 'where id = $1 and deleted_at is null', and it handed${C.reset}`,
    );
    console.log(
      `${C.dim}       628 internal agents to anyone holding the anon key. Fix, in the body: filter on the${C.reset}`,
    );
    console.log(
      `${C.dim}       table's visibility/card_visibility for anonymous callers and route signed-in ones${C.reset}`,
    );
    console.log(
      `${C.dim}       through iam.has_access(<token>, id, 'viewer') — never a hand-written membership test,${C.reset}`,
    );
    console.log(
      `${C.dim}       and return ZERO ROWS, never an error that confirms the row exists (access DECISIONS${C.reset}`,
    );
    console.log(
      `${C.dim}       2026-08-11). Model: migrations/dd116_agent_public_door_visibility_gate.sql.${C.reset}`,
    );
  } else {
    const shrank = doorBaseline.count - g;
    console.log(
      `${TAG.ok}D6 ungated anonymous doors ${g} ${C.dim}(baseline ${doorBaseline.count}${shrank > 0 ? `, ${shrank} fewer` : ""} — may only shrink)${C.reset}`,
    );
    if (shrank > 0) {
      console.log(
        `${C.dim}       Lower the baseline to ${g} in scripts/impl-doors/anon-door-visibility-baseline.json so the win is held.${C.reset}`,
      );
    }
  }

  // ── D7 ────────────────────────────────────────────────────────────────────
  if (definerDdl.length === 0) {
    console.log(
      `${TAG.ok}D7 no client-executable SECURITY DEFINER function runs DDL ${C.dim}(ungated; DD-146)${C.reset}`,
    );
  } else {
    findings += definerDdl.length;
    console.log(
      `${TAG.fail}D7 ${definerDdl.length} SECURITY DEFINER function(s) run DDL and a CLIENT role can execute them:`,
    );
    for (const r of definerDdl) {
      const roles = [
        r.public_x ? "PUBLIC" : null,
        r.anon_x ? "anon" : null,
        r.auth_x ? "authenticated" : null,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(`  ${C.white}- ${r.fn}(${r.args})${C.reset} ${C.dim}→ ${roles}${C.reset}`);
    }
    console.log(
      `${C.dim}       A definer owned by postgres whose body runs DDL is the PROVISIONER, not a door:${C.reset}`,
    );
    console.log(
      `${C.dim}       a client role holding EXECUTE on it is ALTER TABLE as the superuser over HTTP.${C.reset}`,
    );
    console.log(
      `${C.dim}       DD-146: platform.retrofit_entity and platform.create_entity_table were exactly${C.reset}`,
    );
    console.log(
      `${C.dim}       that, reachable by anon, and a plain user's call entered the body. Fix:${C.reset}`,
    );
    console.log(
      `${C.dim}       revoke all on function <fn>(<args>) from public, anon, authenticated;${C.reset}`,
    );
    console.log(
      `${C.dim}       grant execute on function <fn>(<args>) to service_role;${C.reset}`,
    );
    console.log(
      `${C.dim}       and DELETE its platform.definer_client_grant_grandfather row. If a signed-in${C.reset}`,
    );
    console.log(
      `${C.dim}       platform admin genuinely must call it, gate the BODY on public.is_super_admin()${C.reset}`,
    );
    console.log(
      `${C.dim}       before the first DDL statement and raise 42501 with a sentence when it fails.${C.reset}`,
    );
  }

  // ── D8 ────────────────────────────────────────────────────────────────────
  if (nullUnsafeRoles.length === 0) {
    console.log(
      `${TAG.ok}D8 no iam._container_authz caller compares a role a NULL can pass ${C.dim}(DD-191)${C.reset}`,
    );
  } else {
    findings += nullUnsafeRoles.length;
    console.log(
      `${TAG.fail}D8 ${nullUnsafeRoles.length} caller(s) of ${C.white}iam._container_authz${C.reset} compare a role that can be NULL:`,
    );
    for (const r of nullUnsafeRoles) {
      console.log(`  ${C.white}- ${r.fn}(${r.args})${C.reset}`);
    }
    console.log(
      `${C.dim}       A non-member's actor_role is NULL. \`NULL not in ('owner','admin')\` is NULL,${C.reset}`,
    );
    console.log(
      `${C.dim}       so the guard never fires for exactly the people it exists to stop. DD-191:${C.reset}`,
    );
    console.log(
      `${C.dim}       inv_list handed a stranger AI Matrx's invitation token, and inv_create minted${C.reset}`,
    );
    console.log(
      `${C.dim}       them an ADMIN invitation. Fix: wrap every comparison — coalesce(v_actor_role,${C.reset}`,
    );
    console.log(
      `${C.dim}       'none') — and keep the strict form of the helper, which refuses first.${C.reset}`,
    );
  }

  // ── D9 ────────────────────────────────────────────────────────────────────
  if (anonInvokerWriters.length === 0) {
    console.log(
      `${TAG.ok}D9 no SECURITY INVOKER function that writes is executable by anon ${C.dim}(DD-197)${C.reset}`,
    );
  } else {
    findings += anonInvokerWriters.length;
    console.log(
      `${TAG.fail}D9 ${anonInvokerWriters.length} SECURITY INVOKER function(s) that WRITE can be executed by a signed-out caller:`,
    );
    for (const r of anonInvokerWriters) {
      const how = r.via_public_default
        ? "reachable through PUBLIC (proacl is null — PostgreSQL's own default)"
        : "explicit anon grant";
      const door = r.door_rows > 0 ? ", has a door row but it never mentions an anonymous caller" : "";
      console.log(`  ${C.white}- ${r.fn}(${r.args})${C.reset} ${C.dim}→ ${how}${door}${C.reset}`);
    }
    console.log(
      `${C.dim}       An invoker runs AS THE CALLER, so anon's empty privileges apply inside and the${C.reset}`,
    );
    console.log(
      `${C.dim}       refusal arrives deep in the body — naming an internal table with the GRANT that${C.reset}`,
    );
    console.log(
      `${C.dim}       would open it, or an internal helper nobody called, or not arriving at all:${C.reset}`,
    );
    console.log(
      `${C.dim}       DD-197 measured rpc/reorder_keywords returning 204 to an anonymous caller. An${C.reset}`,
    );
    console.log(
      `${C.dim}       invoker writer is not a door at any width. Fix:${C.reset}`,
    );
    console.log(
      `${C.dim}       revoke execute on function <fn>(<args>) from anon, public;${C.reset}`,
    );
    console.log(
      `${C.dim}       grant execute on function <fn>(<args>) to authenticated, service_role;${C.reset}`,
    );
    console.log(
      `${C.dim}       Revoke from PUBLIC too — a function created with no GRANT has proacl = null,${C.reset}`,
    );
    console.log(
      `${C.dim}       which is EXECUTE for PUBLIC, so revoking "from anon" alone is a no-op that reads${C.reset}`,
    );
    console.log(
      `${C.dim}       like a fix. If a signed-out caller genuinely must reach it, it becomes a${C.reset}`,
    );
    console.log(
      `${C.dim}       SECURITY DEFINER door with a gate and a platform.client_callable_door row whose${C.reset}`,
    );
    console.log(
      `${C.dim}       reason says the caller may have no account (the record_guest_execution pattern).${C.reset}`,
    );
  }

  // ── D10 ───────────────────────────────────────────────────────────────────
  if (nullUnsafeHelpers.length === 0) {
    console.log(
      `${TAG.ok}D10 no membership-role reader compares a role a NULL can pass ${C.dim}(DD-199)${C.reset}`,
    );
  } else {
    findings += nullUnsafeHelpers.length;
    console.log(
      `${TAG.fail}D10 ${nullUnsafeHelpers.length} site(s) compare an organization membership role that can be NULL:`,
    );
    for (const r of nullUnsafeHelpers) {
      console.log(
        `  ${C.white}- ${r.fn}(${r.args})${C.reset} ${C.dim}→ ${r.site}${C.reset}`,
      );
    }
    console.log(
      `${C.dim}       A non-member has NO role, so the value is NULL. \`NULL not in ('owner','admin')\`${C.reset}`,
    );
    console.log(
      `${C.dim}       is NULL, \`not (false or NULL)\` is NULL, and the refusal never fires for exactly${C.reset}`,
    );
    console.log(
      `${C.dim}       the people it exists to stop. DD-199: hr_module_set_enabled let a stranger switch${C.reset}`,
    );
    console.log(
      `${C.dim}       AI Matrx's HR module ON, and hr_knob_index served them its whole settings index.${C.reset}`,
    );
    console.log(
      `${C.dim}       Fix: coalesce(<role>, 'none') around every comparison, and call the STRICT form${C.reset}`,
    );
    console.log(
      `${C.dim}       of hr._l1_org_role (the default) wherever the role alone decides privilege.${C.reset}`,
    );
  }

  // ── D11 ───────────────────────────────────────────────────────────────────
  if (unreachedGateClaims.length === 0) {
    console.log(
      `${TAG.ok}D11 every door reason that names an access predicate reaches it ${C.dim}(DD-195)${C.reset}`,
    );
  } else {
    findings += unreachedGateClaims.length;
    console.log(
      `${TAG.fail}D11 ${unreachedGateClaims.length} declared door reason(s) name a gate the body never reaches:`,
    );
    for (const r of unreachedGateClaims) {
      console.log(
        `  ${C.white}- ${r.fn}(${r.args})${C.reset} ${C.dim}→ claims ${r.claimed}, body never calls it${C.reset}`,
      );
    }
    console.log(
      `${C.dim}       A door's reason is the sentence the next reviewer trusts instead of opening the${C.reset}`,
    );
    console.log(
      `${C.dim}       function. DD-195: the three assoc reader doors said they resolved access per${C.reset}`,
    );
    console.log(
      `${C.dim}       entity via iam.has_access; none of them had ever called it, and the real gate was${C.reset}`,
    );
    console.log(
      `${C.dim}       organization-level, so a plain member read edges revealing other people's private${C.reset}`,
    );
    console.log(
      `${C.dim}       rows. Fix the BODY if the reason is what you meant; fix the REASON if the body is.${C.reset}`,
    );
    console.log(
      `${C.dim}       A helper counts: the closure is the door's body plus the bodies it names (1 hop).${C.reset}`,
    );
  }

  // ── D12 ───────────────────────────────────────────────────────────────────
  if (roleBeforeCapability.length === 0) {
    console.log(
      `${TAG.ok}D12 no HR function refuses on a role before asking a capability ${C.dim}(DD-206)${C.reset}`,
    );
  } else {
    findings += roleBeforeCapability.length;
    console.log(
      `${TAG.fail}D12 ${roleBeforeCapability.length} HR function(s) decide a refusal from a membership role before any capability is consulted:`,
    );
    for (const r of roleBeforeCapability) {
      console.log(`  ${C.white}- ${r.fn}(${r.args})${C.reset}`);
      console.log(`    ${C.dim}between the role read and the first capability: ${r.between_text}${C.reset}`);
    }
    console.log(
      `${C.dim}       DD-206: in HR a capability is an authority in its OWN RIGHT, and it is asked${C.reset}`,
    );
    console.log(
      `${C.dim}       first. hr.capability resolves through an EMPLOYMENT (hr.employments_of ->${C.reset}`,
    );
    console.log(
      `${C.dim}       hr.role_assignment -> hr.access_role), never through iam.memberships, so an HR${C.reset}`,
    );
    console.log(
      `${C.dim}       admin who holds no membership row is a real person. hr_structure_list,${C.reset}`,
    );
    console.log(
      `${C.dim}       hr_directory_list and hr_org_chart told exactly that person "no standing in${C.reset}`,
    );
    console.log(
      `${C.dim}       this employer" while hr_knob_index served them its whole settings index.${C.reset}`,
    );
    console.log(
      `${C.dim}       Fix: two statements — \`if <capability> then null; elsif <role test> then${C.reset}`,
    );
    console.log(
      `${C.dim}       raise ...; end if;\` — never one boolean expression, whose operand order is a${C.reset}`,
    );
    console.log(
      `${C.dim}       cost estimate rather than a rule.${C.reset}`,
    );
  }

  // ── D13 ────────────────────────────────────────────────────────────────
  if (doorFlagMismatches.length === 0) {
    console.log(
      `${TAG.ok}D13 every door row's anonymous_callers flag matches the live anon grant ${C.dim}(DD-212/DD-207)${C.reset}`,
    );
  } else {
    findings += doorFlagMismatches.length;
    console.log(
      `${TAG.fail}D13 ${doorFlagMismatches.length} declared door(s) disagree with the database about a signed-out caller:`,
    );
    for (const r of doorFlagMismatches) {
      const said = r.flag
        ? "declares anonymous_callers = true, but anon holds NO EXECUTE"
        : "declares anonymous_callers = false, but anon HOLDS EXECUTE";
      console.log(`  ${C.white}- ${r.fn}(${r.args})${C.reset} ${C.dim}→ ${said}${C.reset}`);
    }
    console.log(
      `${C.dim}       DD-212: the flag is what the DD-202 birth trigger and D5/D9 obey, so a flag that${C.reset}`,
    );
    console.log(
      `${C.dim}       disagrees with the grant is a decision nobody made. TRUE with no grant re-opens${C.reset}`,
    );
    console.log(
      `${C.dim}       anon on the next CREATE OR REPLACE of a function somebody closed on purpose;${C.reset}`,
    );
    console.log(
      `${C.dim}       FALSE with a grant is DD-207's silent door — admin_spend_headline sat there${C.reset}`,
    );
    console.log(
      `${C.dim}       declared SUPER-ADMIN-ONLY while the published anon key could call it. Fix: decide.${C.reset}`,
    );
    console.log(
      `${C.dim}       Either \`revoke execute on function <fn>(<args>) from anon, public;\` (re-granting${C.reset}`,
    );
    console.log(
      `${C.dim}       every signed-in role that held it), or set anonymous_callers = true WITH an${C.reset}`,
    );
    console.log(
      `${C.dim}       anonymous_purpose saying who the signed-out caller is and what stands in for an${C.reset}`,
    );
    console.log(
      `${C.dim}       identity — and gate the body for a NULL auth.uid(). Never both, never neither.${C.reset}`,
    );
  }

  // ── D14 ───────────────────────────────────────────────────────────────────
  if (assocDoorReasons.length === 0) {
    console.log(
      `${TAG.ok}D14 every association door's reason names BOTH ends of the edge ${C.dim}(DD-205)${C.reset}`,
    );
  } else {
    findings += assocDoorReasons.length;
    console.log(
      `${TAG.fail}D14 ${assocDoorReasons.length} association door row(s) describe only one end of the edge:`,
    );
    for (const r of assocDoorReasons) {
      console.log(
        `  ${C.white}- ${r.fn}(${r.args})${C.reset} ${C.dim}→ ${r.problem}${C.reset}`,
      );
    }
    console.log(
      `${C.dim}       An association is the one row shape with TWO subjects — the anchor the caller${C.reset}`,
    );
    console.log(
      `${C.dim}       named and the row at the other end — and a gate that asks about one of them is${C.reset}`,
    );
    console.log(
      `${C.dim}       a direction, not a gate. DD-195 gated the revealed end and said honestly that it${C.reset}`,
    );
    console.log(
      `${C.dim}       did not gate the anchor; that true, incomplete sentence survived a verification${C.reset}`,
    );
    console.log(
      `${C.dim}       round, and DD-205 then measured nine confidential agent runs handed to a plain${C.reset}`,
    );
    console.log(
      `${C.dim}       member who passed their ids as the anchor. Fix the BODY so both ends are gated,${C.reset}`,
    );
    console.log(
      `${C.dim}       then say so: the reason must contain "both ends" and disclaim neither of them.${C.reset}`,
    );
  }

  // ── D15 ───────────────────────────────────────────────────────────────────
  if (staleDoorRows.length === 0) {
    console.log(
      `${TAG.ok}D15 every door row names exactly one live function ${C.dim}(DD-210)${C.reset}`,
    );
  } else {
    findings += staleDoorRows.length;
    console.log(
      `${TAG.fail}D15 ${staleDoorRows.length} platform.client_callable_door row(s) do not resolve to exactly one live function:`,
    );
    for (const r of staleDoorRows) {
      console.log(
        `  ${C.white}- ${r.fn}(${r.args})${C.reset} ${C.dim}→ declared_by ${r.declared_by}; ${r.siblings} function(s) of that name exist${C.reset}`,
      );
    }
    console.log(
      `${C.dim}       A door row is not a note — the §6d-4 guard STANDS DOWN on a function that has${C.reset}`,
    );
    console.log(
      `${C.dim}       one, so a row naming nothing reserves a stand-down for a name. Decide it: if the${C.reset}`,
    );
    console.log(
      `${C.dim}       function moved or was re-spelled, correct identity_args; if it is gone or was${C.reset}`,
    );
    console.log(
      `${C.dim}       never a client door, retire the row and record WHY and WHAT REPLACED IT in${C.reset}`,
    );
    console.log(
      `${C.dim}       platform.client_callable_door_retirement (DD-210 retired 28 that way).${C.reset}`,
    );
  }

  // ── D16a ──────────────────────────────────────────────────────────────────
  if (doorGrantMismatches.length === 0) {
    console.log(
      `${TAG.ok}D16a every door row's signed_in_callers / anonymous_callers matches the live grant ${C.dim}(DD-210)${C.reset}`,
    );
  } else {
    findings += doorGrantMismatches.length;
    console.log(
      `${TAG.fail}D16a ${doorGrantMismatches.length} door row(s) declare a client the grant does not:`,
    );
    for (const r of doorGrantMismatches) {
      const parts: string[] = [];
      if (r.signed_in_flag !== r.auth_executes) {
        parts.push(
          `signed_in_callers=${r.signed_in_flag} but authenticated EXECUTE=${r.auth_executes}`,
        );
      }
      if (r.anon_flag !== r.anon_executes) {
        parts.push(`anonymous_callers=${r.anon_flag} but anon EXECUTE=${r.anon_executes}`);
      }
      console.log(
        `  ${C.white}- ${r.fn}(${r.args})${C.reset} ${C.dim}→ ${parts.join("; ")}${C.reset}`,
      );
    }
    console.log(
      `${C.dim}       A flag TRUE with no grant is a door the platform believes it has and nobody can${C.reset}`,
    );
    console.log(
      `${C.dim}       open — and it hands the grant back at the next CREATE OR REPLACE. A flag FALSE${C.reset}`,
    );
    console.log(
      `${C.dim}       with a grant is a door nobody declared. Fix whichever side is wrong; if NO client${C.reset}`,
    );
    console.log(
      `${C.dim}       may reach it, set both flags false and say who really calls it in non_client_lane.${C.reset}`,
    );
  }

  // ── D16b ──────────────────────────────────────────────────────────────────
  if (undeclaredClientDefiners.length === 0) {
    console.log(
      `${TAG.ok}D16b no SECURITY DEFINER function a signed-in caller can execute lacks a door row ${C.dim}(DD-210)${C.reset}`,
    );
  } else {
    findings += undeclaredClientDefiners.length;
    console.log(
      `${TAG.fail}D16b ${undeclaredClientDefiners.length} SECURITY DEFINER function(s) hold client EXECUTE with no platform.client_callable_door row:`,
    );
    for (const r of undeclaredClientDefiners) {
      const roles = [r.anon_x ? "anon" : null, r.auth_x ? "authenticated" : null]
        .filter(Boolean)
        .join(", ");
      console.log(`  ${C.white}- ${r.fn}(${r.args})${C.reset} ${C.dim}→ ${roles}${C.reset}`);
    }
    console.log(
      `${C.dim}       DD-169 finished the census: every client-executable definer in this database is a${C.reset}`,
    );
    console.log(
      `${C.dim}       DECLARED door. The population is 0 and 0 is the only correct number — a new one${C.reset}`,
    );
    console.log(
      `${C.dim}       means a migration granted EXECUTE without declaring the door in the same file.${C.reset}`,
    );
  }

  // ── D17 ───────────────────────────────────────────────────────────────────
  const byDesign = loadByDesignAllowlist();
  if (!byDesign) {
    console.log(
      `${TAG.warn}D17 scripts/door-rows/by-design-allowlist.json is missing or unreadable — the wide check:door-rows lane cannot be read here`,
    );
  } else {
    const incomplete = byDesign.entries.filter(
      (e) =>
        !e.owner?.trim() ||
        (e.reason ?? "").trim().length < 60 ||
        (e.shape ?? "").trim().length < 40,
    );
    if (incomplete.length === 0) {
      console.log(
        `${TAG.ok}D17 all ${byDesign.entries.length} by-design cross-boundary door(s) name an owner, a reason and the shape they permit ${C.dim}(DD-210)${C.reset}`,
      );
    } else {
      findings += incomplete.length;
      console.log(
        `${TAG.fail}D17 ${incomplete.length} by-design allowlist entr(ies) are not fully reasoned:`,
      );
      for (const e of incomplete) {
        const missing = [
          e.owner?.trim() ? null : "owner",
          (e.reason ?? "").trim().length >= 60 ? null : "reason (>= 60 chars)",
          (e.shape ?? "").trim().length >= 40 ? null : "shape (>= 40 chars)",
        ]
          .filter(Boolean)
          .join(", ");
        console.log(`  ${C.white}- ${e.door ?? "(unnamed entry)"}${C.reset} ${C.dim}→ missing ${missing}${C.reset}`);
      }
      console.log(
        `${C.dim}       These four doors write or disclose ACROSS the organization boundary on purpose.${C.reset}`,
      );
      console.log(
        `${C.dim}       Nobody should be able to add one in silence: an entry says who owns it, why the${C.reset}`,
      );
      console.log(
        `${C.dim}       crossing is the feature, and the SHAPE it permits — what crosses, which way, how${C.reset}`,
      );
      console.log(
        `${C.dim}       far — so the next reader can tell a widened door from the one that was excused.${C.reset}`,
      );
    }
  }

  // ── D18 ───────────────────────────────────────────────────────────────────
  {
    const baseline = loadClosedHelperReachBaseline();
    if (!baseline) {
      console.log(
        `${TAG.warn}D18 scripts/impl-doors/closed-helper-reach-baseline.json is missing or unreadable — every hit below counts as new`,
      );
    }
    const known = new Map((baseline?.entries ?? []).map((e) => [e.key, e.reason]));
    const liveKeys = new Set(closedHelperReach.map(closedHelperReachKey));
    const fresh = closedHelperReach.filter((r) => !known.has(closedHelperReachKey(r)));
    const stale = (baseline?.entries ?? []).filter((e) => !liveKeys.has(e.key));
    const unreasoned = (baseline?.entries ?? []).filter((e) => (e.reason ?? "").trim().length < 60);
    if (fresh.length === 0 && stale.length === 0 && unreasoned.length === 0) {
      console.log(
        `${TAG.ok}D18 no client path reaches a closed helper ${C.dim}(${known.size} reasoned pre-existing hit(s) in the baseline; DD-169 reach fix)${C.reset}`,
      );
    } else {
      findings += fresh.length + stale.length + unreasoned.length;
      if (fresh.length > 0) {
        console.log(
          `${TAG.fail}D18 ${fresh.length} client path(s) call a function the calling role cannot execute — each is a 42501 inside a working user path:`,
        );
        for (const r of fresh) {
          console.log(
            `  ${C.white}- ${r.callee}${C.reset} ${C.dim}← ${r.via}${r.caller ? ` → ${r.caller}` : ""} (as ${r.role})${C.reset}`,
          );
        }
        console.log(
          `${C.dim}       Keep the helper closed and repair the path: make the trigger function SECURITY DEFINER${C.reset}`,
        );
        console.log(
          `${C.dim}       (fixed search_path), call an auth.uid()-bound door instead, or declare the helper a door${C.reset}`,
        );
        console.log(
          `${C.dim}       with a reason and a gate in the SAME migration as the grant. Never re-grant it blind.${C.reset}`,
        );
      }
      for (const e of stale) {
        console.log(
          `${TAG.fail}D18 stale baseline entry (no longer live — delete it): ${C.white}${e.key}${C.reset}`,
        );
      }
      for (const e of unreasoned) {
        console.log(
          `${TAG.fail}D18 baseline entry without a reason (>= 60 chars): ${C.white}${e.key}${C.reset}`,
        );
      }
    }
  }

  if (findings === 0) {
    console.log(`${TAG.ok}${C.green}Impl doors: clean${C.reset}`);
    return 0;
  }
  console.log(
    `${TAG.warn}Impl doors: ${findings} finding(s)${strict ? "" : ` ${C.dim}(advisory — re-run with --strict to fail)${C.reset}`}`,
  );
  return strict ? 1 : 0;
}

main()
  .then((code) => exitAfterDrain(code))
  .catch((err) => {
    console.error(`${TAG.fail}check-impl-doors crashed — ${String(err)}`);
    exitAfterDrain(2);
  });

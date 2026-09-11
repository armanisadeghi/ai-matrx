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
    select d.schema_name, d.function_name, d.identity_args,
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
  where exists (
      select 1 from vis_tables v
      where d.def ~* ('\\m' || replace(v.sch || '.' || v.tbl, '.', '\\.') || '\\M')
         or (v.sch = any(d.spath) and d.def ~* ('\\m' || v.tbl || '\\M'))
    )
    and d.def !~* g.rx
    and d.identity_args !~* '(secret|token|code|pin|password|passcode|session)'
    and d.def !~* 'auth\\.uid\\(\\)'
  order by 1, 2
`;

interface UngatedDoorRow {
  fn: string;
  args: string;
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
  let anonPrivs: PrivRow[];
  let clientWrites: ClientWriteRow[];
  let anonDefiners: AnonDefinerRow[];
  let ungatedDoors: UngatedDoorRow[];
  try {
    openImpls = await q<OpenImplRow>(OPEN_IMPL_QUERY, "D1 open impls");
    undeclared = await q<GrandfatherRow>(
      UNDECLARED_GRANDFATHER_QUERY,
      "D2 undeclared grandfather rows",
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
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${TAG.fail}check-impl-doors crashed — ${String(err)}`);
    process.exit(2);
  });

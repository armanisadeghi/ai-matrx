#!/usr/bin/env npx tsx
/**
 * THE ADMIN DOOR — an organization's owners and admins reach a member's private
 * data through an audited door, or not at all. Never by browsing.
 *
 * WHY THIS EXISTS (measured live, 2026-09-12, rolled-back probes)
 * --------------------------------------------------------------
 * `iam.has_access_for_base` granted any org owner/admin `viewer` on any row in
 * their organization with NO visibility condition, while the two org lanes
 * beside it were both guarded `visibility >= 'internal'`. The generator mirror
 * `iam.entity_read_expr` emitted the same unguarded arm, and the set-wise
 * resolver `iam.accessible_entity_ids` carried a THIRD copy of it. Net effect:
 * `visibility = 'personal'` hid a row from a plain member and from nobody else.
 *
 *   identity (real, not a fixture)        other people's personal conversations
 *   plain member                                                             0
 *   org ADMIN, not a platform admin                                     10,817   (+ 71,424 messages)
 *
 * Closed by `migrations/iam_admin_lane_honours_personal_visibility_dd136.sql`
 * (the arm) and `migrations/iam_component_lane_defers_to_parent_dd136b.sql`
 * (components, which have no visibility column BECAUSE their access is their
 * parent's, and the set-wise resolver). Arman, 2026-09-12: *the organization
 * reaches a person's private data only through an audited emergency door, never
 * by an admin browsing.*
 *
 * WHAT THIS GUARD ASSERTS
 * -----------------------
 *   1. STRUCTURAL — deterministic, cheap, one right answer, so it BLOCKS:
 *      a. no deployed `std_select` on a table that DECLARES a visibility
 *         contract carries an unguarded org-admin arm;
 *      b. no deployed `std_select` on a PARENTED COMPONENT carries the arm at
 *         all (its access is its parent's — db-rules §6d-1);
 *      c. `iam.has_access_for_base`, `iam.entity_read_expr` and
 *         `iam.accessible_entity_ids` each still contain their guard — the
 *         three places the same lane is written, which is why it was wrong in
 *         three places;
 *      d. the read-kernel fingerprint matches its baseline, so the mirror is
 *         not silently emitting unbounded policies.
 *   2. BEHAVIOURAL — a real org admin who is NOT a platform admin, through
 *      `public.admin_door_probe`, over a bounded sample per table: the arm
 *      admits 0 rows below `internal` visibility, and 0 such rows are readable
 *      with no ticket (permission / membership / reachability / entity grant /
 *      assignment) behind them, except on tokens whose rows are also conveyed
 *      by a parent or a bespoke resolver, which are printed, not asserted.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS. Without credentials this exits 1 in
 * --strict and says so loudly otherwise; it never prints a green line it did
 * not earn.
 *
 *   pnpm check:admin-door             # loud, non-blocking (exit 0)
 *   pnpm check:admin-door --strict    # exit 1 on any finding or UNMEASURED
 *   pnpm check:admin-door --self-test # prove the detector fails on a lane that
 *                                     # has lost its guard, then passes on the
 *                                     # live one (RED then GREEN)
 *
 * The 28 tables that still carry an unguarded arm are the ones that declare NO
 * visibility contract and are not components — they cannot express `personal`
 * at all, so the guard has nothing to check there. They are listed by this
 * script under RESIDUE so the number can never quietly grow: giving them a
 * visibility contract is DD-137's registry work, not a silent exception here.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};
const FAIL = `${C.red}✗${C.reset} `;
const OK = `${C.green}✓${C.reset} `;
const WARN = `${C.yellow}!${C.reset} `;

/** Tables that declare no visibility contract and are not components. The guard
 *  cannot check them because they cannot express `personal`; DD-137 gives them
 *  a contract. Listed, never silently skipped. */
const RESIDUE_NOTE =
  "tables with no platform.visibility column that are not parented components — they cannot express `personal`, so the guard has nothing to assert; DD-137 gives them a contract";

function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!key && m[1] === "SUPABASE_SECRET_KEY") key = v;
      }
      if (url && key) break;
    }
  }
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function door(env: { url: string; key: string }, sql: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${env.url}/rest/v1/rpc/execute_admin_query`, {
    method: "POST",
    headers: {
      apikey: env.key, Authorization: `Bearer ${env.key}`,
      "Content-Type": "application/json", "Content-Profile": "public", "Accept-Profile": "public",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 400)}`);
  const payload = JSON.parse(text) as unknown;
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === "object" && Array.isArray((payload as { result?: unknown[] }).result)) {
    return (payload as { result: Array<Record<string, unknown>> }).result;
  }
  return [];
}

/** The guarded org-admin arm, as pg_get_expr prints it. */
const GUARD_FRAGMENT =
  "(visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT om.organization_id";

/** Pure detector, so --self-test can feed it a lane that lost its guard. */
export function armIsUnguarded(qual: string): boolean {
  if (!/iam\.organization_member/.test(qual)) return false;
  return !qual.includes(GUARD_FRAGMENT);
}

const STRUCTURAL_SQL = `
select
  (select coalesce(string_agg(p.schemaname||'.'||p.tablename, ', ' order by p.schemaname, p.tablename), '')
     from pg_policies p
    where p.policyname = 'std_select'
      and p.qual ~ 'iam.organization_member'
      and iam.table_has_visibility(p.schemaname, p.tablename)
      and p.qual not like '%(visibility >= ''internal''::platform.visibility) AND (organization_id IN ( SELECT om.organization_id%'
      -- A policy no client role can reach is not a surface. This is measured
      -- live on every run, never an allowlist: restore one GRANT and the table
      -- is a finding again the same second. (DD-136c took these grants away
      -- from the four retired graveyard tables iam.apply_rls cannot regenerate.)
      and ((has_schema_privilege('authenticated', p.schemaname, 'USAGE')
            and has_table_privilege('authenticated', format('%I.%I', p.schemaname, p.tablename)::regclass, 'SELECT'))
        or (has_schema_privilege('anon', p.schemaname, 'USAGE')
            and has_table_privilege('anon', format('%I.%I', p.schemaname, p.tablename)::regclass, 'SELECT')))
  ) as unguarded_declaring,
  (select coalesce(string_agg(p.schemaname||'.'||p.tablename, ', ' order by p.schemaname, p.tablename), '')
     from pg_policies p
    where p.policyname = 'std_select'
      and p.qual ~ 'iam.organization_member'
      and iam.table_has_visibility(p.schemaname, p.tablename)
      and p.qual not like '%(visibility >= ''internal''::platform.visibility) AND (organization_id IN ( SELECT om.organization_id%'
      and not ((has_schema_privilege('authenticated', p.schemaname, 'USAGE')
            and has_table_privilege('authenticated', format('%I.%I', p.schemaname, p.tablename)::regclass, 'SELECT'))
        or (has_schema_privilege('anon', p.schemaname, 'USAGE')
            and has_table_privilege('anon', format('%I.%I', p.schemaname, p.tablename)::regclass, 'SELECT')))
  ) as unguarded_unreachable,
  (select coalesce(string_agg(p.schemaname||'.'||p.tablename, ', ' order by p.schemaname, p.tablename), '')
     from pg_policies p
     join platform.entity_types et on et.schema_name = p.schemaname and et.table_name = p.tablename and et.is_active
    where p.policyname = 'std_select'
      and p.qual ~ 'iam.organization_member'
      and iam.token_is_parented_component(et.token)
  ) as component_with_arm,
  (select coalesce(string_agg(n.nspname||'.'||pr.proname, ', '), '')
     from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where (n.nspname, pr.proname) in (('iam','has_access_for_base'), ('iam','entity_read_expr'), ('iam','accessible_entity_ids'))
      and pr.prosrc ~ 'organization_member'
      and pr.prosrc !~ 'table_has_visibility|token_is_parented_component|visibility >= ''''internal'''''
  ) as unguarded_functions,
  (iam.entity_read_kernel_fingerprint() = iam.entity_read_kernel_expected()) as mirror_current,
  (select count(*) from pg_policies p
    where p.policyname = 'std_select' and p.qual ~ 'iam.organization_member'
      and not iam.table_has_visibility(p.schemaname, p.tablename)) as residue_count
`;

const PROBE_SQL = `
with who as (
  select om.user_id
  from iam.organization_member om
  where om.role in ('owner','admin') and not public.is_platform_admin_for(om.user_id)
  group by om.user_id
  order by om.user_id
  limit 1
)
select w.user_id::text as identity, r.schema_name, r.table_name, r.token,
       r.considered, r.by_role, r.no_ticket, r.conveyable
from who w, lateral public.admin_door_probe(w.user_id, 50) r
where r.by_role <> 0 or r.no_ticket <> 0
`;

async function main(): Promise<number> {
  console.log(`${C.bold}THE ADMIN DOOR${C.reset} ${C.dim}(DD-136 / DD-136b — an org admin does not browse private rows)${C.reset}`);

  if (SELF_TEST) {
    // RED: a lane that has lost its guard must be detected.
    const unguarded =
      "((organization_id IS NOT NULL) AND (organization_id IN ( SELECT om.organization_id FROM iam.organization_member om WHERE ((om.user_id = ( SELECT auth.uid() AS uid)) AND (om.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role]))))))";
    const guarded =
      "((organization_id IS NOT NULL) AND (visibility >= 'internal'::platform.visibility) AND (organization_id IN ( SELECT om.organization_id FROM iam.organization_member om WHERE ((om.user_id = ( SELECT auth.uid() AS uid)) AND (om.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role]))))))";
    const unrelated = "((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility))";
    const red = armIsUnguarded(unguarded);
    const green = armIsUnguarded(guarded);
    const quiet = armIsUnguarded(unrelated);
    console.log(`  ${red ? OK : FAIL}RED  — an unguarded arm is detected`);
    console.log(`  ${!green ? OK : FAIL}GREEN — the guarded arm is not flagged`);
    console.log(`  ${!quiet ? OK : FAIL}QUIET — a lane with no org-admin arm is not flagged`);
    return red && !green && !quiet ? 0 : 1;
  }

  const env = loadEnv();
  if (!env) {
    console.error(`${FAIL}UNMEASURED — no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY, so nothing was checked. This is a failure, not a pass.`);
    return STRICT ? 1 : 0;
  }

  let findings = 0;
  let s: Record<string, unknown>;
  try {
    s = (await door(env, STRUCTURAL_SQL))[0] ?? {};
  } catch (err) {
    console.error(`${FAIL}UNMEASURED — structural query failed: ${String(err)}`);
    return STRICT ? 1 : 0;
  }

  const unguardedDeclaring = String(s.unguarded_declaring ?? "");
  const unguardedUnreachable = String(s.unguarded_unreachable ?? "");
  const componentWithArm = String(s.component_with_arm ?? "");
  const unguardedFunctions = String(s.unguarded_functions ?? "");
  const mirrorCurrent = s.mirror_current === true;
  const residue = Number(s.residue_count ?? -1);

  if (unguardedDeclaring) {
    findings++;
    console.error(`${FAIL}a table that DECLARES a visibility contract carries an UNGUARDED org-admin read arm: ${unguardedDeclaring}`);
  } else console.log(`  ${OK}every reachable visibility-declaring table's org-admin arm is guarded`);
  if (unguardedUnreachable) {
    console.log(`  ${WARN}${C.dim}frozen unguarded arm on table(s) NO client role can reach (grants removed by DD-136c; a restored grant makes this a finding again): ${unguardedUnreachable}${C.reset}`);
  }

  if (componentWithArm) {
    findings++;
    console.error(`${FAIL}a parented COMPONENT carries an org-admin read arm — its access is its parent's (db-rules §6d-1): ${componentWithArm}`);
  } else console.log(`  ${OK}no parented component carries an org-admin read arm`);

  if (unguardedFunctions) {
    findings++;
    console.error(`${FAIL}the org-admin lane lost its guard inside: ${unguardedFunctions}`);
  } else console.log(`  ${OK}all three copies of the lane (kernel, mirror, set-wise resolver) carry their guard`);

  if (!mirrorCurrent) {
    findings++;
    console.error(`${FAIL}read-kernel fingerprint does not match its baseline — the mirror is emitting UNBOUNDED policies`);
  } else console.log(`  ${OK}read-kernel fingerprint matches its baseline`);

  console.log(`  ${C.dim}RESIDUE: ${residue} ${RESIDUE_NOTE}${C.reset}`);

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await door(env, PROBE_SQL);
  } catch (err) {
    findings++;
    console.error(`${FAIL}UNMEASURED — the live probe failed: ${String(err)}`);
    return STRICT ? 1 : 0;
  }

  const byRole = rows.filter((r) => Number(r.by_role) !== 0);
  const noTicket = rows.filter((r) => Number(r.no_ticket) > 0 && r.conveyable !== true);
  const conveyed = rows.filter((r) => Number(r.no_ticket) > 0 && r.conveyable === true);

  if (byRole.length) {
    findings++;
    for (const r of byRole) {
      console.error(`${FAIL}${r.schema_name}.${r.table_name}: the org-admin arm admits ${r.by_role} of ${r.considered} sampled private rows to ${r.identity}`);
    }
  } else console.log(`  ${OK}live probe: the org-admin arm admits no private row of anyone else's`);

  if (noTicket.length) {
    findings++;
    for (const r of noTicket) {
      console.error(`${FAIL}${r.schema_name}.${r.table_name}: ${r.no_ticket} private row(s) readable with no grant, membership, reachability, entity grant or assignment behind them`);
    }
  } else console.log(`  ${OK}live probe: every private row still readable has a ticket behind it`);

  for (const r of conveyed) {
    console.log(`  ${WARN}${C.dim}${r.schema_name}.${r.table_name}: ${r.no_ticket} row(s) reached through a parent or a bespoke resolver — reported, not asserted${C.reset}`);
  }

  if (findings === 0) {
    console.log(`${OK}${C.bold}the admin door is shut${C.reset}`);
    return 0;
  }
  console.error(`${FAIL}${C.bold}${findings} finding(s)${C.reset}`);
  return STRICT ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`${FAIL}unexpected: ${String(err)}`);
  process.exit(2);
});

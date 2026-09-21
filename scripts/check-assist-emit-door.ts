#!/usr/bin/env npx tsx
/**
 * The browser's assist-emission RPC is deliberately the only path around the
 * restrictive client-write refusal on platform.assists. This checks the live
 * catalog relationship rather than trusting a migration's prose.
 */
import process from "node:process";
import { connectDirect, DB_VARS, loadDbEnv } from "./lib/direct-db";

interface DoorRow {
  security_definer: boolean;
  search_path_locked: boolean;
  same_owner_as_assists: boolean;
  force_rls: boolean;
  authenticated_can_execute: boolean;
  refusal_policy_present: boolean;
  organization_access_is_checked: boolean;
  refresh_is_organization_scoped: boolean;
}

export function findings(row: DoorRow): string[] {
  const out: string[] = [];
  if (!row.security_definer)
    out.push("emit_pending_assist is SECURITY INVOKER, so the direct-write refusal also blocks its INSERT");
  if (!row.search_path_locked)
    out.push("emit_pending_assist does not have the required locked empty search_path");
  if (!row.same_owner_as_assists)
    out.push("emit_pending_assist and platform.assists do not share an owner, so the definer door may not bypass table RLS");
  if (row.force_rls)
    out.push("platform.assists has FORCE ROW LEVEL SECURITY, so even its owner is subject to the client refusal");
  if (!row.authenticated_can_execute)
    out.push("authenticated callers cannot execute emit_pending_assist");
  if (!row.refusal_policy_present)
    out.push("the direct client INSERT refusal is absent, does not apply to authenticated, or does not use WITH CHECK (false)");
  if (!row.organization_access_is_checked)
    out.push("the SECURITY DEFINER door does not re-state iam.has_org_access(p_organization_id)");
  if (!row.refresh_is_organization_scoped)
    out.push("the dedupe refresh can update a caller row outside p_organization_id");
  return out;
}

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) {
    const green: DoorRow = {
      security_definer: true,
      search_path_locked: true,
      same_owner_as_assists: true,
      force_rls: false,
      authenticated_can_execute: true,
      refusal_policy_present: true,
      organization_access_is_checked: true,
      refresh_is_organization_scoped: true,
    };
    const mutations: Array<keyof DoorRow> = [
      "security_definer",
      "search_path_locked",
      "same_owner_as_assists",
      "force_rls",
      "authenticated_can_execute",
      "refusal_policy_present",
      "organization_access_is_checked",
      "refresh_is_organization_scoped",
    ];
    const everyMutationIsRed = mutations.every((key) => {
      const mutated = { ...green, [key]: key === "force_rls" };
      return findings(mutated).length === 1;
    });
    if (!everyMutationIsRed || findings(green).length !== 0) {
      console.error("check-assist-emit-door self-test failed");
      return 1;
    }
    console.log("check-assist-emit-door self-test passed: invoker is red, safe door is green");
    return 0;
  }

  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(`Missing direct DB connection values: ${DB_VARS.join(", ")}`);
    return 2;
  }
  const db = await connectDirect(env, "matrx-frontend check-assist-emit-door");
  try {
    const result = await db.query<DoorRow>(`
      select
        p.prosecdef as security_definer,
        coalesce(p.proconfig, array[]::text[]) @> array['search_path=""'] as search_path_locked,
        p.proowner = c.relowner as same_owner_as_assists,
        c.relforcerowsecurity as force_rls,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
        exists (
          select 1
          from pg_policies policy
          where policy.schemaname = 'platform'
            and policy.tablename = 'assists'
            and policy.policyname = 'assists_client_insert_refused'
            and policy.cmd = 'INSERT'
            and policy.permissive = 'RESTRICTIVE'
            and 'authenticated' = any(policy.roles)
            and btrim(coalesce(policy.with_check, '')) = 'false'
        ) as refusal_policy_present
        , position('iam.has_org_access(p_organization_id)' in p.prosrc) > 0 as organization_access_is_checked
        , position('AND organization_id = p_organization_id' in p.prosrc) > 0 as refresh_is_organization_scoped
      from pg_proc p
      join pg_class c on c.oid = 'platform.assists'::regclass
      where p.oid = 'platform.emit_pending_assist(uuid,text,text,text,text,jsonb,text,text,uuid,text,timestamptz,smallint,jsonb,real,text)'::regprocedure
    `);
    const row = result.rows[0];
    if (!row) {
      console.error("emit_pending_assist is missing from the live database");
      return 1;
    }
    const problems = findings(row);
    if (problems.length > 0) {
      console.error("check-assist-emit-door FAILED:");
      for (const problem of problems) console.error(`  - ${problem}`);
      return 1;
    }
    console.log("check-assist-emit-door passed: authenticated uses the locked SECURITY DEFINER door while direct table INSERT remains refused");
    return 0;
  } finally {
    await db.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("check-assist-emit-door failed unexpectedly:", error);
    process.exit(2);
  },
);

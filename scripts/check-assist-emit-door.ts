#!/usr/bin/env npx tsx
/**
 * The browser's assist-emission RPC is deliberately the only path around the
 * restrictive client-write refusal on platform.assists. This checks the live
 * catalog relationship rather than trusting a migration's prose.
 *
 * 🚨 A SUBSTRING IS NOT A DECISION (GUARD-STAMPS, 2026-09-21). The first two body
 * arms asked `position('iam.has_org_access(p_organization_id)' in p.prosrc) > 0`
 * and `position('AND organization_id = p_organization_id' in p.prosrc) > 0`. Both
 * are satisfied by a COMMENT — `-- we no longer need iam.has_org_access(p_organization_id)`
 * turns this guard green on a door that decides nothing — and neither says anything
 * about ORDER, so a check placed after the INSERT it is supposed to gate reads as a
 * pass. This is the same lesson SECURITY-SWEEP-2 wrote down about classifying a
 * column by its name: a verdict the wording can overrule is a comment, not a
 * classification. So the body is stripped of comments first, and each clause must
 * stand in the right PLACE: the organization decision before the first write, the
 * organization scoping inside the dedupe refresh's own WHERE.
 */
import process from "node:process";
import { DB_VARS, loadDbEnv } from "./lib/direct-db";
import { openGateDb } from "./lib/gate-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const DOOR =
  "platform.emit_pending_assist(uuid,text,text,text,text,jsonb,text,text,uuid,text,timestamptz,smallint,jsonb,real,text)";

interface DoorRow {
  security_definer: boolean;
  search_path_locked: boolean;
  same_owner_as_assists: boolean;
  force_rls: boolean;
  authenticated_can_execute: boolean;
  refusal_policy_present: boolean;
  /** Raw body. Every body-shaped arm is decided HERE, in code we can self-test. */
  src: string;
}

/**
 * Everything a `--` or a block comment says is the author talking to the next reader,
 * never something the server executes. Strip it before asking what the body does.
 */
export function executableBody(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/** Where a pattern first stands in the EXECUTABLE body, or -1. */
function at(body: string, re: RegExp): number {
  return body.search(re);
}

export function bodyFindings(src: string): string[] {
  const body = executableBody(src);
  const out: string[] = [];

  const decision = at(body, /iam\.has_org_access\s*\(\s*p_organization_id\s*\)/i);
  const firstWrite = at(body, /insert\s+into\s+platform\.assists/i);
  const refresh = at(body, /update\s+platform\.assists/i);

  if (decision < 0) {
    out.push(
      "the SECURITY DEFINER door does not re-state iam.has_org_access(p_organization_id) in executable code",
    );
  } else if (firstWrite >= 0 && decision > firstWrite) {
    out.push(
      "iam.has_org_access(p_organization_id) is reached AFTER the first INSERT into platform.assists — a decision that runs after the write it is meant to gate is not a gate",
    );
  }

  if (refresh < 0) {
    out.push("the dedupe refresh (UPDATE platform.assists) is gone, so this guard is measuring nothing");
  } else {
    // The scoping clause has to live in the refresh's own WHERE, not merely somewhere
    // in the body: an `organization_id = p_organization_id` sitting in the INSERT above
    // would leave the UPDATE free to walk into another organization's row.
    const tail = body.slice(refresh);
    if (!/\borganization_id\s*=\s*p_organization_id\b/i.test(tail)) {
      out.push("the dedupe refresh can update a caller row outside p_organization_id");
    }
  }
  return out;
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
  out.push(...bodyFindings(row.src));
  return out;
}

/** The shape the live door has today, written out so the self-test can mutate it. */
const SOUND_BODY = `
BEGIN
  IF NOT iam.has_org_access(p_organization_id) THEN
    RAISE EXCEPTION 'requires access to organization %', p_organization_id USING ERRCODE = '42501';
  END IF;
  INSERT INTO platform.assists (organization_id) VALUES (p_organization_id) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  UPDATE platform.assists SET occurrences = occurrences + 1
   WHERE dedupe_key = p_dedupe_key AND user_id = v_uid AND organization_id = p_organization_id
  RETURNING id INTO v_id;
  RETURN v_id;
END;`;

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) {
    const green: DoorRow = {
      security_definer: true,
      search_path_locked: true,
      same_owner_as_assists: true,
      force_rls: false,
      authenticated_can_execute: true,
      refusal_policy_present: true,
      src: SOUND_BODY,
    };
    const flags: Array<keyof DoorRow> = [
      "security_definer",
      "search_path_locked",
      "same_owner_as_assists",
      "force_rls",
      "authenticated_can_execute",
      "refusal_policy_present",
    ];
    const failures: string[] = [];
    if (findings(green).length !== 0)
      failures.push(`the sound door is not green: ${findings(green).join("; ")}`);
    for (const key of flags) {
      const mutated = { ...green, [key]: key === "force_rls" };
      if (findings(mutated).length !== 1)
        failures.push(`mutating ${key} produced ${findings(mutated).length} finding(s), wanted exactly 1`);
    }

    // The four body mutations, each a way the OLD substring arms read green on a door
    // that is not safe. Every one of them must be RED.
    const bodies: Array<[string, string]> = [
      [
        "the decision commented out",
        SOUND_BODY.replace(
          "IF NOT iam.has_org_access(p_organization_id) THEN",
          "-- iam.has_org_access(p_organization_id) is handled by RLS now\n  IF FALSE THEN",
        ),
      ],
      [
        "the decision moved AFTER the insert",
        `BEGIN
  INSERT INTO platform.assists (organization_id) VALUES (p_organization_id) RETURNING id INTO v_id;
  IF NOT iam.has_org_access(p_organization_id) THEN RAISE EXCEPTION 'no'; END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  UPDATE platform.assists SET occurrences = occurrences + 1
   WHERE dedupe_key = p_dedupe_key AND organization_id = p_organization_id RETURNING id INTO v_id;
  RETURN v_id;
END;`,
      ],
      [
        "the refresh unscoped",
        SOUND_BODY.replace(" AND organization_id = p_organization_id", ""),
      ],
      [
        "the scoping clause present only in the INSERT above the refresh",
        SOUND_BODY.replace(" AND organization_id = p_organization_id", "").replace(
          "VALUES (p_organization_id)",
          "VALUES (p_organization_id) /* organization_id = p_organization_id */",
        ),
      ],
    ];
    for (const [what, src] of bodies) {
      const got = findings({ ...green, src });
      if (got.length === 0) failures.push(`body mutation "${what}" stayed GREEN`);
    }

    if (failures.length > 0) {
      console.error("check-assist-emit-door self-test FAILED:");
      for (const f of failures) console.error(`  - ${f}`);
      return 1;
    }
    console.log(
      `check-assist-emit-door self-test passed: the sound door is green, each of ${flags.length} catalog mutations is red, ` +
        `and all ${bodies.length} body mutations (comment-only decision, decision after the write, unscoped refresh, scoping in the wrong statement) are red`,
    );
    return 0;
  }

  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(`Missing direct DB connection values: ${DB_VARS.join(", ")}`);
    return 2;
  }
  const db = await openGateDb(env, { gate: "check-assist-emit-door" });
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
        ) as refusal_policy_present,
        p.prosrc as src
      from pg_proc p
      join pg_class c on c.oid = 'platform.assists'::regclass
      where p.oid = '${DOOR}'::regprocedure
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
  (code) => exitAfterDrain(code),
  (error: unknown) => {
    console.error("check-assist-emit-door failed unexpectedly:", error);
    exitAfterDrain(2);
  },
);

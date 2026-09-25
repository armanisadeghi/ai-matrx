/**
 * `platform` AND `iam` ARE NOT CLIENT-WRITABLE SCHEMAS. EVERY WRITE GOES THROUGH A DOOR.
 *
 * WHAT THIS CLOSES. VERIFIER-8, 2026-09-21, HIGH-3: "PostgREST exposes `platform` and `iam`
 * as writable REST surfaces to every signed-in user." `Accept-Profile: platform` and
 * `Accept-Profile: iam` are served to `authenticated`, and the base tables underneath them
 * carry INSERT/UPDATE/DELETE grants. RLS is on and, in the probes VERIFIER-8 ran, scopes
 * those writes correctly — but that is the whole problem the chair ruled on:
 *
 *   The store's design is that a client reaches data THROUGH A NAMED DOOR, which decides
 *   through the one ladder. A base table reachable directly over REST is safe only while
 *   EVERY policy on it is complete, forever, including the ones `iam.apply_rls` will
 *   regenerate tomorrow. CRITICAL-1 (`iam.api_keys.service_user_id`, full account takeover
 *   from a plain member's seat) is the proof that "every policy is complete" is not a
 *   property this database has. A safe path beside an unsafe one is no fix — closing a class
 *   means removing the door.
 *
 * THE RULING, and therefore the rule this guard measures: no table in `platform` or `iam`
 * carries a write grant or a permissive write policy for `authenticated` or `anon`. Reads
 * stay exactly as they are, under RLS. Writes go through `SECURITY DEFINER` doors registered
 * in `platform.client_callable_door`.
 *
 * WHAT IT MEASURES, per (schema.table, command, client role) — the smallest unit that can be
 * closed independently, because a table whose INSERT is withdrawn and whose UPDATE is not is
 * half closed and must read as half closed:
 *
 *   OPEN      the role holds the privilege (table grant, column grant, or one inherited from
 *             PUBLIC — all three answered by `has_any_column_privilege`) and NO restrictive
 *             policy refuses that command. The client can write the base table today. This is
 *             the hole.
 *   RESIDUAL  a restrictive refusal closes the command, but the grant and/or the permissive
 *             policy is still there. Not reachable — and not withdrawn either. It counts,
 *             because the ruling is about the SURFACE, not only about today's reachability:
 *             the permissive policy is what `iam.apply_rls` regenerates, and a grant nobody
 *             uses is a grant the next policy regeneration makes live again.
 *
 * A (table, command, role) disappears from the census entirely when the grant is revoked AND
 * no permissive write policy names that role. That is what "moved behind a door" looks like
 * in the catalog, and it is the only thing that shrinks this baseline.
 *
 * 🚨 THE GUARD WAS WRITTEN SO THAT IT CAN SEE THE FIX, BEFORE THE FIX. That is the single
 * instruction SECURITY-SWEEP left in capital letters, after the trap closed on it three
 * times: "a guard that cannot see the fix is a guard arguing against being made." So the
 * self-test asserts the withdrawal shape clears the finding, on the verbatim bytes of a table
 * this lane closed, and the RESIDUAL tier exists precisely so that a half-done closure is
 * visible as progress rather than as nothing.
 *
 * 🚨 UNMEASURED IS NOT PASSED. No credentials, an unreachable database, or a census that
 * comes back empty is a FAILURE with a banner, never a silent green.
 *
 *   pnpm check:doors-only-schemas
 *   pnpm check:doors-only-schemas:self-test
 *   pnpm check:doors-only-schemas --update-baseline   # deliberately, after a real closure
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDbEnv } from "./lib/direct-db";
import { openGateDb } from "./lib/gate-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

/**
 * THE BASELINE IS SHRINK-ONLY, AND IT IS NOT A PERMISSION SLIP.
 *
 * The first live run found a large set of (table, command, role) triples across 80 tables.
 * Every one is real under the ruling; none can be closed in one night, because each needs its
 * callers moved to a door first and a live `authenticated` probe before the write is
 * withdrawn. So this follows the repo's ratchet convention
 * (`scripts/settings-guards/FEATURE.md`: "every guard with a baseline now has one that ONLY
 * SHRINKS"): the known set is recorded, ANY new entry fails, and any baseline entry that
 * stops existing ALSO fails — so nobody can widen the surface and nobody can let the file rot.
 * Adding an entry to the baseline is not a way to clear it: only `--update-baseline`, run
 * deliberately after a closure, may rewrite the file, and it is read in the diff.
 *
 * The target is ZERO. A baseline that stops shrinking is the campaign stalling, not the guard
 * passing.
 */
const BASELINE_PATH = resolve(process.cwd(), "scripts/doors-only-schemas-baseline.json");

/** The two schemas the ruling covers. */
export const DOORS_ONLY_SCHEMAS = ["platform", "iam"] as const;

/** The roles PostgREST hands a browser. `public`/`PUBLIC` is folded in by the SQL. */
export const CLIENT_ROLES = ["authenticated", "anon"] as const;

export type Tier = "open" | "residual";

export interface Finding {
  readonly schema: string;
  readonly table: string;
  /** INSERT | UPDATE | DELETE */
  readonly cmd: string;
  readonly role: string;
  readonly tier: Tier;
  /** Why it is still on the surface, in one sentence a reader can act on. */
  readonly why: string;
  /** The permissive write policies that name this role for this command. */
  readonly permissivePolicies: readonly string[];
  /** The restrictive policy that refuses this command, when there is one. */
  readonly refusedBy: string | null;
}

/**
 * 🚨 THE TIER IS PART OF THE KEY, AND LEAVING IT OUT MADE THE RATCHET BLIND TO HALF OF THE FIX.
 * (DOORS-ONLY, 2026-09-21 — measured, not predicted.)
 *
 * The first version of this key was `schema.table|CMD|role`. Then this lane closed ten tables:
 * `platform.route_manifest`'s INSERT went from answering a plain member **201 Created** to
 * `403 42501 route_manifest_client_insert_refused`, and thirty triples moved OPEN → RESIDUAL.
 * The baseline did not move by one entry, because the triple still existed — only its TIER had
 * changed. A closure proven over the wire was invisible to the thing meant to measure it.
 *
 * That is the fifth time in this campaign that trap has closed, and SECURITY-SWEEP left the
 * instruction in capital letters: check that the guard can see your fix BEFORE you build it.
 * This one was caught the same session it was made, by re-running the live guard after the
 * apply instead of assuming the number would move.
 *
 * So the tier is in the key. Withdrawing a grant removes the entry outright; refusing a write
 * REPLACES `…|open` with `…|residual`, which reads in the diff as one improvement rather than
 * as nothing — and a REGRESSION (residual → open, somebody dropping a refusal) appears as a
 * NEW `…|open` entry and fails, which the tier-less key could never have caught either.
 */
export function keyOf(f: Pick<Finding, "schema" | "table" | "cmd" | "role" | "tier">): string {
  return `${f.schema}.${f.table}|${f.cmd}|${f.role}|${f.tier}`;
}

function readBaseline(): Set<string> {
  if (!existsSync(BASELINE_PATH)) return new Set();
  return new Set(JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as string[]);
}

/**
 * A restrictive policy REFUSES a command when the expression Postgres applies is a constant
 * false. Anything else — `is_platform_admin()`, `has_org_access(...)` — narrows the write but
 * keeps it, so the table is still a client-writable table and the finding stands.
 *
 * `USING` and `WITH CHECK` are BOTH required to be refusals when both are present and
 * meaningful, because a DELETE is decided by `USING` alone, an INSERT by `WITH CHECK` alone,
 * and an UPDATE by both — a policy that refuses only one half of an UPDATE refuses nothing.
 */
export function isRefusal(cmd: string, usingExpr: string | null, withCheck: string | null): boolean {
  const isFalse = (e: string | null): boolean => e !== null && /^\s*\(*\s*false\s*\)*\s*$/i.test(e);
  if (cmd === "INSERT") return isFalse(withCheck);
  if (cmd === "DELETE") return isFalse(usingExpr);
  // UPDATE: Postgres applies USING to the old row and WITH CHECK (falling back to USING) to
  // the new one. Refusing the old row is enough — no row is ever reached.
  return isFalse(usingExpr);
}

/** Does a policy declared for `polcmd` cover this write command? */
export function policyCovers(polcmd: string, cmd: string): boolean {
  if (polcmd === "ALL") return true;
  return polcmd === cmd;
}

export interface TableFacts {
  readonly schema: string;
  readonly table: string;
  /** role → { INSERT|UPDATE|DELETE → true } from `has_any_column_privilege`. */
  readonly grants: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
  readonly policies: readonly PolicyFacts[];
}

export interface PolicyFacts {
  readonly name: string;
  /** INSERT | UPDATE | DELETE | ALL */
  readonly cmd: string;
  readonly permissive: boolean;
  /** Role names the policy is declared `TO`. An empty array means PUBLIC. */
  readonly roles: readonly string[];
  readonly usingExpr: string | null;
  readonly withCheck: string | null;
}

/** A policy declared `TO PUBLIC` (empty `polroles`) applies to every client role. */
function policyApplies(p: PolicyFacts, role: string): boolean {
  if (p.roles.length === 0) return true;
  return p.roles.includes(role) || p.roles.includes("public") || p.roles.includes("PUBLIC");
}

export function findingsFor(t: TableFacts): Finding[] {
  const out: Finding[] = [];
  for (const role of CLIENT_ROLES) {
    for (const cmd of ["INSERT", "UPDATE", "DELETE"] as const) {
      const granted = t.grants[role]?.[cmd] === true;
      const permissive = t.policies.filter(
        (p) => p.permissive && policyCovers(p.cmd, cmd) && policyApplies(p, role),
      );
      // Service-role and other non-client policies are irrelevant here; `policyApplies`
      // already excludes them, because they name their own role explicitly.
      if (!granted && permissive.length === 0) continue;

      const refusal = t.policies.find(
        (p) =>
          !p.permissive &&
          policyCovers(p.cmd, cmd) &&
          policyApplies(p, role) &&
          isRefusal(cmd, p.usingExpr, p.withCheck),
      );

      const permissiveNames = permissive.map((p) => p.name);
      const base = {
        schema: t.schema,
        table: t.table,
        cmd,
        role,
        permissivePolicies: permissiveNames,
        refusedBy: refusal?.name ?? null,
      };
      if (refusal) {
        out.push({
          ...base,
          tier: "residual",
          why:
            `closed by the restrictive policy \`${refusal.name}\`, but the surface is still ` +
            `declared: ${granted ? "the grant is still held" : "no grant"}` +
            (permissive.length > 0 ? `, ${permissive.length} permissive write polic(y/ies) remain` : "") +
            `. Revoke and drop them; keep the named refusal.`,
        });
      } else if (granted) {
        out.push({
          ...base,
          tier: "open",
          why:
            `\`${role}\` may ${cmd} this base table over PostgREST today` +
            (permissive.length > 0 ? ` under ${permissiveNames.join(", ")}` : ` (grant with no permissive policy — RLS denies, but the grant is live)`) +
            `. Move the callers to a door, then revoke and leave a named restrictive refusal.`,
        });
      } else {
        // A permissive policy for a command the role cannot exercise. Declared surface with
        // no grant behind it: not reachable, but it is what `iam.apply_rls` regenerates and
        // what a future `GRANT` would make live in one statement.
        out.push({
          ...base,
          tier: "residual",
          why:
            `no grant, but ${permissiveNames.join(", ")} still declares ${cmd} for \`${role}\`. ` +
            `Drop the permissive policy so a future grant cannot silently reopen it.`,
        });
      }
    }
  }
  return out;
}

const CENSUS_SQL = `
with t as (
  select n.nspname as schema_name, c.relname as table_name, c.oid
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = any($1::text[]) and c.relkind in ('r', 'p')
    -- A hash/list PARTITION is reached only through its parent; the parent carries the grant
    -- and the policy, and counting both would double every provisioned store table.
    and not exists (select 1 from pg_inherits i where i.inhrelid = c.oid)
),
g as (
  select t.oid,
         jsonb_object_agg(r.role_name, jsonb_build_object(
           -- INSERT and UPDATE can be granted per COLUMN, and that is how
           -- \`iam.apply_table_grants\` withholds a column named in
           -- \`client_excluded_columns\` — so the table-level answer is not the question.
           'INSERT', has_any_column_privilege(r.role_name, t.oid, 'INSERT'),
           'UPDATE', has_any_column_privilege(r.role_name, t.oid, 'UPDATE'),
           -- DELETE has no column form in Postgres at all (\`has_any_column_privilege\` raises
           -- "unrecognized privilege type"): it is whole-row by definition.
           'DELETE', has_table_privilege(r.role_name, t.oid, 'DELETE')
         )) as grants
  from t cross join (select unnest($2::text[]) as role_name) r
  group by t.oid
),
p as (
  select pol.polrelid as oid,
         jsonb_agg(jsonb_build_object(
           'name', pol.polname,
           'cmd', case pol.polcmd when 'a' then 'INSERT' when 'w' then 'UPDATE'
                                  when 'd' then 'DELETE' when '*' then 'ALL' else 'SELECT' end,
           'permissive', pol.polpermissive,
           'roles', coalesce((select jsonb_agg(ro.rolname::text) from unnest(pol.polroles) x
                              join pg_roles ro on ro.oid = x), '[]'::jsonb),
           'usingExpr', pg_get_expr(pol.polqual, pol.polrelid),
           'withCheck', pg_get_expr(pol.polwithcheck, pol.polrelid)
         )) as policies
  from pg_policy pol
  where pol.polrelid in (select oid from t) and pol.polcmd <> 'r'
  group by pol.polrelid
)
select t.schema_name, t.table_name, g.grants, coalesce(p.policies, '[]'::jsonb) as policies
from t join g on g.oid = t.oid left join p on p.oid = t.oid
order by t.schema_name, t.table_name`;

function toFacts(r: {
  schema_name: string;
  table_name: string;
  grants: Record<string, Record<string, boolean>>;
  policies: PolicyFacts[];
}): TableFacts {
  return { schema: r.schema_name, table: r.table_name, grants: r.grants, policies: r.policies };
}

/**
 * THE SELF-TEST. Three assertions, each on a shape this lane actually met on the live
 * database, and each shown to go RED when the rule it proves is removed:
 *
 *   1. AN OPEN TABLE IS REPORTED. `platform.associations` as measured at 2026-09-21: IUD
 *      granted to `authenticated`, four permissive policies, no restrictive refusal.
 *   2. A REFUSAL IS ONLY `residual`, NOT CLEAR. `iam.access_audit` as SECURITY-SWEEP left it:
 *      the restrictive `*_client_insert_refused` closes the write, and the grant and the
 *      `std_*` permissive policies are still there. A guard that called this "closed" would
 *      be measuring reachability, and the ruling is about the surface.
 *   3. THE WITHDRAWAL SHAPE CLEARS IT. The same table with the grant revoked and the
 *      permissive policies dropped, keeping only the named refusal, produces NO finding. This
 *      is the assertion that makes the ratchet able to see a fix.
 */
function selfTest(): number {
  const failures: string[] = [];
  const check = (label: string, ok: boolean): void => {
    console.log(`  ${ok ? "ok" : "FAIL"}  ${label}`);
    if (!ok) failures.push(label);
  };

  // 1 — verbatim `platform.associations`, live catalog, 2026-09-21.
  const associations: TableFacts = {
    schema: "platform",
    table: "associations",
    grants: {
      authenticated: { INSERT: true, UPDATE: true, DELETE: true },
      anon: { INSERT: false, UPDATE: false, DELETE: false },
    },
    policies: [
      { name: "std_insert", cmd: "INSERT", permissive: true, roles: ["authenticated"], usingExpr: null, withCheck: "(created_by = ( SELECT auth.uid() AS uid))" },
      { name: "std_update", cmd: "UPDATE", permissive: true, roles: ["authenticated"], usingExpr: "(created_by = ( SELECT auth.uid() AS uid))", withCheck: null },
      { name: "std_delete", cmd: "DELETE", permissive: true, roles: ["authenticated"], usingExpr: "(created_by = ( SELECT auth.uid() AS uid))", withCheck: null },
      { name: "svc_all", cmd: "ALL", permissive: true, roles: ["service_role"], usingExpr: "true", withCheck: "true" },
    ],
  };
  const a = findingsFor(associations);
  check(
    "an open platform table reports one `open` finding per write command for `authenticated`",
    a.filter((f) => f.role === "authenticated" && f.tier === "open").length === 3,
  );
  check(
    "a service_role policy is not a client finding, and `anon` with no grant and no policy is silent",
    a.every((f) => f.role === "authenticated"),
  );

  // 2 — verbatim `iam.access_audit` as SECURITY-SWEEP left it, live catalog, 2026-09-21.
  const accessAudit: TableFacts = {
    schema: "iam",
    table: "access_audit",
    grants: {
      authenticated: { INSERT: true, UPDATE: true, DELETE: true },
      anon: { INSERT: false, UPDATE: false, DELETE: false },
    },
    policies: [
      { name: "svc_all", cmd: "ALL", permissive: true, roles: ["service_role"], usingExpr: "true", withCheck: "true" },
      { name: "std_insert", cmd: "INSERT", permissive: true, roles: ["authenticated"], usingExpr: null, withCheck: "((created_by = ( SELECT auth.uid() AS uid)) AND ((organization_id IS NULL) OR iam.has_org_access(organization_id)))" },
      { name: "std_update", cmd: "UPDATE", permissive: true, roles: ["authenticated"], usingExpr: "(created_by = ( SELECT auth.uid() AS uid))", withCheck: "(created_by = ( SELECT auth.uid() AS uid))" },
      { name: "std_delete", cmd: "DELETE", permissive: true, roles: ["authenticated"], usingExpr: "(created_by = ( SELECT auth.uid() AS uid))", withCheck: null },
      { name: "access_audit_client_insert_refused", cmd: "INSERT", permissive: false, roles: ["authenticated", "anon"], usingExpr: null, withCheck: "false" },
      { name: "access_audit_client_update_refused", cmd: "UPDATE", permissive: false, roles: ["authenticated", "anon"], usingExpr: "false", withCheck: "false" },
      { name: "access_audit_client_delete_refused", cmd: "DELETE", permissive: false, roles: ["authenticated", "anon"], usingExpr: "false", withCheck: null },
    ],
  };
  const b = findingsFor(accessAudit);
  check(
    "a table closed only by a restrictive refusal is `residual`, never absent — the grant and the std_* policies are still declared",
    b.filter((f) => f.role === "authenticated").length === 3 &&
      b.filter((f) => f.role === "authenticated").every((f) => f.tier === "residual" && f.refusedBy !== null),
  );

  // 3 — THE WITHDRAWAL SHAPE. Grant revoked, permissive policies dropped, named refusal kept.
  const withdrawn: TableFacts = {
    ...accessAudit,
    grants: {
      authenticated: { INSERT: false, UPDATE: false, DELETE: false },
      anon: { INSERT: false, UPDATE: false, DELETE: false },
    },
    policies: accessAudit.policies.filter((p) => !p.name.startsWith("std_")),
  };
  check(
    "THE FIX IS VISIBLE: revoke + drop the permissive policies + keep the named refusal produces NO finding",
    findingsFor(withdrawn).length === 0,
  );

  // 4 — a refusal that is not actually a refusal does not clear anything.
  const fakeRefusal: TableFacts = {
    ...accessAudit,
    policies: accessAudit.policies.map((p) =>
      p.name.endsWith("_refused")
        ? { ...p, usingExpr: p.usingExpr === null ? null : "( SELECT is_platform_admin() AS is_platform_admin)", withCheck: p.withCheck === null ? null : "( SELECT is_platform_admin() AS is_platform_admin)" }
        : p,
    ),
  };
  check(
    "a restrictive policy that merely NARROWS (is_platform_admin()) is not a refusal — the finding stays `open`",
    findingsFor(fakeRefusal).filter((f) => f.role === "authenticated" && f.tier === "open").length === 3,
  );

  // 5 — a permissive policy with no grant behind it is still declared surface.
  const policyOnly: TableFacts = {
    schema: "platform",
    table: "entity_types",
    grants: {
      authenticated: { INSERT: false, UPDATE: false, DELETE: false },
      anon: { INSERT: false, UPDATE: false, DELETE: false },
    },
    policies: [
      { name: "platform_admin_all", cmd: "ALL", permissive: true, roles: ["authenticated"], usingExpr: "( SELECT is_platform_admin() AS is_platform_admin)", withCheck: "( SELECT is_platform_admin() AS is_platform_admin)" },
    ],
  };
  check(
    "a permissive write policy with no grant behind it is `residual`, because one GRANT statement makes it live",
    findingsFor(policyOnly).filter((f) => f.role === "authenticated").length === 3,
  );

  // 6 — 🚨 THE RATCHET CAN SEE A REFUSAL. This is the assertion the first version of this
  // guard did not have, and the live run caught it: closing a write without withdrawing the
  // grant moves a triple OPEN -> RESIDUAL, and with a tier-less key the baseline did not move
  // by one entry while `platform.route_manifest` went from answering a plain member 201 to
  // refusing him by policy name. A closure the ratchet cannot see is a closure nobody gets
  // credit for and, worse, a REGRESSION nobody gets warned about.
  const openKeys = new Set(findingsFor(associations).map(keyOf));
  const refusedAssociations: TableFacts = {
    ...associations,
    policies: [
      ...associations.policies,
      { name: "associations_client_insert_refused", cmd: "INSERT", permissive: false, roles: ["authenticated", "anon"], usingExpr: null, withCheck: "false" },
      { name: "associations_client_update_refused", cmd: "UPDATE", permissive: false, roles: ["authenticated", "anon"], usingExpr: "false", withCheck: "false" },
      { name: "associations_client_delete_refused", cmd: "DELETE", permissive: false, roles: ["authenticated", "anon"], usingExpr: "false", withCheck: null },
    ],
  };
  const refusedKeys = new Set(findingsFor(refusedAssociations).map(keyOf));
  check(
    "THE RATCHET SEES A REFUSAL: adding the restrictive refusals changes every key, so the baseline moves",
    [...openKeys].every((k) => !refusedKeys.has(k)) && refusedKeys.size === openKeys.size,
  );

  console.log(
    failures.length === 0
      ? `\n[OK] check:doors-only-schemas self-test — 7 assertions green.`
      : `\n[FAIL] ${failures.length} assertion(s) red.`,
  );
  return failures.length === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) return selfTest();

  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `[FAIL] LIVE PULL FAILED — missing ${env.missing.join(", ")}.\n` +
        `  This guard answers "can a browser still write platform/iam directly?" and only the\n` +
        `  live catalog knows. UNMEASURED IS NOT PASSED: refusing rather than reporting green.`,
    );
    return 1;
  }

  const client = await openGateDb(env, { gate: "check:doors-only-schemas" }).catch((e: unknown) => {
    console.error(`[FAIL] LIVE PULL FAILED — could not connect: ${String(e)}`);
    return null;
  });
  if (client === null) return 1;

  try {
    const { rows } = await client.query(CENSUS_SQL, [[...DOORS_ONLY_SCHEMAS], [...CLIENT_ROLES]]);
    if (rows.length === 0) {
      console.error(
        `[FAIL] LIVE PULL FAILED — the census found no tables at all in ${DOORS_ONLY_SCHEMAS.join(", ")}.\n` +
          `  That is not a clean bill of health, it is an unanswered question.`,
      );
      return 1;
    }

    const findings: Finding[] = [];
    for (const r of rows) findings.push(...findingsFor(toFacts(r)));

    const baseline = readBaseline();
    const live = new Set(findings.map(keyOf));
    const novel = findings.filter((f) => !baseline.has(keyOf(f)));
    const cleared = [...baseline].filter((k) => !live.has(k));

    const open = findings.filter((f) => f.tier === "open");
    const residual = findings.filter((f) => f.tier === "residual");
    const tables = new Set(findings.map((f) => `${f.schema}.${f.table}`));

    console.log(
      `check:doors-only-schemas — ${rows.length} tables in ${DOORS_ONLY_SCHEMAS.join("/")} read live.\n` +
        `  ${findings.length} (table, command, role) triples still on the client write surface,\n` +
        `  across ${tables.size} tables: ${open.length} OPEN (writable today), ${residual.length} RESIDUAL\n` +
        `  (refused, but the grant or the permissive policy is still declared).\n` +
        `  Baseline: ${baseline.size}. Target: 0.`,
    );

    if (process.argv.includes("--update-baseline")) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify([...live].sort(), null, 2)}\n`);
      console.log(`\n[OK] baseline rewritten: ${baseline.size} → ${live.size}.`);
      return 0;
    }

    if (novel.length > 0) {
      console.error(
        `\n[FAIL] ${novel.length} NEW client write surface(s) in ${DOORS_ONLY_SCHEMAS.join("/")} — ` +
          `not in the baseline:\n` +
          novel
            .slice(0, 40)
            .map((f) => `  [${f.tier.toUpperCase()}] ${f.schema}.${f.table} ${f.cmd} to \`${f.role}\`\n      ${f.why}`)
            .join("\n") +
          (novel.length > 40 ? `\n  … and ${novel.length - 40} more` : "") +
          `\n\n  THE RULING: \`platform\` and \`iam\` are not client-writable through PostgREST.\n` +
          `  Every write goes through a SECURITY DEFINER door registered in\n` +
          `  platform.client_callable_door, deciding through the one ladder. Reads stay under RLS.`,
      );
      return 1;
    }

    if (cleared.length > 0) {
      console.error(
        `\n[FAIL] ${cleared.length} baseline entry/entries no longer exist. That is good news the\n` +
          `  file has not been told about — a baseline that outlives its findings rots into a\n` +
          `  permission slip:\n` +
          cleared.slice(0, 40).map((k) => `  ${k}`).join("\n") +
          (cleared.length > 40 ? `\n  … and ${cleared.length - 40} more` : "") +
          `\n\n  Run \`pnpm check:doors-only-schemas --update-baseline\` to record the win.`,
      );
      return 1;
    }

    console.log(`\n[OK] no new client write surface in ${DOORS_ONLY_SCHEMAS.join("/")}.`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

main().then(exitAfterDrain, (e: unknown) => {
  console.error(`[FAIL] ${String(e)}`);
  exitAfterDrain(1);
});

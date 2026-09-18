#!/usr/bin/env npx tsx
/**
 * `pnpm check:branch-schema-drift` — THE BRANCH IS LEVEL WITH PRODUCTION, OR IT IS NOT
 * A REHEARSAL.
 *
 * WHY THIS EXISTS (lane W0-SYNC, 2026-09-17)
 * ------------------------------------------
 * `W1-STORE` applied `CREATE TABLE custom.record` to the rehearsal branch, which took
 * it, and then to production, which REFUSED it with SQLSTATE 23514. The difference was
 * a guard: production carries the event trigger `provision_shape_guard` (function
 * `platform._provision_shape_guard`) and the branch did not, because the branch is a
 * schema-only transplant and production kept moving. A rehearsal that lacks production's
 * guards does not rehearse anything — it manufactures a green.
 *
 * `pnpm db:objects-diff` already prints tables, columns, constraints, triggers and event
 * triggers, and it is the richer READING tool. This is the GATE, and it covers what a
 * guard actually lives in: event triggers, FUNCTIONS and POLICIES as well. It answers one
 * question in one exit code — does production hold an object of these five kinds that
 * the branch does not?
 *
 * ONE DIRECTION, DELIBERATELY. Production-only is a rehearsal that is behind and is a
 * red. Branch-only is the campaign building on the branch, which is the entire point of
 * having one, so it is not this check's business and is not counted. Bodies that DIFFER
 * are `db:objects-diff`'s to report; this check is about ABSENCE, which is the shape the
 * `custom.record` failure took.
 *
 * WHAT IS EXCLUDED, AND WHERE
 * ---------------------------
 * Campaign-owned namespaces are excluded in CODE, below, because they are structural:
 * `custom`, `corpus`, `campaign_watch`, `h2m`, `restore_graph`, any `zz_*` lane scratch
 * schema, the 25 named `public` measurement tables and realtime's daily message
 * partitions. Everything else is excluded in `scripts/branch-schema-drift-exceptions.json`
 * BY NAME AND WITH A SENTENCE. The difference matters: a namespace exclusion is a rule, a
 * named exception is a debt somebody wrote down.
 *
 * A STALE EXCEPTION IS ALSO A FAILURE — not a fatal one, but it is printed. An excuse for
 * an object the branch now carries is an excuse nobody will re-read, and left alone the
 * file becomes a list of things that used to be true.
 *
 * ABSOLUTELY SELECT-ONLY. Both connections run inside `begin transaction read only`.
 * There is no write path in this file in any flag combination.
 *
 * HOW IT CONNECTS — the sanctioned resolution, the same one `db:objects-diff` uses.
 * Production is the five `SUPABASE_MATRIX_*` through `scripts/lib/direct-db.ts`; the
 * branch is `SUPABASE_BRANCH_DATABASE_URL`, verified against `plan/BRANCH-REF`. After
 * both sockets open, each server is asked its own `pg_control_system().system_identifier`
 * and compared, so this cannot diff production against itself and report "no drift". No
 * secret is ever printed.
 *
 * THE FAILING SET vs INFORMATIONAL (lane W3-DRIFT-SCOPE, 2026-09-17)
 * ------------------------------------------------------------------
 * Production's FEATURE schemas (`seo`, `crm`, `web`, `communication`, …) move every hour
 * from other teams' work that has nothing to do with this campaign, so a check that fails
 * on ANY production-only object flaps red for reasons no lane here can or should fix. This
 * gate now fails the exit code ONLY on drift the campaign actually rehearses against:
 *   · schemas `platform`, `iam`, `history` — the three this campaign RULES on;
 *   · "custom-adjacent guards" — every function, trigger, policy or event trigger scoped to
 *     schema `custom` (NOT its plain relations, which `platform.provision()` builds on
 *     purpose and are excluded exactly as before) — these are the guardrails, like
 *     `provision_shape_guard`, that make the campaign's own tables safe;
 *   · EVERY event trigger, in ANY schema — an event trigger is a database-wide guard by
 *     definition, so one production holds and the branch lacks is never "somebody else's
 *     schema";
 *   · the grants clause below, unchanged.
 * Every other schema's production-only object is still measured and printed — an
 * INFORMATIONAL section, counts by schema plus the first ten objects — but it never moves
 * the exit code. `--strict` restores the old fail-on-anything behaviour (every schema is
 * in the failing set) for whoever wants the exhaustive answer.
 *
 * `--self-test` proves both halves without touching either database's contents or the
 * exceptions file: it plants one synthetic production-only object in `platform` (inside the
 * failing set) and asserts the exit path goes RED, then plants one in `seo` (outside it) and
 * asserts the exit path stays GREEN with that object named in the informational count.
 *
 * THE SECOND CLAUSE — GRANTS, AND IT RUNS THE OTHER WAY ROUND (lane W2-GRANTS, 2026-09-17)
 * ----------------------------------------------------------------------------------------
 * The schema clause above asks whether the branch is BEHIND. This one asks whether it is
 * LOOSER, which for an ACCESS rehearsal is the dangerous direction: a branch that grants
 * `anon` EXECUTE on a function production does not answers YES where production answers
 * `42501`, and every access proof taken on it is worth nothing.
 *
 * Measured on 2026-09-17, before it was closed: the branch held 2,142 function EXECUTE
 * grants production does not — `anon` among them, on `iam.apply_rls` and 592 others.
 *
 * SO: a function EXECUTE grant that the BRANCH has and PRODUCTION does not, for `anon`,
 * `authenticated` or `service_role`, FAILS this check. Bounded the same way the drift
 * clause is, and every bound is a rule in code rather than a silence:
 *   · only functions BOTH databases hold, keyed by identity args, never by OID — a grant
 *     cannot be compared on an object one side lacks, and that is the clause above's job.
 *   · campaign-owned namespaces are the campaign's, exactly as above.
 *   · Supabase-managed schemas are the platform image's, and the two databases run
 *     different images.
 *   · A GRANT THAT CHANGES NOTHING IS NOT DRIFT. Where PRODUCTION already grants EXECUTE
 *     to `PUBLIC`, every role on earth can already call the function there, so an explicit
 *     branch grant to `anon` is redundant rather than looser. That is the whole of the
 *     residue this campaign left behind: 173 extension functions in `public` (vector,
 *     dblink, pg_trgm, plpgsql_check, pg_prewarm), owned by `supabase_admin` — the newer
 *     Supabase image grants the client roles explicitly on top of the `PUBLIC` grant both
 *     images carry, and `postgres` cannot revoke them because it is not the grantor.
 *
 * THE THIRD CLAUSE — DEFAULT PRIVILEGES, THE GRANT THAT HAS NOT HAPPENED YET (2026-09-17)
 * ----------------------------------------------------------------------------------------
 * The grants clause reads objects that EXIST. `pg_default_acl` is the other half: it decides
 * what the NEXT object a lane creates will be born holding. A branch entry production does
 * not have makes every function, table and sequence a lane creates from now on wider than
 * production's, and the grants clause cannot see it, because a brand-new branch object is
 * absent from production and is skipped there by design (`notShared`).
 *
 * This clause exists because a night lane reported that new functions in `iam` and
 * `platform` were acquiring an `authenticated` EXECUTE grant "production would not give
 * them", and the only way to settle it was a hand-written scratchpad query nobody would run
 * again. They are not: NEITHER database carries a `pg_default_acl` entry for `iam` or
 * `platform`, and the explicit grant on a new function there is written by the DD-202 birth
 * guard `platform.close_new_functions_to_anon_impl`, which is byte-identical on both and
 * REVOKES `PUBLIC`/`anon` while writing down the reach the function already had. A claim
 * about default privileges now has a command instead of a memory.
 *
 * SO: a `pg_default_acl` (schema, grantor, objtype, grantee, privilege) the BRANCH has and
 * PRODUCTION does not, for `anon`, `authenticated` or `service_role`, FAILS this check.
 * Bounded by the same rules the other two use, each counted rather than silently dropped:
 *   · campaign-owned namespaces and `zz_*` are the campaign's.
 *   · Supabase-managed schemas are the platform image's.
 *   · an entry whose GRANTOR is a Supabase-managed role is that role's to speak for, never
 *     this campaign's (`supabase_admin`, `supabase_auth_admin`, `pgsodium*`, …).
 *   · an entry naming a role that exists on only ONE database is not drift this campaign may
 *     close: `svc_seo` (LOGIN, BYPASSRLS) and `cli_login_postgres` are production-only and
 *     `v5/BRANCH-GRANT-DRIFT.md` records them as NEVER MINTED on the branch. Counted as
 *     `roleAbsent` and printed.
 * The production-only direction (the branch being TIGHTER) is counted and printed, never
 * failed — it denies reads production allows, which wastes a lane's time but never
 * manufactures a green.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import type pg from "pg";

import { renderSyncPlan } from "./lib/branch-sync-plan";
import { connectDirect, DB_VARS, loadDbEnv } from "./lib/direct-db";
import {
  assertServerMatchesTarget,
  loadBranchDbEnv,
  loadBranchRef,
  TargetRefusal,
} from "./lib/migration-target";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APPLICATION_NAME = "matrx-frontend check:branch-schema-drift";
const EXCEPTIONS_PATH = resolve(ROOT, "scripts", "branch-schema-drift-exceptions.json");

const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

/** The five kinds a guard can live in. Named here so the list is one thing, not five. */
const KINDS = ["event_trigger", "function", "trigger", "policy", "relation"] as const;
type Kind = (typeof KINDS)[number];

interface Obj {
  readonly kind: Kind;
  readonly schema: string;
  readonly identity: string;
}

/**
 * Namespaces this campaign OWNS on the branch. Structural, so they live in code: a
 * `zz_w1store_red` schema invented at 3 a.m. for a RED proof must not need a file edit
 * before the gate will pass.
 */
const CAMPAIGN_SCHEMAS = new Set([
  "custom",
  "corpus",
  "campaign_watch",
  "h2m",
  "restore_graph",
]);

/** The 25 `public` tables the previous measurement campaign left on the branch. */
const PUBLIC_SCRATCH = new Set(
  `h2_reldoc m2_record m3_node m3_reach m4_outbox m4_r10 m4_r20 m4_r20_toast m4_r4 m4_r40
   m4c_r10 m4c_r20 m4c_r4 m4c_r40 m5_cell m5_option m5_record m_association_types
   m_associations m_grant m_lat m_reachability m_record m_results m_visibility_version`
    .split(/\s+/)
    .filter(Boolean),
);

function isCampaignOwned(o: Obj): boolean {
  // `custom`'s plain relations (tables/views) are what `platform.provision()` builds on
  // purpose and stay fully excluded, as always. Everything else scoped to `custom` —
  // functions, triggers, policies, event triggers — is a GUARD, not a provisioned table,
  // and `isFailingScope` below puts it back in the failing set even though its schema is
  // campaign-owned.
  if (o.schema === "custom") return o.kind === "relation";
  if (CAMPAIGN_SCHEMAS.has(o.schema)) return true;
  if (o.schema.startsWith("zz_")) return true;
  if (o.schema === "public") {
    const m = /^public\.([a-z0-9_]+)/.exec(o.identity);
    if (m && PUBLIC_SCRATCH.has(m[1])) return true;
  }
  // realtime's per-day message partitions: created by the platform, not by anyone here.
  if (o.identity.includes("realtime.messages_20")) return true;
  return false;
}

/** The three schemas this campaign RULES on — never a lane's exception (see loadExceptions). */
const FAILING_SCHEMAS = new Set(["platform", "iam", "history"]);

/**
 * THE FAILING SET: drift here fails the exit code. Everything else is measured and
 * printed but is INFORMATIONAL only — see the header comment for why. `strict` makes
 * every schema failing, matching the pre-2026-09-17 exhaustive behaviour.
 */
function isFailingScope(o: Obj, strict: boolean): boolean {
  if (strict) return true;
  if (o.kind === "event_trigger") return true; // any schema — a guard by definition
  if (FAILING_SCHEMAS.has(o.schema)) return true;
  if (o.schema === "custom" && o.kind !== "relation") return true; // custom-adjacent guards
  return false;
}

// ---------------------------------------------------------------------------
// The inventory. One query, five kinds, `kind | schema | identity`.
// `relation` covers tables, views, materialised views and foreign tables: the
// failure this check exists for was a table, and a view carrying a policy is the
// same class of surprise.
// ---------------------------------------------------------------------------
const INVENTORY_SQL = `
with sch as (
  select n.oid, n.nspname
  from pg_namespace n
  where n.nspname not in ('pg_catalog','information_schema','pg_toast')
    and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast_temp%'
)
select 'function' as kind, s.nspname as schema,
       s.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as identity
  from pg_proc p join sch s on s.oid = p.pronamespace
 where p.prokind in ('f','p')
union all
select 'policy', s.nspname, s.nspname||'.'||c.relname||'.'||pol.polname
  from pg_policy pol join pg_class c on c.oid = pol.polrelid join sch s on s.oid = c.relnamespace
union all
select 'trigger', s.nspname, s.nspname||'.'||c.relname||'.'||tg.tgname
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join sch s on s.oid = c.relnamespace
 where not tg.tgisinternal
union all
select 'event_trigger', '-', et.evtname
  from pg_event_trigger et
union all
select 'relation', s.nspname, s.nspname||'.'||c.relname||'['||c.relkind::text||']'
  from pg_class c join sch s on s.oid = c.relnamespace
 where c.relkind in ('r','p','v','m','f')
`;

async function inventory(client: pg.Client): Promise<Map<string, Obj>> {
  await client.query("begin transaction read only");
  try {
    const { rows } = await client.query<{ kind: Kind; schema: string; identity: string }>(
      INVENTORY_SQL,
    );
    const out = new Map<string, Obj>();
    for (const r of rows) out.set(`${r.kind}${r.schema}${r.identity}`, r);
    return out;
  } finally {
    await client.query("rollback");
  }
}

// ---------------------------------------------------------------------------
// The exceptions file.
// ---------------------------------------------------------------------------
interface ExceptionEntry {
  readonly schema: string;
  readonly reason: string;
  readonly objects: readonly string[];
}

function loadExceptions(): ExceptionEntry[] {
  const raw = JSON.parse(readFileSync(EXCEPTIONS_PATH, "utf8")) as {
    exceptions?: ExceptionEntry[];
  };
  const list = raw.exceptions ?? [];
  for (const e of list) {
    if (!e.schema || !e.reason || !Array.isArray(e.objects)) {
      throw new Error(
        `branch-schema-drift-exceptions.json: an entry is missing schema, reason or objects.`,
      );
    }
    if (e.reason.trim().length < 40) {
      throw new Error(
        `branch-schema-drift-exceptions.json: the reason for schema "${e.schema}" is ${e.reason.trim().length} characters.\n` +
          `  An exception needs a SENTENCE saying why the branch may lack these objects — at least 40 characters.`,
      );
    }
    if (["platform", "iam", "history"].includes(e.schema)) {
      throw new Error(
        `branch-schema-drift-exceptions.json: schema "${e.schema}" is one of the three this campaign RULES on.\n` +
          `  An exception there is a chair ruling recorded in v5/BUILD-LOG.md, never an edit to this file.`,
      );
    }
  }
  return list;
}

/** `kind identity` — the shape the exceptions file stores, and the one it is read by. */
function excuseKey(o: Obj): string {
  return `${o.kind} ${o.identity}`;
}

interface Verdict {
  /** Failing-scope, unexcused — this is what fails the exit code. */
  readonly missing: Obj[];
  readonly excused: Obj[];
  readonly stale: string[];
  /** Outside the failing scope — printed, never gates the exit code (unless `--strict`). */
  readonly informational: Obj[];
}

function judge(
  prod: Map<string, Obj>,
  branch: Map<string, Obj>,
  exceptions: readonly ExceptionEntry[],
  skipSchemas: ReadonlySet<string>,
  strict: boolean,
): Verdict {
  const excused = new Map<string, string>(); // "kind identity" -> schema
  for (const e of exceptions) {
    if (skipSchemas.has(e.schema)) continue;
    for (const o of e.objects) excused.set(o, e.schema);
  }
  const missing: Obj[] = [];
  const excusedHits: Obj[] = [];
  const informational: Obj[] = [];
  const used = new Set<string>();
  for (const [key, o] of prod) {
    if (branch.has(key)) continue;
    if (isCampaignOwned(o)) continue;
    const k = excuseKey(o);
    if (excused.has(k)) {
      used.add(k);
      excusedHits.push(o);
      continue;
    }
    if (isFailingScope(o, strict)) {
      missing.push(o);
    } else {
      informational.push(o);
    }
  }
  const stale = [...excused.keys()].filter((k) => !used.has(k)).sort();
  missing.sort((a, b) => excuseKey(a).localeCompare(excuseKey(b)));
  informational.sort((a, b) => excuseKey(a).localeCompare(excuseKey(b)));
  return { missing, excused: excusedHits, stale, informational };
}

function printInformational(items: readonly Obj[]): void {
  if (items.length === 0) return;
  const bySchema = new Map<string, number>();
  for (const o of items) bySchema.set(o.schema, (bySchema.get(o.schema) ?? 0) + 1);
  console.log(
    `\n${C.cyan}INFORMATIONAL — ${items.length} production object(s) outside the campaign's rehearsed schemas${C.reset}`,
  );
  console.log(
    `  ${C.dim}platform, iam, history, custom's guards and every event trigger are what this gate\n` +
      `  fails on. These move on other teams' schedule and are printed, never gated — pass\n` +
      `  --strict to fail on them too.${C.reset}`,
  );
  console.log(
    `  by schema: ${[...bySchema.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s} ${n}`)
      .join(" · ")}`,
  );
  console.log(`  first ${Math.min(10, items.length)}:`);
  for (const o of items.slice(0, 10)) console.log(`    ${C.dim}${excuseKey(o)}${C.reset}`);
}

function printVerdict(v: Verdict, label: string): void {
  const byKind = new Map<string, number>();
  for (const o of v.missing) byKind.set(o.kind, (byKind.get(o.kind) ?? 0) + 1);

  if (v.missing.length > 0) {
    console.log(
      `\n${C.red}PRODUCTION HAS ${v.missing.length} OBJECT(S) THE BRANCH LACKS${C.reset} ${C.dim}(${label})${C.reset}`,
    );
    console.log(
      `  ${C.dim}Each one is something a lane can rehearse past and production will refuse —`,
    );
    console.log(`  the ${"`custom.record`"} class. Carry it to the branch, or write it down.${C.reset}`);
    for (const o of v.missing) console.log(`  ${C.red}MISSING${C.reset} ${excuseKey(o)}`);
    console.log(`\n  by kind: ${[...byKind].map(([k, n]) => `${k} ${n}`).join(" · ") || "none"}`);
  }

  if (v.stale.length > 0) {
    console.log(
      `\n${C.yellow}${v.stale.length} EXCEPTION(S) NO LONGER DESCRIBE A REAL DELTA${C.reset}`,
    );
    console.log(
      `  ${C.dim}The branch now carries these. Delete their lines from` +
        ` scripts/branch-schema-drift-exceptions.json.${C.reset}`,
    );
    for (const s of v.stale) console.log(`  ${C.yellow}STALE  ${C.reset}${s}`);
  }

  console.log(
    `\n${C.dim}excused by name: ${v.excused.length} · stale excuses: ${v.stale.length}${C.reset}`,
  );
}

async function measure(): Promise<{
  prod: Map<string, Obj>;
  branch: Map<string, Obj>;
  prodGrants: GrantRow[];
  branchGrants: GrantRow[];
  prodDefaults: DefaultAclRow[];
  branchDefaults: DefaultAclRow[];
  prodRoles: Set<string>;
  branchRoles: Set<string>;
}> {
  const prodEnv = loadDbEnv();
  if ("missing" in prodEnv) {
    throw new TargetRefusal(
      `check:branch-schema-drift needs production's five connection variables and is missing ${prodEnv.missing.join(", ")}.\n` +
        `  They are the same ${DB_VARS.length} this repo's other database tools read.`,
    );
  }
  const ref = loadBranchRef(ROOT);
  const branchEnv = loadBranchDbEnv(ROOT, ref);

  const prodClient = await connectDirect(prodEnv, APPLICATION_NAME);
  let branchClient: pg.Client | undefined;
  try {
    await assertServerMatchesTarget(
      (sql: string) => prodClient.query(sql),
      "production",
      ref,
      "check:branch-schema-drift",
    );
    branchClient = await connectDirect(branchEnv, APPLICATION_NAME);
    await assertServerMatchesTarget(
      (sql: string) => branchClient!.query(sql),
      "branch",
      ref,
      "check:branch-schema-drift",
    );
    console.log(
      `check:branch-schema-drift — production vs rehearsal branch ${ref.branchRef}\n` +
        `  production: ${prodEnv.user}@${prodEnv.host}:${prodEnv.port} (from ${prodEnv.from}, control-file id verified)\n` +
        `  branch:     ${branchEnv.user}@${branchEnv.host}:${branchEnv.port} (from ${branchEnv.from}, control-file id verified)\n` +
        `  read-only:  both inventories run inside "begin transaction read only".\n` +
        `  direction:  production-only ONLY. Branch-only is the campaign building, and is not drift.`,
    );
    const prod = await inventory(prodClient);
    const branch = await inventory(branchClient);
    const prodGrants = await grants(prodClient);
    const branchGrants = await grants(branchClient);
    const prodDefaults = await defaultAcls(prodClient);
    const branchDefaults = await defaultAcls(branchClient);
    const prodRoles = await roleNames(prodClient);
    const branchRoles = await roleNames(branchClient);
    console.log(
      `\ninventory: production ${prod.size} object(s) / branch ${branch.size} object(s)` +
        ` across ${KINDS.join(", ")}`,
    );
    console.log(
      `grants:    production ${prodGrants.length} / branch ${branchGrants.length} function EXECUTE row(s)` +
        ` for anon, authenticated, service_role and PUBLIC`,
    );
    console.log(
      `defaults:  production ${prodDefaults.length} / branch ${branchDefaults.length} pg_default_acl grant row(s)` +
        ` — what the NEXT object created in each schema is born holding`,
    );
    return {
      prod, branch, prodGrants, branchGrants,
      prodDefaults, branchDefaults, prodRoles, branchRoles,
    };
  } finally {
    await prodClient.end().catch(() => {});
    if (branchClient) await branchClient.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// THE GRANTS CLAUSE — branch-only client EXECUTE, which is the looser direction.
// ---------------------------------------------------------------------------

/** The client roles a browser or a published key can actually become. */
const CLIENT_ROLES = ["anon", "authenticated", "service_role"] as const;

/**
 * Schemas the Supabase platform image owns. The two databases run different
 * images, so these differ legitimately and none of them is a door this campaign
 * reaches.
 */
const SUPABASE_SCHEMAS = new Set([
  "auth", "storage", "realtime", "graphql", "graphql_public", "extensions",
  "pgsodium", "pgsodium_masks", "vault", "supabase_functions", "supabase_migrations",
  "net", "cron", "pgbouncer", "partman",
]);

/**
 * `function identity | grantee`, plus the `PUBLIC` rows, so the caller can tell a
 * grant that WIDENS anything from one that is already implied.
 */
const GRANTS_SQL = `
select s.nspname as schema,
       s.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as identity,
       case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee
  from pg_proc p
  join pg_namespace s on s.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 where s.nspname not in ('pg_catalog','information_schema','pg_toast')
   and s.nspname not like 'pg_%'
   and a.privilege_type = 'EXECUTE'
   and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon','authenticated','service_role'))
`;

interface GrantRow {
  readonly schema: string;
  readonly identity: string;
  readonly grantee: string;
}

async function grants(client: pg.Client): Promise<GrantRow[]> {
  await client.query("begin transaction read only");
  try {
    const { rows } = await client.query<GrantRow>(GRANTS_SQL);
    return rows;
  } finally {
    await client.query("rollback");
  }
}

interface GrantVerdict {
  /** Branch-only client EXECUTE that actually widens the answer. */
  readonly looser: readonly string[];
  /** The same rows, unformatted, for `--sync-plan`. */
  readonly looserRows: readonly GrantRow[];
  /** Branch-only, but production already grants PUBLIC — redundant, not looser. */
  readonly redundant: number;
  /** Skipped because the function is not on both databases. */
  readonly notShared: number;
}

/**
 * `prodFns` / `branchFns` come from the OBJECT INVENTORY, never from the grant rows.
 * Deriving "does production have this function?" from production's own grant list is
 * exactly wrong for the case that matters: a function production grants to NOBODY has no
 * grant row at all, so it would look absent, and a branch grant of it to `anon` — which is
 * `iam.apply_rls`, the defect this clause was written for — would be skipped as "not
 * shared" instead of failed. Caught by the planted-grant RED on 2026-09-17.
 */
function judgeGrants(
  prod: readonly GrantRow[],
  branch: readonly GrantRow[],
  prodFns: ReadonlySet<string>,
  branchFns: ReadonlySet<string>,
): GrantVerdict {
  const key = (g: GrantRow) => `${g.identity}|${g.grantee}`;
  const prodSet = new Set(prod.map(key));
  const prodPublic = new Set(prod.filter((g) => g.grantee === "PUBLIC").map((g) => g.identity));
  const looser: string[] = [];
  const looserRows: GrantRow[] = [];
  let redundant = 0;
  let notShared = 0;
  for (const g of branch) {
    // `PUBLIC` IS A CLIENT ROLE HERE, AND LEAVING IT OUT MADE THIS CLAUSE MISS THE
    // BIGGER HALF (lane W0-SYNC, second run, 2026-09-17). `anon` and `authenticated`
    // both INHERIT the PUBLIC grant, so a branch that revokes `anon` and keeps `PUBLIC`
    // still answers the call production refuses — the clause would go green on a surface
    // that had not moved at all. Measured the day it was added: 118 `anon` rows against
    // 306 `PUBLIC` rows, 106 of them on the very same functions.
    if (!(CLIENT_ROLES as readonly string[]).includes(g.grantee) && g.grantee !== "PUBLIC") continue;
    if (prodSet.has(key(g))) continue;
    if (CAMPAIGN_SCHEMAS.has(g.schema) || g.schema.startsWith("zz_")) continue;
    if (SUPABASE_SCHEMAS.has(g.schema)) continue;
    if (!prodFns.has(g.identity) || !branchFns.has(g.identity)) {
      notShared += 1;
      continue;
    }
    if (g.grantee !== "PUBLIC" && prodPublic.has(g.identity)) {
      redundant += 1;
      continue;
    }
    looser.push(`${g.identity} → ${g.grantee}`);
    looserRows.push(g);
  }
  looser.sort();
  return { looser, looserRows, redundant, notShared };
}

function printGrantVerdict(v: GrantVerdict): void {
  if (v.looser.length === 0) return;
  console.log(
    `\n${C.red}THE BRANCH GRANTS ${v.looser.length} FUNCTION EXECUTE(S) PRODUCTION DOES NOT${C.reset}`,
  );
  console.log(
    `  ${C.dim}Each one lets a client role call something production answers 42501 for, so every\n` +
      `  access proof taken over it is measuring a system that does not exist.${C.reset}`,
  );
  for (const l of v.looser.slice(0, 40)) console.log(`  ${C.red}LOOSER ${C.reset}${l}`);
  if (v.looser.length > 40) console.log(`  ${C.dim}… and ${v.looser.length - 40} more${C.reset}`);
}

// ---------------------------------------------------------------------------
// THE DEFAULT-PRIVILEGES CLAUSE — what the NEXT object will be born holding.
// ---------------------------------------------------------------------------

/**
 * Roles the Supabase platform image owns. An entry they GRANT is theirs to speak for; an
 * entry they RECEIVE is not a client door.
 */
const SUPABASE_ROLES = new Set([
  "supabase_admin", "supabase_auth_admin", "supabase_storage_admin",
  "supabase_realtime_admin", "supabase_read_only_user", "supabase_replication_admin",
  "pgsodium_keyholder", "pgsodium_keyiduser", "pgbouncer", "authenticator", "dashboard_user",
]);

/**
 * One row per (schema, grantor, objtype, grantee, privilege). `aclexplode` is what makes a
 * NULL-vs-listed comparison honest, exactly as in the grants clause.
 */
const DEFAULT_ACL_SQL = `
select n.nspname                                   as schema,
       pg_get_userbyid(d.defaclrole)               as grantor,
       d.defaclobjtype::text                       as objtype,
       case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type                            as privilege
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
`;

interface DefaultAclRow {
  readonly schema: string;
  readonly grantor: string;
  readonly objtype: string;
  readonly grantee: string;
  readonly privilege: string;
}

async function defaultAcls(client: pg.Client): Promise<DefaultAclRow[]> {
  await client.query("begin transaction read only");
  try {
    const { rows } = await client.query<DefaultAclRow>(DEFAULT_ACL_SQL);
    return rows;
  } finally {
    await client.query("rollback");
  }
}

interface DefaultAclVerdict {
  /** Branch-only entries for a client role — the dangerous direction. */
  readonly looser: readonly string[];
  /** Production-only entries for a client role — printed, never failed. */
  readonly tighter: readonly string[];
  /** Skipped, BOTH directions: the grantor or grantee role exists on only one database. */
  readonly roleAbsent: number;
  /** Skipped, BOTH directions: Supabase-managed, campaign-owned, or a non-client grantee. */
  readonly notOurs: number;
}

/**
 * Both directions are walked and every exclusion is counted in the SAME two totals, so a
 * `seo | svc_seo | r | authenticated | SELECT` that only production has is a printed number
 * rather than a row that quietly vanished. The first draft of this function counted the
 * branch direction only, and that production entry disappeared with no trace at all.
 */
function judgeDefaultAcls(
  prod: readonly DefaultAclRow[],
  branch: readonly DefaultAclRow[],
  prodRoles: ReadonlySet<string>,
  branchRoles: ReadonlySet<string>,
): DefaultAclVerdict {
  const key = (d: DefaultAclRow) =>
    `${d.schema} | ${d.grantor} | ${d.objtype} | ${d.grantee} | ${d.privilege}`;
  const prodSet = new Set(prod.map(key));
  const branchSet = new Set(branch.map(key));
  const looser: string[] = [];
  const tighter: string[] = [];
  let roleAbsent = 0;
  let notOurs = 0;

  const bothHaveRole = (r: string) =>
    r === "PUBLIC" || (prodRoles.has(r) && branchRoles.has(r));

  const consider = (d: DefaultAclRow, otherSet: ReadonlySet<string>, sink: string[]) => {
    if (otherSet.has(key(d))) return;
    if (
      !(CLIENT_ROLES as readonly string[]).includes(d.grantee) ||
      CAMPAIGN_SCHEMAS.has(d.schema) ||
      d.schema.startsWith("zz_") ||
      SUPABASE_SCHEMAS.has(d.schema) ||
      SUPABASE_ROLES.has(d.grantor)
    ) {
      notOurs += 1;
      return;
    }
    if (!bothHaveRole(d.grantor) || !bothHaveRole(d.grantee)) {
      roleAbsent += 1;
      return;
    }
    sink.push(key(d));
  };

  for (const d of branch) consider(d, prodSet, looser);
  for (const d of prod) consider(d, branchSet, tighter);
  looser.sort();
  tighter.sort();
  return { looser, tighter, roleAbsent, notOurs };
}

function printDefaultAclVerdict(v: DefaultAclVerdict): void {
  if (v.tighter.length > 0) {
    console.log(
      `\n${C.dim}default privileges — ${v.tighter.length} production entr(ies) for a client role the branch lacks.` +
        ` Printed, never failed: the branch denies something production allows, which wastes a lane's` +
        ` time but cannot manufacture a green.${C.reset}`,
    );
    for (const t of v.tighter.slice(0, 20)) console.log(`  ${C.dim}TIGHTER ${t}${C.reset}`);
    if (v.tighter.length > 20) {
      console.log(`  ${C.dim}… and ${v.tighter.length - 20} more${C.reset}`);
    }
  }
  if (v.looser.length === 0) return;
  console.log(
    `\n${C.red}THE BRANCH CARRIES ${v.looser.length} DEFAULT PRIVILEGE(S) PRODUCTION DOES NOT${C.reset}`,
  );
  console.log(
    `  ${C.dim}pg_default_acl decides what the NEXT object a lane creates is BORN holding, so this\n` +
      `  widens every function, table and sequence the campaign has not written yet — and the\n` +
      `  grants clause cannot see it, because a brand-new branch object is absent from\n` +
      `  production and is skipped there by design.${C.reset}`,
  );
  for (const l of v.looser.slice(0, 40)) console.log(`  ${C.red}LOOSER ${C.reset}${l}`);
  if (v.looser.length > 40) console.log(`  ${C.dim}… and ${v.looser.length - 40} more${C.reset}`);
}

async function roleNames(client: pg.Client): Promise<Set<string>> {
  await client.query("begin transaction read only");
  try {
    const { rows } = await client.query<{ rolname: string }>("select rolname from pg_roles");
    return new Set(rows.map((r) => r.rolname));
  } finally {
    await client.query("rollback");
  }
}

/** A synthetic production-only object for `--self-test` — never written to any database. */
function fakeObj(kind: Kind, schema: string, name: string): Obj {
  return { kind, schema, identity: `${schema}.${name}` };
}

/**
 * `--self-test` proves the failing/informational split without touching either database's
 * contents: plant ONE production-only object inside the failing scope (`platform`) and
 * require the exit path to go RED, then ONE outside it (`seo`) and require the exit path to
 * stay GREEN with that object counted as informational. Runs against the SAME `prod`/`branch`
 * maps `main` already fetched — it never re-queries.
 */
function selfTest(
  prod: Map<string, Obj>,
  branch: Map<string, Obj>,
  exceptions: readonly ExceptionEntry[],
): boolean {
  console.log(
    `\n${C.cyan}== --self-test: planted objects, no database touched ==${C.reset}`,
  );

  const redFake = fakeObj("function", "platform", "__self_test_planted_guard__()");
  const redProd = new Map(prod);
  redProd.set("__self_test_red__", redFake);
  const red = judge(redProd, branch, exceptions, new Set(), false);
  const redOk =
    red.missing.length > 0 && red.missing.some((o) => o.identity === redFake.identity);
  console.log(
    `  RED   planted in platform: ${red.missing.length} failing-scope missing (exit ${red.missing.length > 0 ? 1 : 0}) ${redOk ? "OK" : "FAILED"}`,
  );

  const greenFake = fakeObj("function", "seo", "__self_test_planted_fn__()");
  const greenProd = new Map(prod);
  greenProd.set("__self_test_green__", greenFake);
  const green = judge(greenProd, branch, exceptions, new Set(), false);
  const greenOk =
    green.missing.length === 0 &&
    green.informational.some((o) => o.identity === greenFake.identity);
  console.log(
    `  GREEN planted in seo:      ${green.missing.length} failing-scope missing / ${green.informational.length} informational (exit ${green.missing.length > 0 ? 1 : 0}) ${greenOk ? "OK" : "FAILED"}`,
  );

  const ok = redOk && greenOk;
  if (!ok) {
    console.log(
      `${C.red}SELF-TEST FAILED — the failing/informational split is not doing what this file claims.${C.reset}\n` +
        `  This check cannot be trusted to go red on its own scope, so it is not a guard.`,
    );
  } else {
    console.log(
      `${C.green}  SELF-TEST PASSED — platform drift fails, seo drift is informational only.${C.reset}`,
    );
  }
  return ok;
}

/**
 * `--sync-plan` — PRINT THE REMEDY, DO NOT APPLY IT.
 *
 * Opens ONE read-only connection to production, asks its catalog for the definition of
 * every object this run just failed on, and writes a `-- target: branch` migration that
 * carries them across plus the grant levelling. It never connects to the branch and never
 * leaves a read-only transaction. `--out <path>` saves it; without one it goes to stdout.
 */
async function emitSyncPlan(
  missing: readonly Obj[],
  looserGrants: readonly GrantRow[],
  prodGrants: readonly GrantRow[],
  branchGrants: readonly GrantRow[],
): Promise<void> {
  const argv = process.argv;
  const laneAt = argv.indexOf("--lane");
  const lane = laneAt >= 0 ? argv[laneAt + 1] : "W0-SYNC";
  const outAt = argv.indexOf("--out");
  const out = outAt >= 0 ? argv[outAt + 1] : undefined;
  const fileName = out ? out.split("/").pop()! : `w0_sync_branch_level_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.sql`;

  const byFn = (rows: readonly GrantRow[]) => {
    const m = new Map<string, string[]>();
    for (const g of rows) {
      if (!m.has(g.identity)) m.set(g.identity, []);
      m.get(g.identity)!.push(g.grantee);
    }
    return m;
  };

  const prodEnv = loadDbEnv();
  if ("missing" in prodEnv) throw new TargetRefusal(`--sync-plan needs production's connection variables.`);
  const ref = loadBranchRef(ROOT);
  const client = await connectDirect(prodEnv, APPLICATION_NAME);
  let text: string;
  try {
    await assertServerMatchesTarget(
      (sql: string) => client.query(sql),
      "production",
      ref,
      "check:branch-schema-drift --sync-plan",
    );
    await client.query("begin transaction read only");
    try {
      text = await renderSyncPlan(client, {
        missing,
        looserGrants,
        prodGrantsByFn: byFn(prodGrants),
        branchGrantsByFn: byFn(branchGrants),
        lane,
        fileName,
      });
    } finally {
      await client.query("rollback");
    }
  } finally {
    await client.end().catch(() => {});
  }
  if (out) {
    writeFileSync(out, text);
    console.log(
      `\n${C.cyan}--sync-plan wrote ${text.split("\n").length} line(s) to ${out}${C.reset}\n` +
        `  READ IT, then apply through the runner:\n` +
        `    uv run python db/apply_migrations.py --source campaign --only ${fileName} \\\n` +
        `      --target branch --lane ${lane} --no-generate`,
    );
  } else {
    console.log(`\n${C.cyan}== --sync-plan (nothing applied; production read SELECT-only) ==${C.reset}\n`);
    console.log(text);
  }
}

async function main(): Promise<number> {
  const runSelfTest = process.argv.includes("--self-test");
  const strict = process.argv.includes("--strict");
  const exceptions = loadExceptions();
  const {
    prod, branch, prodGrants, branchGrants,
    prodDefaults, branchDefaults, prodRoles, branchRoles,
  } = await measure();

  const real = judge(prod, branch, exceptions, new Set(), strict);
  const fnIdentities = (m: Map<string, Obj>) =>
    new Set([...m.values()].filter((o) => o.kind === "function").map((o) => o.identity));
  const grantVerdict = judgeGrants(
    prodGrants,
    branchGrants,
    fnIdentities(prod),
    fnIdentities(branch),
  );
  const defaultVerdict = judgeDefaultAcls(
    prodDefaults,
    branchDefaults,
    prodRoles,
    branchRoles,
  );

  if (runSelfTest && !selfTest(prod, branch, exceptions)) {
    return 1;
  }

  if (process.argv.includes("--sync-plan")) {
    await emitSyncPlan(real.missing, grantVerdict.looserRows, prodGrants, branchGrants);
  }

  printVerdict(
    real,
    strict
      ? "--strict: every schema is failing-scope, campaign-owned namespaces excluded in code"
      : "failing scope: platform, iam, history, custom-adjacent guards, all event triggers",
  );
  if (!strict) printInformational(real.informational);
  printGrantVerdict(grantVerdict);
  printDefaultAclVerdict(defaultVerdict);

  if (defaultVerdict.looser.length > 0) {
    console.log(
      `\n${C.red}BRANCH DEFAULT-PRIVILEGE DRIFT — ${defaultVerdict.looser.length} entr(ies) the branch has and production does not.${C.reset}`,
    );
    console.log(
      `  Level them with a catalog-derived file in migrations/rehearsal/ headed \`-- target: branch\`,\n` +
        `  using ALTER DEFAULT PRIVILEGES for the SAME grantor role production names, then re-run this\n` +
        `  check. Do NOT excuse one in the exceptions file — that file is about objects the branch\n` +
        `  LACKS, and a privilege it should not hand out is the opposite problem. Exit 1.`,
    );
    return 1;
  }

  if (grantVerdict.looser.length > 0) {
    console.log(
      `\n${C.red}BRANCH GRANT DRIFT — ${grantVerdict.looser.length} client EXECUTE grant(s) the branch has and production does not.${C.reset}`,
    );
    console.log(
      `  Level them with a catalog-derived file in migrations/rehearsal/ headed \`-- target: branch\`\n` +
        `  (\`grant_surface_level_with_production.sql\` is the one that closed the first 2,142), then\n` +
        `  re-run this check. Do NOT excuse one in the exceptions file — that file is about objects\n` +
        `  the branch LACKS, and a grant it should not have is the opposite problem. Exit 1.`,
    );
    return 1;
  }

  if (real.missing.length > 0) {
    console.log(
      `\n${C.red}BRANCH SCHEMA DRIFT — ${real.missing.length} production object(s) absent from the rehearsal branch.${C.reset}`,
    );
    console.log(
      `  The branch's schema is level with production BEFORE any lane rehearses (BUILD-BOOK §3).\n` +
        `  Carry each object across with a catalog-derived file in migrations/campaign/ headed\n` +
        `  \`-- target: branch\`, or record it in scripts/branch-schema-drift-exceptions.json with\n` +
        `  a sentence saying why the branch may lack it. Exit 1.`,
    );
    return 1;
  }

  console.log(
    `\n${C.green}NO BRANCH SCHEMA DRIFT IN THE FAILING SET${C.reset} — platform, iam, history, custom's\n` +
      `  guards and every event trigger match, beyond ${real.excused.length} named exception(s).\n` +
      `  platform, iam and history carry NO exceptions at all.${strict ? " (--strict: this covers every schema.)" : ` ${real.informational.length} other-schema object(s) printed above as informational and NOT gated.`}`,
  );
  console.log(
    `${C.green}NO BRANCH GRANT DRIFT${C.reset} — no function EXECUTE the branch gives anon, authenticated\n` +
      `  or service_role that production withholds. ${grantVerdict.redundant} branch-only grant(s) were\n` +
      `  counted and NOT failed because production already grants that function to PUBLIC, so they\n` +
      `  widen nothing; ${grantVerdict.notShared} were skipped because the function is not on both\n` +
      `  databases, which is the schema clause's subject.`,
  );
  console.log(
    `${C.green}NO BRANCH DEFAULT-PRIVILEGE DRIFT${C.reset} — no pg_default_acl entry the branch gives anon,\n` +
      `  authenticated or service_role that production does not. ${defaultVerdict.tighter.length} production-only\n` +
      `  entr(ies) printed above and NOT failed; ${defaultVerdict.roleAbsent} skipped because the grantor or grantee\n` +
      `  role exists on only one database (svc_seo is never minted here); ${defaultVerdict.notOurs} skipped as\n` +
      `  Supabase-managed or campaign-owned. Exit 0.`,
  );
  return 0;
}

main()
  .then((code) => exitAfterDrain(code))
  .catch((err: unknown) => {
    if (err instanceof TargetRefusal) {
      console.error(`${C.red}[FAIL]${C.reset} ${err.message}`);
    } else {
      console.error(`${C.red}[FAIL]${C.reset} ${err instanceof Error ? err.message : String(err)}`);
    }
    exitAfterDrain(1);
  });

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
 * `--self-test` proves the check RED without touching either database's contents: it
 * re-runs the comparison with the FIRST exception entry removed and asserts the exit code
 * flips to 1 and that the objects that entry covered are the ones named.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import type pg from "pg";

import { connectDirect, DB_VARS, loadDbEnv } from "./lib/direct-db";
import {
  assertServerMatchesTarget,
  loadBranchDbEnv,
  loadBranchRef,
  TargetRefusal,
} from "./lib/migration-target";

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
  readonly missing: Obj[];
  readonly excused: Obj[];
  readonly stale: string[];
}

function judge(
  prod: Map<string, Obj>,
  branch: Map<string, Obj>,
  exceptions: readonly ExceptionEntry[],
  skipSchemas: ReadonlySet<string>,
): Verdict {
  const excused = new Map<string, string>(); // "kind identity" -> schema
  for (const e of exceptions) {
    if (skipSchemas.has(e.schema)) continue;
    for (const o of e.objects) excused.set(o, e.schema);
  }
  const missing: Obj[] = [];
  const excusedHits: Obj[] = [];
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
    missing.push(o);
  }
  const stale = [...excused.keys()].filter((k) => !used.has(k)).sort();
  missing.sort((a, b) => excuseKey(a).localeCompare(excuseKey(b)));
  return { missing, excused: excusedHits, stale };
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
    console.log(
      `\ninventory: production ${prod.size} object(s) / branch ${branch.size} object(s)` +
        ` across ${KINDS.join(", ")}`,
    );
    return { prod, branch };
  } finally {
    await prodClient.end().catch(() => {});
    if (branchClient) await branchClient.end().catch(() => {});
  }
}

async function main(): Promise<number> {
  const selfTest = process.argv.includes("--self-test");
  const exceptions = loadExceptions();
  const { prod, branch } = await measure();

  const real = judge(prod, branch, exceptions, new Set());

  if (selfTest) {
    // RED, without touching a database: run the SAME comparison with the first
    // exception entry removed, and require the exit code to flip.
    const planted = exceptions[0];
    if (!planted) {
      console.log(`${C.red}--self-test needs at least one exception entry to remove.${C.reset}`);
      return 1;
    }
    const red = judge(prod, branch, exceptions, new Set([planted.schema]));
    console.log(
      `\n${C.cyan}== --self-test: the exclusion for schema "${planted.schema}" is removed ==${C.reset}`,
    );
    const expected = real.missing.length + planted.objects.length;
    const ok =
      red.missing.length === expected &&
      red.missing.length > real.missing.length &&
      planted.objects.every((o) => red.missing.some((m) => excuseKey(m) === o));
    console.log(
      `  with it:    ${real.missing.length} missing (exit ${real.missing.length > 0 ? 1 : 0})\n` +
        `  without it: ${red.missing.length} missing (exit 1), and every one of the ${planted.objects.length}` +
        ` objects that entry covered is named`,
    );
    if (!ok) {
      console.log(
        `${C.red}SELF-TEST FAILED — removing a real exclusion did not produce exactly its objects.${C.reset}\n` +
          `  This check cannot be trusted to go red, so it is not a guard. Exit 1.`,
      );
      return 1;
    }
    console.log(`${C.green}  SELF-TEST PASSED — the check goes RED when an excuse is withdrawn.${C.reset}`);
  }

  printVerdict(real, "campaign-owned namespaces excluded in code; the rest by name");

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
    `\n${C.green}NO BRANCH SCHEMA DRIFT${C.reset} — production holds no event trigger, function, trigger,\n` +
      `  policy or table that the rehearsal branch lacks, beyond ${real.excused.length} named exception(s).\n` +
      `  platform, iam and history carry NO exceptions at all. Exit 0.`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    if (err instanceof TargetRefusal) {
      console.error(`${C.red}[FAIL]${C.reset} ${err.message}`);
    } else {
      console.error(`${C.red}[FAIL]${C.reset} ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  });

#!/usr/bin/env npx tsx
/**
 * `pnpm db:objects-diff --against branch` — THE OBJECT-LEVEL DIFF of production
 * and the unified-data rehearsal branch, in both directions, by name.
 *
 * WHY THIS EXISTS (v5 BUILD-BOOK `W0-TGT-FE`, ATTACK-4 finding 7)
 * --------------------------------------------------------------
 * The rehearsal branch's entry check used to be a count: "these three schemas
 * exist, so the branch can stand in for production". A count cannot see that the
 * branch is already structurally BEHIND the production it stands in for.
 * Measured 2026-09-16: `platform` held 90 base tables on production against 88
 * on the branch, production carrying `masterwork_run_kind` and
 * `provision_generate_target` the branch never received. The branch is a
 * schema-only transplant, both repos take ~400 commits a day, and a file whose
 * rehearsal passed on the branch is applied to production up to 59 hours later —
 * a production that moved underneath it in the meantime. The entry therefore
 * prints the objects, not the count, and this is the named tool that prints them.
 *
 * WHAT IT COMPARES
 * ----------------
 * Base tables, columns, constraints, triggers, and event triggers — every
 * non-catalog schema on both clusters, in BOTH directions. Columns, constraints
 * and triggers are only reported for tables that exist on BOTH sides: a
 * branch-only table with twenty columns would otherwise print twenty-one lines
 * saying one thing, and the table-level line already says it. That suppression
 * is stated in the printed header, because a rule nobody can see is a silence.
 *
 * WHAT IT RULES ON (and what it deliberately does not)
 * ---------------------------------------------------
 * The classifier is `scripts/lib/db-objects-diff-core.ts`, guarded by
 * `scripts/__tests__/db-objects-diff-classify.test.ts` — its header carries the
 * three classes and why there are three. In short: only `platform`, `iam` and
 * `history` deltas (plus event triggers) are A RULING and set the exit code; the
 * 25 named `public` scratch tables and the reserved `corpus.*`,
 * `campaign_watch.*`, `zz_<lane>_*` namespaces are PRE-RULED NOISE, printed
 * under their own heading and never counted; everything else prints under
 * OUTSIDE THE RULING SCHEMAS and, by the entry's own wording, does not gate.
 * Exit 1 when any RULING-class delta exists, 0 when there is none — the full
 * list and the counts print either way, because this tool's job is to be read.
 *
 * ABSOLUTELY SELECT-ONLY
 * ----------------------
 * Both connections run their whole inventory inside `begin transaction read
 * only`, so the server itself refuses a write this process could not have meant
 * to make. There is no write path in this file, on either side, in any flag
 * combination.
 *
 * HOW IT CONNECTS — the sanctioned resolution, never a second story
 * ----------------------------------------------------------------
 * Production is the five `SUPABASE_MATRIX_*` values through
 * `scripts/lib/direct-db.ts`; the branch is the whole DSN in
 * `SUPABASE_BRANCH_DATABASE_URL` through `loadBranchDbEnv`, verified against
 * `common-docs/projects/data-doctrine-adoption/plan/BRANCH-REF`. An unreadable
 * BRANCH-REF is a REFUSAL with the remedy, never a fallback to whatever the
 * environment holds — and after both sockets open, each server is asked its own
 * `pg_control_system().system_identifier` and compared to BRANCH-REF's, so this
 * tool cannot diff production against itself and call the answer "no drift".
 * No secret is ever printed: identities only.
 */
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
import {
  diffSides,
  formatDelta,
  summarise,
  type ClassifiedDelta,
  type DeltaObject,
  type ObjectKind,
} from "./lib/db-objects-diff-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APPLICATION_NAME = "matrx-frontend db:objects-diff";

/** A refusal this tool raises itself, printed the same way as a TargetRefusal. */
class DiffRefusal extends Error {}

function refuse(lines: string[]): never {
  throw new DiffRefusal(lines.join("\n"));
}

/** `--against <side>`. Only `branch` exists; anything else is named, not coerced. */
function parseAgainst(argv: readonly string[]): "branch" {
  const arg = argv.find((a) => a === "--against" || a.startsWith("--against="));
  if (!arg) {
    refuse([
      `pnpm db:objects-diff needs --against branch.`,
      `  It diffs production against ONE named other database and will not guess which.`,
      `  Remedy: pnpm db:objects-diff --against branch`,
    ]);
  }
  const value = arg.includes("=") ? arg.split("=").slice(1).join("=") : argv[argv.indexOf(arg) + 1];
  if (value !== "branch") {
    refuse([
      `--against ${value ?? "(nothing)"} is not a side this tool knows.`,
      `  The only other database with a checked-in identity is the rehearsal branch.`,
      `  Remedy: pnpm db:objects-diff --against branch`,
    ]);
  }
  return "branch";
}

// ---------------------------------------------------------------------------
// The inventory. Five SELECTs, each producing `identity -> signature`.
// ---------------------------------------------------------------------------

const SEP = String.fromCharCode(31); // ASCII unit separator — never legal in a pg identifier

function identityOf(o: DeltaObject): string {
  return [o.kind, o.schema ?? "", o.table ?? "", o.name].join(SEP);
}

function parseIdentity(identity: string): DeltaObject {
  const [kind, schema, table, name] = identity.split(SEP);
  return {
    kind: kind as ObjectKind,
    schema: schema === "" ? null : schema!,
    table: table === "" ? null : table!,
    name: name!,
  };
}

/** Catalog and per-session schemas only — everything else is inventoried. */
const SCHEMA_FILTER = `n.nspname not in ('pg_catalog','information_schema')
     and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'`;

const TABLES_SQL = `
  select n.nspname as schema_name, c.relname as table_name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and ${SCHEMA_FILTER}`;

const COLUMNS_SQL = `
  select n.nspname as schema_name, c.relname as table_name, a.attname as column_name,
         format_type(a.atttypid, a.atttypmod) as data_type,
         a.attnotnull as not_null,
         coalesce(pg_get_expr(d.adbin, d.adrelid), '') as column_default,
         a.attidentity as identity_kind,
         a.attgenerated as generated_kind
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where c.relkind in ('r','p') and a.attnum > 0 and not a.attisdropped and ${SCHEMA_FILTER}`;

const CONSTRAINTS_SQL = `
  select n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name,
         pg_get_constraintdef(con.oid) as definition
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where ${SCHEMA_FILTER}`;

const TRIGGERS_SQL = `
  select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name,
         pg_get_triggerdef(t.oid) as definition, t.tgenabled as enabled
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and ${SCHEMA_FILTER}`;

const EVENT_TRIGGERS_SQL = `
  select e.evtname as name, e.evtevent as event, e.evtenabled as enabled,
         p.proname as function_name, e.evttags::text as tags
  from pg_event_trigger e
  join pg_proc p on p.oid = e.evtfoid`;

interface Inventory {
  readonly objects: Map<string, string>;
  readonly tables: Set<string>;
}

/** Everything this tool reads, in ONE read-only transaction per side. */
async function inventory(client: pg.Client): Promise<Inventory> {
  const objects = new Map<string, string>();
  const tables = new Set<string>();
  await client.query("begin transaction read only");
  try {
    for (const r of (await client.query(TABLES_SQL)).rows) {
      const o: DeltaObject = {
        kind: "table",
        schema: r.schema_name,
        table: r.table_name,
        name: r.table_name,
      };
      objects.set(identityOf(o), "exists");
      tables.add(`${r.schema_name}.${r.table_name}`);
    }
    for (const r of (await client.query(COLUMNS_SQL)).rows) {
      const o: DeltaObject = {
        kind: "column",
        schema: r.schema_name,
        table: r.table_name,
        name: r.column_name,
      };
      objects.set(
        identityOf(o),
        [
          r.data_type,
          r.not_null ? "not null" : "null",
          r.column_default ? `default ${r.column_default}` : "no default",
          r.identity_kind ? `identity ${r.identity_kind}` : "",
          r.generated_kind ? `generated ${r.generated_kind}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    }
    for (const r of (await client.query(CONSTRAINTS_SQL)).rows) {
      const o: DeltaObject = {
        kind: "constraint",
        schema: r.schema_name,
        table: r.table_name,
        name: r.constraint_name,
      };
      objects.set(identityOf(o), r.definition);
    }
    for (const r of (await client.query(TRIGGERS_SQL)).rows) {
      const o: DeltaObject = {
        kind: "trigger",
        schema: r.schema_name,
        table: r.table_name,
        name: r.trigger_name,
      };
      objects.set(identityOf(o), `${r.definition} [enabled=${r.enabled}]`);
    }
    for (const r of (await client.query(EVENT_TRIGGERS_SQL)).rows) {
      const o: DeltaObject = {
        kind: "event_trigger",
        schema: null,
        table: null,
        name: r.name,
      };
      objects.set(
        identityOf(o),
        `on ${r.event} execute ${r.function_name} [enabled=${r.enabled}] tags=${r.tags ?? "(all)"}`,
      );
    }
  } finally {
    // A read-only transaction has nothing to commit; end it either way so the
    // pooler never holds an idle-in-transaction connection on our account.
    await client.query("rollback").catch(() => undefined);
  }
  return { objects, tables };
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

function heading(title: string, sub: string, rows: ClassifiedDelta[]): void {
  console.log("");
  console.log(`${title}  (${rows.length})`);
  console.log(`  ${sub}`);
  if (rows.length === 0) {
    console.log("  — none —");
    return;
  }
  for (const r of rows) console.log(formatDelta(r));
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  parseAgainst(argv);

  // BRANCH-REF first: no socket is opened before the branch's identity is known.
  const ref = loadBranchRef(ROOT);

  const prodEnv = loadDbEnv();
  if ("missing" in prodEnv) {
    refuse([
      `The production connection is not configured: missing ${prodEnv.missing.join(", ")}.`,
      `  Looked in: ${prodEnv.looked.join(", ") || "(no env file found)"}.`,
      `  This tool compares TWO databases and refuses to report "no drift" against one.`,
      `  Remedy: set ${DB_VARS.join(", ")} (this repo's .env, or ../aidream/.env).`,
    ]);
  }
  const branchEnv = loadBranchDbEnv(ROOT, ref);

  console.log(`db:objects-diff — production vs rehearsal branch ${ref.branchRef}`);
  console.log(`  production: ${prodEnv.user}@${prodEnv.host}:${prodEnv.port}/${prodEnv.database} (from ${prodEnv.from})`);
  console.log(`  branch:     ${branchEnv.user}@${branchEnv.host}:${branchEnv.port}/${branchEnv.database} (from ${branchEnv.from})`);
  console.log(`  identities: ${ref.path}`);
  console.log(`  read-only:  every query runs inside "begin transaction read only" on both sides.`);
  console.log(
    `  suppressed: columns/constraints/triggers of a table that exists on only ONE side —`,
  );
  console.log(`              the table-level line already names it once.`);

  const prod = await connectDirect(prodEnv, APPLICATION_NAME);
  let branch: pg.Client | null = null;
  try {
    await assertServerMatchesTarget((sql) => prod.query(sql), "production", ref, "db:objects-diff");
    branch = await connectDirect(branchEnv, APPLICATION_NAME);
    await assertServerMatchesTarget((sql) => branch!.query(sql), "branch", ref, "db:objects-diff");

    const prodInv = await inventory(prod);
    const branchInv = await inventory(branch);

    const bothSides = (o: DeltaObject): boolean => {
      if (!o.schema || !o.table) return true;
      const key = `${o.schema}.${o.table}`;
      return prodInv.tables.has(key) && branchInv.tables.has(key);
    };

    const deltas = diffSides(prodInv.objects, branchInv.objects, parseIdentity, bothSides);
    const s = summarise(deltas);

    console.log("");
    console.log(
      `inventory: production ${prodInv.objects.size} objects / ${prodInv.tables.size} base tables · ` +
        `branch ${branchInv.objects.size} objects / ${branchInv.tables.size} base tables`,
    );

    heading(
      "A RULING — platform / iam / history, and event triggers",
      "Each of these is a chair ruling before wave 1 opens. A lane never absorbs one.",
      s.ruling,
    );
    heading(
      "PRE-RULED NOISE — needs no ruling and no lane's time",
      "The 25 named public scratch tables + corpus.* / campaign_watch.* / zz_<lane>_*. Never counted into the exit code.",
      s.noise,
    );
    heading(
      "OUTSIDE THE RULING SCHEMAS — printed, not gated",
      "W0-TGT-FE rules on platform/iam/history only; these are shown so nothing is hidden, and do not set the exit code.",
      s.outside,
    );

    console.log("");
    console.log("SUMMARY");
    console.log(`  A RULING:        ${s.ruling.length}`);
    console.log(`  PRE-RULED NOISE: ${s.noise.length}`);
    console.log(`  OUTSIDE:         ${s.outside.length}`);
    console.log(
      `  by direction:    production-only ${s.productionOnly} · branch-only ${s.branchOnly} · differs ${s.differs}`,
    );
    console.log(
      s.exitCode === 0
        ? `  VERDICT: no RULING-class delta. Exit 0.`
        : `  VERDICT: ${s.ruling.length} RULING-class delta(s) — a chair ruling each, recorded with what it costs. Exit 1.`,
    );
    return s.exitCode;
  } finally {
    await prod.end().catch(() => undefined);
    if (branch) await branch.end().catch(() => undefined);
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((e) => {
    if (e instanceof TargetRefusal || e instanceof DiffRefusal) {
      console.error(`\ndb:objects-diff REFUSED\n${e.message}\n`);
      process.exit(2);
    }
    console.error(`\ndb:objects-diff FAILED\n${e instanceof Error ? e.stack : String(e)}\n`);
    process.exit(3);
  });

#!/usr/bin/env npx tsx
/**
 * `pnpm db:apply <migrations/file.sql>` — THE ONE WAY matrx-frontend applies a
 * migration to the live database.
 *
 * WHY THIS EXISTS (the defect it closes, measured 2026-09-11)
 * ----------------------------------------------------------
 * Until today CLAUDE.md told agents to apply DDL by pasting it into the Supabase
 * MCP (`apply_migration` / `execute_sql`) and then to write the ledger row
 * themselves with the SHA-256 of the FILE. On that path NOTHING links the bytes
 * that were ledgered to the bytes that were executed: an agent composing MCP
 * calls section by section can leave a statement out of every payload, and the
 * ledger still records the whole file's hash. That happened to
 * `ctx_scope_access_membrane_b7_fix1.sql` — one trailing `comment on table`
 * statement never ran, and `pnpm check:migrations` was green the entire time,
 * because it compares the file's checksum to a checksum of that same file.
 * There is no PARTIALLY-APPLIED class on that path because nothing can see it.
 *
 * aidream's `db/apply_migrations.py` never had this hole, and its header states
 * the invariant this script obeys:
 *
 *   "Migration files never write public._schema_migrations themselves. The runner
 *    owns that row and records the SHA-256 of the bytes it actually executed; a
 *    self-written placeholder checksum guarantees a false drift report next run."
 *
 * WHAT THIS SCRIPT GUARANTEES
 * ---------------------------
 * 1. The ENTIRE file is sent in ONE call, as one statement batch — never split,
 *    never retyped, never composed by hand. Nothing can be left out of a payload
 *    that is the file itself.
 * 2. The migration and its ledger row are ONE transaction (PostgREST wraps the
 *    whole request; proven by probe: a two-statement payload whose second
 *    statement failed left the first rolled back). So there is no ledger row
 *    without a fully executed file, and no fully executed file without a ledger
 *    row.
 * 3. The ledgered checksum is the SHA-256 of the migration bytes in the payload
 *    that executed — the same bytes, in the same call. After the commit the row
 *    is re-read and compared, and a mismatch is a hard failure.
 * 4. On ANY error: the verbatim Postgres error (code + message), no ledger row,
 *    exit 1. Nothing is swallowed, nothing falls back.
 *
 * TRANSPORT: `public.execute_admin_query` over PostgREST with SUPABASE_SECRET_KEY
 * — the same door `scripts/check-db-guards.ts` reads through. matrx-frontend has
 * no Postgres connection of its own; this is the only DDL path it owns.
 *
 * USAGE
 *   pnpm db:apply migrations/foo.sql            apply + ledger (one transaction)
 *   pnpm db:apply migrations/foo.sql --dry-run  print exactly what would run
 *   pnpm db:apply migrations/foo.sql --reapply  re-execute a file whose ledger
 *                                               row holds a DIFFERENT checksum
 *   pnpm db:apply --self-test                   prove RED then GREEN against the
 *                                               real DB in a throwaway schema
 *
 * `--reapply` means: EXECUTE THESE BYTES AGAIN against the one live database.
 * The DB is not reconciled against files — a file is a record of a change that
 * already landed. Re-running old bytes has reverted live rows before (see the
 * aidream runner's header). Use it only when the new bytes genuinely must still
 * execute; if the DB already holds them and only the row is stale, that is
 * aidream's `--accept-drift`, not this.
 *
 * REFUSALS (each is a real error with a sentence, never a silent skip):
 *   - a file that writes `public._schema_migrations` itself (the runner's rule)
 *   - a file needing autocommit (CREATE INDEX CONCURRENTLY, VACUUM, ALTER TYPE
 *     ... ADD VALUE): those cannot run inside this transaction — apply them from
 *     aidream: `python db/apply_migrations.py --source matrx-frontend --only <f>`
 *   - a `-- migrate: skip:` file
 *   - a ledger row with a different checksum, without --reapply
 *   - a publishable-only key (DDL needs SUPABASE_SECRET_KEY)
 *
 * Exit codes: 0 applied (or already applied, byte-identical) · 1 refusal or SQL
 * failure · 2 unexpected error / creds absent.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = resolve(ROOT, "migrations");
const SOURCE = "matrx-frontend";
/**
 * Same production-safe bound as aidream and `ddl_lock_timeout_guard`.
 *
 * A waiting DDL command queues later readers behind its requested strong lock;
 * 15 seconds is longer than the change-feed and readiness budgets.  Keep this
 * explicit because an explicit nonzero setting wins over the event-trigger
 * fallback, and because this runner's whole payload is one transaction.
 */
const LOCK_TIMEOUT = "2s";
const STATEMENT_TIMEOUT = "600s";

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

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Single-quote a string for inlining into SQL (the door takes one text arg). */
function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Comments stripped, so a detector never trips on a commented-out statement. */
function stripForDetection(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Mirror of the aidream runner's `_find_self_ledgering` write pattern. */
const SELF_LEDGER_RE =
  /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE(?:\s+TABLE)?|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE)\s+(?:public\.)?_schema_migrations\b/i;

/** Mirror of the aidream runner's `_RE_NEEDS_AUTOCOMMIT`. */
const NEEDS_AUTOCOMMIT_RE =
  /\b(?:CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY|REINDEX\s+\w+\s+CONCURRENTLY|DROP\s+INDEX\s+CONCURRENTLY|VACUUM\b|ALTER\s+TYPE\s+\S+\s+ADD\s+VALUE)\b/i;

const SKIP_MARKER = /^\s*--\s*migrate\s*:\s*skip(?:\s*:\s*(.+))?\s*$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

function skipReason(sql: string): string | null {
  for (const line of sql.split("\n", 25)) {
    const m = line.match(SKIP_MARKER);
    if (m) return (m[1] ?? "").trim();
  }
  return null;
}

/** URL + a key. DDL needs the SECRET key; a publishable key is refused, never
 *  quietly used (it would fail with a confusing 42501 deep inside the door). */
function loadEnv(): { url: string; key: string; secret: boolean } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  let publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const [, k, raw] = m;
        const v = (raw ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && k === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!key && k === "SUPABASE_SECRET_KEY") key = v;
        if (!publishable && k === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") publishable = v;
      }
      if (url && key) break;
    }
  }
  if (!url) return null;
  if (key) return { url, key, secret: true };
  if (publishable) return { url, key: publishable, secret: false };
  return null;
}

interface DoorError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/** One call through the admin query door. Throws with the verbatim PG error. */
async function door(env: { url: string; key: string }, sql: string): Promise<unknown> {
  const res = await fetch(`${env.url.replace(/\/$/, "")}/rest/v1/rpc/execute_admin_query`, {
    method: "POST",
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      "Content-Type": "application/json",
      "Content-Profile": "public",
      "Accept-Profile": "public",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    let e: DoorError = {};
    try {
      e = JSON.parse(text) as DoorError;
    } catch {
      /* keep raw */
    }
    const parts = [
      e.code ? `SQLSTATE ${e.code}` : `HTTP ${res.status}`,
      e.message ?? text,
      e.details ? `DETAIL: ${e.details}` : "",
      e.hint ? `HINT: ${e.hint}` : "",
    ].filter(Boolean);
    throw new Error(parts.join("\n"));
  }
  return JSON.parse(text) as unknown;
}

function rows(payload: unknown): Array<Record<string, unknown>> {
  const r = (payload as { result?: unknown } | null)?.result;
  return Array.isArray(r) ? (r as Array<Record<string, unknown>>) : [];
}

async function ledgerRow(
  env: { url: string; key: string },
  filename: string,
): Promise<{ checksum: string; applied_at: string } | null> {
  const out = await door(
    env,
    `select checksum, applied_at::text as applied_at from public._schema_migrations
       where source = ${lit(SOURCE)} and filename = ${lit(filename)}`,
  );
  const r = rows(out)[0];
  return r
    ? { checksum: String(r.checksum), applied_at: String(r.applied_at) }
    : null;
}

function usage(): void {
  console.log(
    `${C.bold}pnpm db:apply <migrations/file.sql> [--dry-run] [--reapply]${C.reset}\n` +
      `  pnpm db:apply --self-test          prove RED/GREEN against the live database\n` +
      `  Applies the WHOLE file in one transaction through the admin query door and\n` +
      `  ledgers the SHA-256 of the bytes it executed. The only sanctioned apply path\n` +
      `  for matrx-frontend migrations (see CLAUDE.md § Migrations).`,
  );
}

/** Apply ONE file. The whole of db:apply lives here so --self-test exercises
 *  exactly the code an agent runs, not a paraphrase of it. */
async function applyFile(
  path: string,
  opts: { dryRun: boolean; reapply: boolean },
): Promise<number> {
  const { dryRun, reapply } = opts;
  if (relative(MIGRATIONS_DIR, path).startsWith("..")) {
    console.error(
      `${TAG.fail}${relative(ROOT, path)} is not in migrations/. Every applied file lives in ` +
        `migrations/ so check:migrations can see it; move it there first.`,
    );
    return 1;
  }

  const filename = relative(MIGRATIONS_DIR, path);
  const sql = readFileSync(path, "utf8");
  const checksum = sha256(sql);

  if (sql.trim().length === 0) {
    console.error(`${TAG.fail}${filename} is empty — nothing to apply.`);
    return 1;
  }

  const skip = skipReason(sql);
  if (skip !== null) {
    console.error(
      `${TAG.fail}${filename} carries \`-- migrate: skip\`${skip ? `: ${skip}` : ""}. ` +
        `A skip-marked file is never applied by any path. Remove the marker if it must run.`,
    );
    return 1;
  }

  const stripped = stripForDetection(sql);
  if (SELF_LEDGER_RE.test(stripped)) {
    console.error(
      `${TAG.fail}${filename} writes public._schema_migrations itself.\n` +
        `  The applier owns that row and records the SHA-256 of the bytes it executed. A\n` +
        `  self-written checksum is a claim nobody can check and guarantees a false drift\n` +
        `  report next run. Delete the ledger statement from the file and re-run db:apply.`,
    );
    return 1;
  }
  if (NEEDS_AUTOCOMMIT_RE.test(stripped)) {
    console.error(
      `${TAG.fail}${filename} contains a statement that cannot run inside a transaction\n` +
        `  (CREATE/DROP INDEX CONCURRENTLY, REINDEX CONCURRENTLY, VACUUM, or ALTER TYPE ... ADD VALUE).\n` +
        `  This door is transactional, so applying it here would fail halfway. Apply it from\n` +
        `  the aidream checkout, which runs such files in autocommit and owns the same ledger:\n` +
        `      python db/apply_migrations.py --source ${SOURCE} --only ${filename}`,
    );
    return 1;
  }

  const env = loadEnv();
  if (!env) {
    console.error(
      `${TAG.fail}Supabase creds absent — need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY ` +
        `(in the environment or .env.local). Nothing was applied.`,
    );
    return 2;
  }
  if (!env.secret) {
    console.error(
      `${TAG.fail}Only a publishable key is present. DDL needs SUPABASE_SECRET_KEY — refusing ` +
        `rather than failing with a confusing permission error inside the database.`,
    );
    return 2;
  }

  // The payload. `set_config(..., true)` is transaction-local, so the ledger row
  // records the server-measured execution time of THIS transaction.
  const prologue =
    `set local lock_timeout = '${LOCK_TIMEOUT}';\n` +
    `set local statement_timeout = '${STATEMENT_TIMEOUT}';\n` +
    `select set_config('matrx.db_apply_t0', clock_timestamp()::text, true);\n`;
  const ledgerUpsert =
    `insert into public._schema_migrations (source, filename, checksum, duration_ms)\n` +
    `values (${lit(SOURCE)}, ${lit(filename)}, ${lit(checksum)},\n` +
    `        greatest(1, (extract(epoch from clock_timestamp()\n` +
    `                     - current_setting('matrx.db_apply_t0')::timestamptz) * 1000)::int))\n` +
    `on conflict (source, filename) do update set\n` +
    `  checksum = excluded.checksum, applied_at = now(), duration_ms = excluded.duration_ms;\n`;
  const payload = `${prologue}${sql}\n;\n${ledgerUpsert}`;

  console.log(
    `${C.bold}db:apply${C.reset} ${C.white}${filename}${C.reset} ` +
      `${C.dim}(${Buffer.byteLength(sql, "utf8")} bytes, sha256 ${checksum})${C.reset}`,
  );

  const existing = await ledgerRow(env, filename).catch((err: unknown) => {
    console.error(`${TAG.fail}Could not read the ledger — ${String(err)}`);
    return undefined;
  });
  if (existing === undefined) return 2;

  if (existing) {
    if (existing.checksum === checksum) {
      console.log(
        `${TAG.ok}Already applied, byte-identical (ledgered ${existing.applied_at}). Nothing to do.`,
      );
      return 0;
    }
    if (!reapply) {
      const known = SHA256_RE.test(existing.checksum)
        ? `a DIFFERENT SHA-256 (${existing.checksum})`
        : `${JSON.stringify(existing.checksum)}, which is not a SHA-256 at all — what ran was never recorded`;
      console.error(
        `${TAG.fail}${filename} is already ledgered with ${known}, applied ${existing.applied_at}.\n` +
          `  The file on disk is not the bytes that ran. Refusing.\n` +
          `  --reapply means: EXECUTE THESE BYTES AGAIN against the one live database. Old bytes\n` +
          `  replayed have reverted live rows before. Only pass it when these bytes genuinely must\n` +
          `  still execute. If the database already holds them and only the row is stale, that is\n` +
          `  aidream's \`--accept-drift --only ${filename}\`, which re-points the row WITHOUT executing.`,
      );
      return 1;
    }
    console.log(
      `${TAG.warn}--reapply: re-executing these bytes over ledgered ${existing.checksum.slice(0, 12)} ` +
        `(applied ${existing.applied_at}).`,
    );
  }

  if (dryRun) {
    console.log(`${TAG.info}--dry-run — nothing was sent. Exact payload of the ONE call:`);
    console.log(`${C.dim}${"─".repeat(72)}${C.reset}`);
    console.log(payload);
    console.log(`${C.dim}${"─".repeat(72)}${C.reset}`);
    console.log(
      `${TAG.info}Ledger row it would write: source=${SOURCE} filename=${filename} ` +
        `checksum=${checksum}`,
    );
    return 0;
  }

  const t0 = Date.now();
  try {
    await door(env, payload);
  } catch (err) {
    console.error(
      `${TAG.fail}${filename} FAILED — nothing was applied and no ledger row was written ` +
        `(the migration and its ledger row are one transaction).`,
    );
    console.error(`${C.red}${String(err instanceof Error ? err.message : err)}${C.reset}`);
    return 1;
  }
  const elapsed = Date.now() - t0;

  // Proof, not assumption: re-read the row and compare it to what we hashed.
  const after = await ledgerRow(env, filename).catch(() => null);
  if (!after) {
    console.error(
      `${TAG.fail}${filename} executed but no ledger row is present. Do not re-run blindly — ` +
        `inspect public._schema_migrations before doing anything else.`,
    );
    return 1;
  }
  if (after.checksum !== checksum) {
    console.error(
      `${TAG.fail}Ledger checksum ${after.checksum} does not match the SHA-256 of the bytes ` +
        `executed (${checksum}). Something else wrote this row. Investigate before re-running.`,
    );
    return 1;
  }

  console.log(
    `${TAG.ok}Applied and ledgered — checksum ${checksum} == sha256 of the executed bytes ` +
      `${C.dim}(${elapsed} ms round trip, applied_at ${after.applied_at})${C.reset}`,
  );
  console.log(
    `${TAG.info}Next: ${C.white}pnpm db-types${C.reset} if this changed a table shape, then ` +
      `${C.white}pnpm check:migrations${C.reset}.`,
  );
  return 0;
}

/**
 * `pnpm db:apply --self-test` — the forcing test for this applier, run against
 * the REAL database with a throwaway schema. It is the only thing that can prove
 * the two properties everything else here rests on, and it proves them by making
 * them FAIL first:
 *
 *   RED   a file whose LAST statement errors → exit 1, NO ledger row, and none of
 *         the earlier statements survive (so the door is still transactional; if
 *         `public.execute_admin_query` ever stops being one transaction, this is
 *         what screams).
 *   GREEN the same file with the error removed → exit 0, ledger checksum equals
 *         the SHA-256 of the bytes on disk, and the TRAILING statement is live in
 *         the database (the exact statement class the hand-apply path dropped).
 *
 * Cleans up after itself: drops the scratch schema, deletes its ledger row, and
 * removes the scratch file — in a finally, so a failure still leaves nothing behind.
 */
const SELFTEST_FILE = "zz_db_apply_selftest.sql";
const SELFTEST_SCHEMA = "zz_db_apply_selftest";

async function selfTest(): Promise<number> {
  const env = loadEnv();
  if (!env?.secret) {
    console.error(
      `${TAG.fail}db:apply --self-test needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY. ` +
        `Refusing to report a pass it did not measure.`,
    );
    return 2;
  }
  const path = resolve(MIGRATIONS_DIR, SELFTEST_FILE);
  const body =
    `create schema if not exists ${SELFTEST_SCHEMA};\n` +
    // This is deliberately inside the file executed through applyFile, after
    // its prologue.  It makes the lock-timeout contract red if this runner ever
    // drifts above the database guard's 2s ceiling.
    `do $$ begin\n` +
    `  if current_setting('lock_timeout') <> '2s' then\n` +
    `    raise exception 'db:apply lock_timeout must be 2s, got %', current_setting('lock_timeout');\n` +
    `  end if;\n` +
    `end $$;\n` +
    `create table ${SELFTEST_SCHEMA}.landed (id int primary key, note text);\n` +
    `insert into ${SELFTEST_SCHEMA}.landed (id, note) values (1, 'first statement');\n`;
  const trailing =
    `comment on table ${SELFTEST_SCHEMA}.landed is 'trailing statement — the class the hand-apply path dropped';\n`;
  let failures = 0;

  const probe = async (sql: string): Promise<Record<string, unknown>> =>
    (rows(await door(env, sql))[0] ?? {}) as Record<string, unknown>;
  const state = () =>
    probe(
      `select (select count(*)::int from public._schema_migrations
                 where source = ${lit(SOURCE)} and filename = ${lit(SELFTEST_FILE)}) as ledger_rows,
              (select count(*)::int from information_schema.schemata
                 where schema_name = ${lit(SELFTEST_SCHEMA)}) as schema_present,
              (select checksum from public._schema_migrations
                 where source = ${lit(SOURCE)} and filename = ${lit(SELFTEST_FILE)}) as checksum,
              (select obj_description(c.oid) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = ${lit(SELFTEST_SCHEMA)} and c.relname = 'landed') as trailing_comment`,
    );

  const fail = (what: string) => {
    failures += 1;
    console.error(`${TAG.fail}self-test: ${what}`);
  };

  try {
    // ── RED ──────────────────────────────────────────────────────────────────
    writeFileSync(
      path,
      `${body}create table ${SELFTEST_SCHEMA}.never (id int, bogus zz_no_such_type);\n`,
      "utf8",
    );
    console.log(`${C.bold}self-test RED${C.reset} ${C.dim}(last statement errors)${C.reset}`);
    const redCode = await applyFile(path, { dryRun: false, reapply: false });
    const red = await state();
    if (redCode !== 1) fail(`a failing migration exited ${redCode}, expected 1`);
    if (red.ledger_rows !== 0) fail(`a failing migration wrote ${red.ledger_rows} ledger row(s)`);
    if (red.schema_present !== 0)
      fail(`statements before the error survived — the apply door is NOT one transaction`);
    if (failures === 0)
      console.log(`${TAG.ok}RED proven: exit 1, no ledger row, nothing partially applied`);

    // ── GREEN ────────────────────────────────────────────────────────────────
    writeFileSync(path, body + trailing, "utf8");
    const expected = sha256(readFileSync(path, "utf8"));
    console.log(`${C.bold}self-test GREEN${C.reset} ${C.dim}(same file, error removed)${C.reset}`);
    const greenCode = await applyFile(path, { dryRun: false, reapply: false });
    const green = await state();
    if (greenCode !== 0) fail(`a valid migration exited ${greenCode}, expected 0`);
    if (green.checksum !== expected)
      fail(`ledger checksum ${String(green.checksum)} != sha256 of the executed bytes ${expected}`);
    if (!green.trailing_comment)
      fail(`the TRAILING statement did not land — the dropped-statement class is back`);
    if (failures === 0)
      console.log(
        `${TAG.ok}GREEN proven: ledger checksum == sha256(${expected.slice(0, 12)}…) and the ` +
          `trailing statement is live`,
      );
  } finally {
    await door(
      env,
      `drop schema if exists ${SELFTEST_SCHEMA} cascade;\n` +
        `delete from public._schema_migrations where source = ${lit(SOURCE)} and filename = ${lit(SELFTEST_FILE)};`,
    ).catch((err: unknown) =>
      console.error(
        `${TAG.fail}self-test cleanup FAILED — remove schema ${SELFTEST_SCHEMA} and the ` +
          `${SELFTEST_FILE} ledger row by hand: ${String(err)}`,
      ),
    );
    if (existsSync(path)) unlinkSync(path);
  }

  if (failures) {
    console.error(`${TAG.fail}db:apply --self-test FAILED (${failures} assertion(s))`);
    return 1;
  }
  console.log(`${TAG.ok}db:apply --self-test passed against the live database`);
  return 0;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const reapply = argv.includes("--reapply");
  if (argv.includes("--self-test")) return selfTest();
  const positional = argv.filter((a) => !a.startsWith("--"));

  if (positional.length !== 1) {
    usage();
    return 1;
  }

  const target = resolve(process.cwd(), positional[0]!);
  const alt = resolve(MIGRATIONS_DIR, positional[0]!);
  const path = existsSync(target) ? target : existsSync(alt) ? alt : null;
  if (!path) {
    console.error(`${TAG.fail}No such file: ${positional[0]}`);
    return 1;
  }
  return applyFile(path, { dryRun, reapply });
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}db:apply — unexpected error:${C.reset}`, err);
    process.exit(2);
  },
);

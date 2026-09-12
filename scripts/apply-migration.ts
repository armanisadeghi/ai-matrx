#!/usr/bin/env npx tsx
/**
 * `pnpm db:apply <migrations/file.sql>` — THE ONE WAY matrx-frontend applies a
 * migration to the live database.
 *
 * WHY THIS EXISTS (the defect it closes, measured 2026-09-11)
 * ----------------------------------------------------------
 * Until 2026-09-11 CLAUDE.md told agents to apply DDL by pasting it into the
 * Supabase MCP (`apply_migration` / `execute_sql`) and then to write the ledger
 * row themselves with the SHA-256 of the FILE. On that path NOTHING links the
 * bytes that were ledgered to the bytes that were executed: an agent composing
 * MCP calls section by section can leave a statement out of every payload, and
 * the ledger still records the whole file's hash. That happened to
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
 * WHY IT RUNS ON A DIRECT POSTGRES CONNECTION (DD-149, 2026-09-12)
 * ---------------------------------------------------------------
 * This runner used to send the file through `public.execute_admin_query` over
 * PostgREST. That transport has a HARD ~8 s ceiling that no SQL can lift:
 * measured live twice, `select pg_sleep(12)` came back `57014` after 8.23 s, and
 * again after 8.29 s with `set local statement_timeout = '600s'` in front of it.
 * It cannot work by construction — from PostgREST's side the whole payload is ONE
 * statement (`execute_admin_query(query)`), and its 8 s budget is already
 * counting before any `SET` inside it runs. So the runner *declared* a 600 s
 * budget it did not have (a stand-in that never announced itself), and every
 * migration longer than 8 s — a single `iam.apply_rls` regeneration takes ~32 s —
 * had to go around it through the aidream runner. A safe path beside an unsafe
 * one is not a fix, and the two paths diverged invisibly for fifteen days
 * (DD-151: the §6d-4 door guard never fired on the PostgREST side).
 *
 * The PostgREST path is GONE, not kept as a fallback. This script now opens the
 * same connection aidream's runner uses — the Supavisor pooler, as our own login
 * role — so `statement_timeout` is a real number this file sets and the server
 * honours (proven: `pg_sleep(30)` inside the transaction, where the door died at
 * 8.2 s), and a failure reports the verbatim Postgres error WITH the line and
 * column in the migration file.
 *
 * WHAT THIS SCRIPT GUARANTEES
 * ---------------------------
 * 1. The ENTIRE file is sent in ONE call, as one statement batch — never split,
 *    never retyped, never composed by hand. Nothing can be left out of a payload
 *    that is the file itself. (The file's bytes are their own query, so a
 *    Postgres error `position` points straight at a line in the file.)
 * 2. The migration and its ledger row are ONE explicit transaction on ONE pinned
 *    server connection. So there is no ledger row without a fully executed file,
 *    and no fully executed file without a ledger row.
 * 3. The ledgered checksum is the SHA-256 of the migration bytes that executed —
 *    the same bytes, the same connection, the same transaction. After the commit
 *    the row is re-read and compared, and a mismatch is a hard failure.
 * 4. On ANY error: the verbatim Postgres error (code + message + where in the
 *    file), ROLLBACK, no ledger row, exit 1. Nothing is swallowed, nothing falls
 *    back to a weaker path.
 *
 * TRANSPORT: a direct Postgres connection built from `SUPABASE_MATRIX_USER /
 * _PASSWORD / _HOST / _PORT / _DATABASE_NAME` — the same five variables aidream's
 * runner and this repo's own `scripts/hr/*.py` already use, read from this repo's
 * env files first and from the aidream checkout's `.env` second (announced out
 * loud when that is where they came from). No new secret, none of them in git.
 *
 * USAGE
 *   pnpm db:apply migrations/foo.sql            apply + ledger (one transaction)
 *   pnpm db:apply migrations/foo.sql --dry-run  print exactly what would run
 *   pnpm db:apply migrations/foo.sql --reapply  re-execute a file whose ledger
 *                                               row holds a DIFFERENT checksum
 *   pnpm db:apply migrations/foo.sql --statement-timeout=30min   raise the budget
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
 *   - a file carrying its own BEGIN / COMMIT / ROLLBACK: this runner owns the
 *     transaction, and a COMMIT inside the file would end it early and leave the
 *     rest of the file outside it
 *   - a file needing autocommit (CREATE INDEX CONCURRENTLY, VACUUM, ALTER TYPE
 *     ... ADD VALUE): those cannot run inside this transaction — apply them from
 *     aidream: `python db/apply_migrations.py --source matrx-frontend --only <f>`
 *   - a `-- migrate: skip:` file
 *   - a ledger row with a different checksum, without --reapply
 *   - absent connection credentials (never a quiet downgrade to a weaker path)
 *
 * Exit codes: 0 applied (or already applied, byte-identical) · 1 refusal or SQL
 * failure · 2 unexpected error / creds absent.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

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
/**
 * The real per-statement ceiling. Unlike the PostgREST door this replaced, this
 * one is set on our own session inside our own transaction and the server
 * honours it — `pg_sleep(30)` proven live, 2026-09-12. It is deliberately far
 * above any migration we run (the longest real one, a full `iam.apply_rls`
 * regeneration, is ~32 s) so that hitting it means STUCK, not slow.
 * `--statement-timeout=<pg interval>` raises or lowers it for one run.
 */
const STATEMENT_TIMEOUT = "600s";
/** A contaminated pooler session is repaired in-transaction; see identity check. */
const POOLER_ATTEMPTS = 5;

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

/** Single-quote a string for inlining into SQL. */
function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Comments stripped, so a detector never trips on a commented-out statement. */
function stripForDetection(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * Comments, single-quoted literals AND dollar-quoted bodies stripped. Needed for
 * the transaction-control detector only: `begin`/`end` are also plpgsql block
 * keywords, and every function body in this repo lives inside `$$ … $$`.
 */
function stripForTransactionDetection(sql: string): string {
  let s = stripForDetection(sql);
  s = s.replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1?\$/g, " '' ");
  s = s.replace(/'(?:[^']|'')*'/g, " '' ");
  return s;
}

/** Mirror of the aidream runner's `_find_self_ledgering` write pattern. */
const SELF_LEDGER_RE =
  /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE(?:\s+TABLE)?|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE)\s+(?:public\.)?_schema_migrations\b/i;

/** Mirror of the aidream runner's `_RE_NEEDS_AUTOCOMMIT`. */
const NEEDS_AUTOCOMMIT_RE =
  /\b(?:CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY|REINDEX\s+\w+\s+CONCURRENTLY|DROP\s+INDEX\s+CONCURRENTLY|VACUUM\b|ALTER\s+TYPE\s+\S+\s+ADD\s+VALUE)\b/i;

/**
 * Transaction control at statement level. On the old PostgREST transport a file
 * carrying `BEGIN;`/`COMMIT;` was refused by Postgres itself with a bare `0A000`
 * and no remedy; on a direct connection it is WORSE than an error, because the
 * file's `COMMIT` would end THIS runner's transaction early and run the rest of
 * the file — and the ledger row — outside it. So it is refused here, by name,
 * with the remedy.
 */
const TXN_CONTROL_RE =
  /(?:^|;)\s*(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK|END\s+(?:TRANSACTION|WORK))\b/i;

const SKIP_MARKER = /^\s*--\s*migrate\s*:\s*skip(?:\s*:\s*(.+))?\s*$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const PG_INTERVAL_RE = /^\d+(?:\.\d+)?\s*(?:us|ms|s|min|h|d|)$/i;

function skipReason(sql: string): string | null {
  for (const line of sql.split("\n", 25)) {
    const m = line.match(SKIP_MARKER);
    if (m) return (m[1] ?? "").trim();
  }
  return null;
}

interface DbEnv {
  readonly user: string;
  readonly password: string;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  /** Where the five variables came from, so the operator is never guessing. */
  readonly from: string;
}

const DB_VARS = [
  "SUPABASE_MATRIX_USER",
  "SUPABASE_MATRIX_PASSWORD",
  "SUPABASE_MATRIX_HOST",
  "SUPABASE_MATRIX_PORT",
  "SUPABASE_MATRIX_DATABASE_NAME",
] as const;

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]!] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
  }
  return out;
}

/**
 * The five connection variables. This repo's env files first; the aidream
 * checkout's `.env` second — the same fallback `scripts/hr/*.py` already use,
 * except that this one SAYS SO on every run instead of reaching across silently.
 */
function loadDbEnv(): DbEnv | { missing: string[]; looked: string[] } {
  const looked: string[] = [];
  const tryBag = (bag: Record<string, string | undefined>, from: string): DbEnv | null => {
    const missing = DB_VARS.filter((k) => !bag[k]);
    if (missing.length) return null;
    return {
      user: bag.SUPABASE_MATRIX_USER!,
      password: bag.SUPABASE_MATRIX_PASSWORD!,
      host: bag.SUPABASE_MATRIX_HOST!,
      port: Number(bag.SUPABASE_MATRIX_PORT!),
      database: bag.SUPABASE_MATRIX_DATABASE_NAME!,
      from,
    };
  };

  const fromProcess = tryBag(process.env, "the environment");
  if (fromProcess) return fromProcess;

  const candidates = [
    resolve(ROOT, ".env.local"),
    resolve(ROOT, ".env.production.local"),
    resolve(ROOT, ".env.production"),
    resolve(ROOT, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    looked.push(relative(ROOT, path));
    const hit = tryBag(parseEnvFile(path), relative(ROOT, path));
    if (hit) return hit;
  }
  return { missing: [...DB_VARS], looked };
}

interface PgError extends Error {
  code?: string;
  detail?: string;
  hint?: string;
  position?: string;
  where?: string;
}

function isPgError(e: unknown): e is PgError {
  return e instanceof Error && typeof (e as PgError).code === "string";
}

/** Turn a Postgres 1-based character `position` into `line N, column M` of the file. */
function locate(sql: string, position: string | undefined): string | null {
  const idx = Number(position);
  if (!Number.isFinite(idx) || idx < 1) return null;
  const before = sql.slice(0, idx - 1);
  const line = before.split("\n").length;
  const col = idx - (before.lastIndexOf("\n") + 1);
  const text = (sql.split("\n")[line - 1] ?? "").trim();
  return `at line ${line}, column ${col}${text ? `:  ${text.slice(0, 160)}` : ""}`;
}

/** The verbatim Postgres error, plus where in the migration file it happened. */
function formatPgError(err: unknown, sql?: string): string {
  if (!isPgError(err)) return String(err instanceof Error ? err.message : err);
  const parts = [
    `SQLSTATE ${err.code}`,
    err.message,
    err.detail ? `DETAIL: ${err.detail}` : "",
    err.hint ? `HINT: ${err.hint}` : "",
    err.where ? `CONTEXT: ${err.where}` : "",
    sql && err.position ? (locate(sql, err.position) ?? "") : "",
  ].filter(Boolean);
  return parts.join("\n");
}

class PoolerRoleContamination extends Error {}

/**
 * Open the connection and prove we are acting as OURSELVES.
 *
 * Supavisor pools in TRANSACTION mode, so a statement can land on a server
 * connection another client left with a non-LOCAL `SET ROLE` in effect — the
 * defect aidream's `db/pooler_session.py` documents (a privilege error read as
 * absence rewrote MIGRATIONS_STATUS.md with 29 applied migrations recorded as
 * missing). An explicit transaction IS pinned to one server connection, so the
 * unit of protection is: BEGIN, RESET ROLE, verify `current_user = session_user`,
 * and only then run the work.
 */
async function connect(env: DbEnv): Promise<pg.Client> {
  const client = new pg.Client({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    application_name: "matrx-frontend db:apply",
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  return client;
}

/**
 * BEGIN a transaction pinned to a session running as us, AND prove that us is
 * the role the database's DDL guards actually fire for.
 *
 * The second half is not paranoia (V-36, 2026-09-12): under a plain
 * `SET ROLE service_role` or `authenticated`, NO platform event trigger fires —
 * not even a SECURITY INVOKER one. So a migration applied from a session that is
 * not the ledger's owning role would run with the §6d-4 door guard, the registry
 * sentinels and `ddl_guard` all silently absent, which is exactly the fifteen-day
 * blind spot DD-151 was. Being connected is not enough; being POSTGRES is.
 */
async function beginClean(client: pg.Client): Promise<void> {
  let last = "";
  for (let attempt = 1; attempt <= POOLER_ATTEMPTS; attempt += 1) {
    await client.query("begin");
    await client.query("reset role");
    const who = await client.query<{
      cur: string;
      sess: string;
      ledger_owner: string | null;
    }>(
      `select current_user::text as cur, session_user::text as sess,
              (select r.rolname::text
                 from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                 join pg_roles r on r.oid = c.relowner
                where n.nspname = 'public' and c.relname = '_schema_migrations') as ledger_owner`,
    );
    const { cur, sess, ledger_owner: owner } = who.rows[0]!;
    if (cur !== sess) {
      last = `pinned as '${cur}' (login role '${sess}')`;
      await client.query("rollback");
      continue;
    }
    if (owner === null) {
      await client.query("rollback");
      throw new Error(
        `public._schema_migrations does not exist on this database — refusing to apply anything.`,
      );
    }
    if (cur !== owner) {
      await client.query("rollback");
      throw new Error(
        `This connection is '${cur}', but the migration ledger is owned by '${owner}'.\n` +
          `  Refusing. Measured 2026-09-12 (V-36): under any other role — service_role and\n` +
          `  authenticated included — NO platform event trigger fires, not even a SECURITY INVOKER\n` +
          `  one. A migration applied from such a session runs with the §6d-4 client-grant door\n` +
          `  guard, both registry sentinels and ddl_guard all silently absent, and nothing says so.\n` +
          `  Point SUPABASE_MATRIX_USER at the '${owner}' role and re-run.`,
      );
    }
    return;
  }
  throw new PoolerRoleContamination(
    `The pooler kept handing back a session running as someone else (${last}) after ` +
      `${POOLER_ATTEMPTS} attempts, and RESET ROLE did not clear it. Nothing was applied. ` +
      `Anything such a session could not see would be a PRIVILEGE failure, not absence.`,
  );
}

async function ledgerRow(
  client: pg.Client,
  filename: string,
): Promise<{ checksum: string; applied_at: string } | null> {
  const out = await client.query<{ checksum: string; applied_at: string }>(
    `select checksum, applied_at::text as applied_at from public._schema_migrations
       where source = $1 and filename = $2`,
    [SOURCE, filename],
  );
  return out.rows[0] ?? null;
}

function usage(): void {
  console.log(
    `${C.bold}pnpm db:apply <migrations/file.sql> [--dry-run] [--reapply] [--statement-timeout=10min]${C.reset}\n` +
      `  pnpm db:apply --self-test          prove RED/GREEN against the live database\n` +
      `  Applies the WHOLE file in one transaction on a direct Postgres connection and\n` +
      `  ledgers the SHA-256 of the bytes it executed. The only sanctioned apply path\n` +
      `  for matrx-frontend migrations (see CLAUDE.md § Migrations).`,
  );
}

interface ApplyOpts {
  dryRun: boolean;
  reapply: boolean;
  statementTimeout: string;
}

/** Apply ONE file. The whole of db:apply lives here so --self-test exercises
 *  exactly the code an agent runs, not a paraphrase of it. */
async function applyFile(path: string, opts: ApplyOpts): Promise<number> {
  const { dryRun, reapply, statementTimeout } = opts;
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
  const txn = stripForTransactionDetection(sql).match(TXN_CONTROL_RE);
  if (txn) {
    console.error(
      `${TAG.fail}${filename} carries its own ${txn[1]!.toUpperCase()}.\n` +
        `  This runner owns the transaction: it opens one, runs the whole file inside it, writes\n` +
        `  the ledger row in the same transaction and commits once. A COMMIT inside the file would\n` +
        `  end that transaction early, so the rest of the file — and the ledger row — would land\n` +
        `  outside it and a later failure could no longer roll anything back.\n` +
        `  Delete the BEGIN/COMMIT lines from the file and re-run db:apply.`,
    );
    return 1;
  }
  if (NEEDS_AUTOCOMMIT_RE.test(stripped)) {
    console.error(
      `${TAG.fail}${filename} contains a statement that cannot run inside a transaction\n` +
        `  (CREATE/DROP INDEX CONCURRENTLY, REINDEX CONCURRENTLY, VACUUM, or ALTER TYPE ... ADD VALUE).\n` +
        `  This runner is transactional, so applying it here would fail halfway. Apply it from\n` +
        `  the aidream checkout, which runs such files in autocommit and owns the same ledger:\n` +
        `      python db/apply_migrations.py --source ${SOURCE} --only ${filename}`,
    );
    return 1;
  }

  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${TAG.fail}No direct database connection — need ${DB_VARS.join(", ")}\n` +
        `  in the environment or in one of: ${env.looked.join(", ") || "(no env file found)"}, ` +
        `../aidream/.env.\n` +
        `  Nothing was applied. There is no weaker fallback path: the PostgREST door this runner\n` +
        `  used until 2026-09-12 could not run a migration longer than 8 seconds and was deleted.`,
    );
    return 2;
  }

  console.log(
    `${C.bold}db:apply${C.reset} ${C.white}${filename}${C.reset} ` +
      `${C.dim}(${Buffer.byteLength(sql, "utf8")} bytes, sha256 ${checksum})${C.reset}`,
  );
  console.log(
    `${TAG.info}${env.user}@${env.host}:${env.port}/${env.database} ` +
      `${C.dim}(credentials from ${env.from}; lock_timeout ${LOCK_TIMEOUT}, ` +
      `statement_timeout ${statementTimeout})${C.reset}`,
  );

  let client: pg.Client;
  try {
    client = await connect(env);
  } catch (err) {
    console.error(
      `${TAG.fail}Could not open the database connection — nothing was applied.\n` +
        `${C.red}${formatPgError(err)}${C.reset}`,
    );
    return 2;
  }

  try {
    const existing = await ledgerRow(client, filename).catch((err: unknown) => {
      console.error(`${TAG.fail}Could not read the ledger — ${formatPgError(err)}`);
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

    // The prologue and the ledger upsert are their own statements so the FILE is
    // a payload of exactly its own bytes — which is what makes a Postgres error
    // `position` point at a line in the file.
    const prologue =
      `set local lock_timeout = '${LOCK_TIMEOUT}';\n` +
      `set local statement_timeout = '${statementTimeout}';\n` +
      `select set_config('matrx.db_apply_t0', clock_timestamp()::text, true);`;
    const ledgerUpsert =
      `insert into public._schema_migrations (source, filename, checksum, duration_ms)\n` +
      `values (${lit(SOURCE)}, ${lit(filename)}, ${lit(checksum)},\n` +
      `        greatest(1, (extract(epoch from clock_timestamp()\n` +
      `                     - current_setting('matrx.db_apply_t0')::timestamptz) * 1000)::int))\n` +
      `on conflict (source, filename) do update set\n` +
      `  checksum = excluded.checksum, applied_at = now(), duration_ms = excluded.duration_ms;`;

    if (dryRun) {
      console.log(`${TAG.info}--dry-run — nothing was sent. Exactly what would run, in ONE transaction:`);
      console.log(`${C.dim}${"─".repeat(72)}${C.reset}`);
      console.log(`begin;\nreset role;  -- + current_user = session_user check\n${prologue}`);
      console.log(`${C.dim}-- ↓ the file, verbatim, as one call ↓${C.reset}`);
      console.log(sql);
      console.log(`${ledgerUpsert}\ncommit;`);
      console.log(`${C.dim}${"─".repeat(72)}${C.reset}`);
      console.log(
        `${TAG.info}Ledger row it would write: source=${SOURCE} filename=${filename} ` +
          `checksum=${checksum}`,
      );
      return 0;
    }

    const t0 = Date.now();
    try {
      await beginClean(client);
      await client.query(prologue);
      await client.query(sql);
      await client.query(ledgerUpsert);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      console.error(
        `${TAG.fail}${filename} FAILED — the transaction was rolled back, nothing was applied ` +
          `and no ledger row was written.`,
      );
      console.error(`${C.red}${formatPgError(err, sql)}${C.reset}`);
      return 1;
    }
    const elapsed = Date.now() - t0;

    // Proof, not assumption: re-read the row and compare it to what we hashed.
    const after = await ledgerRow(client, filename).catch(() => null);
    if (!after) {
      console.error(
        `${TAG.fail}${filename} committed but no ledger row is present. Do not re-run blindly — ` +
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
        `${C.dim}(${elapsed} ms, applied_at ${after.applied_at})${C.reset}`,
    );
    console.log(
      `${TAG.info}Next: ${C.white}pnpm db-types${C.reset} if this changed a table shape, then ` +
        `${C.white}pnpm check:migrations${C.reset}.`,
    );
    return 0;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * `pnpm db:apply --self-test` — the forcing test for this applier, run against
 * the REAL database with a throwaway schema. It is the only thing that can prove
 * the properties everything else here rests on, and it proves them by making
 * them FAIL first:
 *
 *   RED   a file whose LAST statement errors → exit 1, NO ledger row, and none of
 *         the earlier statements survive (so the runner is still ONE transaction;
 *         if that ever stops being true, this is what screams).
 *   GREEN the same file with the error removed → exit 0, ledger checksum equals
 *         the SHA-256 of the bytes on disk, and the TRAILING statement is live in
 *         the database (the exact statement class the hand-apply path dropped).
 *
 * The file body also asserts, from inside the transaction, that `lock_timeout`
 * and `statement_timeout` are the values this runner promised — the second one
 * is what the deleted PostgREST door could never deliver (DD-149).
 *
 * Cleans up after itself: drops the scratch schema, deletes its ledger row, and
 * removes the scratch file — in a finally, so a failure still leaves nothing behind.
 */
const SELFTEST_FILE = "zz_db_apply_selftest.sql";
const SELFTEST_SCHEMA = "zz_db_apply_selftest";

async function selfTest(statementTimeout: string): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${TAG.fail}db:apply --self-test needs ${DB_VARS.join(", ")}. ` +
        `Refusing to report a pass it did not measure.`,
    );
    return 2;
  }
  const path = resolve(MIGRATIONS_DIR, SELFTEST_FILE);
  const body =
    `create schema if not exists ${SELFTEST_SCHEMA};\n` +
    // Deliberately inside the file executed through applyFile, after its
    // prologue. These go red if this runner ever drifts from what it promises.
    `do $$ begin\n` +
    `  if current_setting('lock_timeout') <> '2s' then\n` +
    `    raise exception 'db:apply lock_timeout must be 2s, got %', current_setting('lock_timeout');\n` +
    `  end if;\n` +
    `  if current_setting('statement_timeout') = '8s' or current_setting('statement_timeout') = '0' then\n` +
    `    raise exception 'db:apply statement_timeout is not the one it promised: %', current_setting('statement_timeout');\n` +
    `  end if;\n` +
    `end $$;\n` +
    // The property the PostgREST door could not have: a statement longer than
    // its 8.2s hard ceiling, measured live 2026-09-12 (DD-149).
    `select pg_sleep(10);\n` +
    `create table ${SELFTEST_SCHEMA}.landed (id int primary key, note text);\n` +
    `insert into ${SELFTEST_SCHEMA}.landed (id, note) values (1, 'first statement');\n`;
  const trailing =
    `comment on table ${SELFTEST_SCHEMA}.landed is 'trailing statement — the class the hand-apply path dropped';\n`;
  let failures = 0;

  const client = await connect(env);
  const state = async () =>
    (
      await client.query<Record<string, unknown>>(
        `select (select count(*)::int from public._schema_migrations
                   where source = ${lit(SOURCE)} and filename = ${lit(SELFTEST_FILE)}) as ledger_rows,
                (select count(*)::int from information_schema.schemata
                   where schema_name = ${lit(SELFTEST_SCHEMA)}) as schema_present,
                (select checksum from public._schema_migrations
                   where source = ${lit(SOURCE)} and filename = ${lit(SELFTEST_FILE)}) as checksum,
                (select obj_description(c.oid) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = ${lit(SELFTEST_SCHEMA)} and c.relname = 'landed') as trailing_comment`,
      )
    ).rows[0]!;

  const fail = (what: string) => {
    failures += 1;
    console.error(`${TAG.fail}self-test: ${what}`);
  };
  const opts: ApplyOpts = { dryRun: false, reapply: false, statementTimeout };

  try {
    // ── RED ──────────────────────────────────────────────────────────────────
    writeFileSync(
      path,
      `${body}create table ${SELFTEST_SCHEMA}.never (id int, bogus zz_no_such_type);\n`,
      "utf8",
    );
    console.log(`${C.bold}self-test RED${C.reset} ${C.dim}(last statement errors)${C.reset}`);
    const redCode = await applyFile(path, opts);
    const red = await state();
    if (redCode !== 1) fail(`a failing migration exited ${redCode}, expected 1`);
    if (red.ledger_rows !== 0) fail(`a failing migration wrote ${red.ledger_rows} ledger row(s)`);
    if (red.schema_present !== 0)
      fail(`statements before the error survived — the applier is NOT one transaction`);
    if (failures === 0)
      console.log(`${TAG.ok}RED proven: exit 1, no ledger row, nothing partially applied`);

    // ── GREEN ────────────────────────────────────────────────────────────────
    writeFileSync(path, body + trailing, "utf8");
    const expected = sha256(readFileSync(path, "utf8"));
    console.log(`${C.bold}self-test GREEN${C.reset} ${C.dim}(same file, error removed)${C.reset}`);
    const greenCode = await applyFile(path, opts);
    const green = await state();
    if (greenCode !== 0) fail(`a valid migration exited ${greenCode}, expected 0`);
    if (green.checksum !== expected)
      fail(`ledger checksum ${String(green.checksum)} != sha256 of the executed bytes ${expected}`);
    if (!green.trailing_comment)
      fail(`the TRAILING statement did not land — the dropped-statement class is back`);
    if (failures === 0)
      console.log(
        `${TAG.ok}GREEN proven: a 10s statement ran (the deleted door died at 8.2s), the ledger ` +
          `checksum == sha256(${expected.slice(0, 12)}…) and the trailing statement is live`,
      );
  } finally {
    await client
      .query(
        `drop schema if exists ${SELFTEST_SCHEMA} cascade;
         delete from public._schema_migrations where source = ${lit(SOURCE)} and filename = ${lit(SELFTEST_FILE)};`,
      )
      .catch((err: unknown) =>
        console.error(
          `${TAG.fail}self-test cleanup FAILED — remove schema ${SELFTEST_SCHEMA} and the ` +
            `${SELFTEST_FILE} ledger row by hand: ${formatPgError(err)}`,
        ),
      );
    await client.end().catch(() => undefined);
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

  let statementTimeout = STATEMENT_TIMEOUT;
  const timeoutArg = argv.find((a) => a.startsWith("--statement-timeout="));
  if (timeoutArg) {
    const value = timeoutArg.slice("--statement-timeout=".length).trim();
    if (!PG_INTERVAL_RE.test(value)) {
      console.error(
        `${TAG.fail}--statement-timeout=${value} is not a Postgres timeout value ` +
          `(e.g. 90s, 10min, 1h, or 0 for no limit). Refusing rather than sending something ` +
          `the server would reject halfway through a migration.`,
      );
      return 1;
    }
    statementTimeout = value;
  }

  if (argv.includes("--self-test")) return selfTest(statementTimeout);
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
  return applyFile(path, { dryRun, reapply, statementTimeout });
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}db:apply — unexpected error:${C.reset}`, err);
    process.exit(2);
  },
);

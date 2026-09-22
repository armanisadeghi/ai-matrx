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
 *   pnpm db:based-on <schema.fn|file.sql>       print the `-- based-on:` header
 *                                               line(s) a replace must carry
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
 *   - 🚨 a `-- retired: <why>` file: frozen history the live database has moved past.
 *     An already-ledgered file is never re-judged — that is what makes `--reapply` work —
 *     so the OLD body it carries would execute verbatim and revert whatever replaced it,
 *     with every check green. `migrations/cvx_list_scoped_audience.sql` held the
 *     pre-`chat.conversation_lane` `public.cvx_audience` exactly that way. Refused at every
 *     target, on every path: `--reapply` is not a key for it, `--dry-run` does not soften
 *     it, and it is read BEFORE the header checks so a confirmed `-- chair-step:` never
 *     reaches it. The one remedy is a NEW migration, judged and ledgered on its own bytes.
 *   - a ledger row with a different checksum, without --reapply
 *   - absent connection credentials (never a quiet downgrade to a weaker path)
 *   - 🚨 DD-220: a file that REPLACES a function body already live without saying
 *     which body it was written against, or saying so with a hash the catalogue
 *     no longer holds. `CREATE OR REPLACE FUNCTION` is a whole-body write with no
 *     concurrency check, so a migration composed from a stale `pg_get_functiondef`
 *     dump silently reverts every change another lane made in between — that is
 *     how `billing.plan_status` answered every signed-in caller with 42883 for
 *     3m21s on 2026-09-14. The file declares the body it saw:
 *         -- based-on: billing.plan_status(uuid) <sha256 of pg_get_functiondef>
 *     generated by `pnpm db:based-on billing.plan_status` (or, for a whole file,
 *     `pnpm db:based-on migrations/<file>.sql`) and re-verified against the live
 *     catalogue immediately before the file executes. A NEW function needs no
 *     line, and an already-ledgered file is never re-judged — its bytes are
 *     frozen history, so `--reapply` still works. The scan reads the WHOLE file,
 *     so a `DO $$ … EXECUTE 'create or replace function …' … $$;` is judged the
 *     same as a written-out statement (V-84: stripping dollar bodies made that
 *     shape invisible, and it is live in this repo's own migrations).
 *     See scripts/migration-based-on.ts.
 *
 * Exit codes: 0 applied (or already applied, byte-identical) · 1 refusal or SQL
 * failure · 2 unexpected error / creds absent.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connectDirect, DB_VARS, loadDbEnv, type DbEnv } from "./lib/direct-db";
import {
  assertConfiguredHostMatchesTarget,
  assertGuardResolvesOff,
  assertHeaderAgreesWithFlag,
  assertServerMatchesTarget,
  loadBranchDbEnv,
  loadBranchRef,
  type BranchRef,
  INVERSE_DIRNAME,
  parseTargetFlag,
  readHeader,
  REHEARSAL_DIRNAME,
  CAMPAIGN_DIRNAME,
  CAMPAIGN_SOURCE,
  JUDGMENT_CORPUS_DIRNAME,
  TARGETS,
  basedOnFunctionNames,
  branchRefOverride,
  TargetRefusal,
  type Target,
} from "./lib/migration-target";
import { confirmChairStep } from "./lib/chair-step";
import { basedOnCheck, findReplaceOccurrences, type Query } from "./migration-based-on";
import { judgeTexts as judgeKernelPairing } from "./check-kernel-rerecord-pairing";

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

/**
 * Comments stripped and NOTHING ELSE. This is the JUDGE's input (the allow-list,
 * the deny-list, the guard reader, the custom-data reader in
 * `scripts/lib/migration-target.ts`), which documents its parameter as a
 * "comment-stripped body" and does its own dollar-quote-aware statement splitting
 * inside. It is NOT a statement detector — see `stripForStatementDetection`.
 */
function stripForDetection(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** One pass over the bytes: comment, single-quoted literal, quoted identifier, dollar tag. */
const DETECT_TOKEN_SOURCE =
  "--[^\\n]*|/\\*|'(?:[^']|'')*'|\"(?:[^\"]|\"\")*\"|\\$[A-Za-z_0-9\\u0080-\\uFFFF]*\\$";

/**
 * 🚨 THE ONE STATEMENT-DETECTION STRIPPER. Every "does this file CONTAIN statement
 * X" question in this runner is asked of THIS text, never of the raw bytes and never
 * of comment-only-stripped text.
 *
 * WHY (measured 2026-09-17): `NEEDS_AUTOCOMMIT_RE` was tested against
 * `stripForDetection` output, so the words `CREATE INDEX CONCURRENTLY` written inside
 * a function's own HINT string — `raise exception … using hint = 'create the index
 * with CREATE INDEX CONCURRENTLY'`, itself inside a `$$ … $$` body — made this runner
 * refuse a file that needs no autocommit at all and send its author to the other
 * runner for nothing. The transaction-control detector already stripped bodies and
 * literals; the self-ledger and autocommit detectors did not. A detector that reads
 * prose as DDL is the class, not the instance: the fix is that there is ONE stripper
 * and all three use it.
 *
 * What it removes: line and block comments, single-quoted literals, and the body of
 * every dollar-quoted string (`$$ … $$`, `$tag$ … $tag$`) — a function body, a DO
 * block's body, a quoted default. What it KEEPS: quoted identifiers (`"custom.record"`
 * is a name, not text), and everything that is actual SQL. One left-to-right pass, so
 * a `--` inside a literal is not a comment and a `'` inside a comment does not open a
 * string; the old two-regex form got both of those wrong.
 *
 * A dollar body can hold DDL that a `DO` block really does execute. That is not a hole
 * here: such DDL is built at run time from a string, so no textual detector could read
 * it either way, and `CREATE INDEX CONCURRENTLY` inside a `DO` block fails in Postgres
 * whatever transaction this runner opens. The judge refuses run-time-built DDL by name
 * (`a6-10-do-block.sql`).
 */
function stripForStatementDetection(sql: string): string {
  const re = new RegExp(DETECT_TOKEN_SOURCE, "g");
  let out = "";
  let i = 0;
  while (i < sql.length) {
    re.lastIndex = i;
    const m = re.exec(sql);
    if (!m) {
      out += sql.slice(i);
      break;
    }
    out += sql.slice(i, m.index);
    const tok = m[0];
    if (tok.startsWith("--")) {
      out += " ";
      i = m.index + tok.length;
    } else if (tok === "/*") {
      const end = sql.indexOf("*/", m.index + 2);
      out += " ";
      i = end === -1 ? sql.length : end + 2;
    } else if (tok.startsWith("'")) {
      out += " '' ";
      i = m.index + tok.length;
    } else if (tok.startsWith('"')) {
      out += tok;
      i = m.index + tok.length;
    } else {
      const close = sql.indexOf(tok, m.index + tok.length);
      out += " '' ";
      i = close === -1 ? sql.length : close + tok.length;
    }
  }
  return out;
}

/**
 * The three file-level statement facts, read ONCE off the one stripped text: does the
 * file write the ledger itself, does it carry its own transaction control, does it need
 * an autocommit session. `--judge-only` prints them so the conformance corpus can hold
 * both runners to the same answer — the apply path is the only place they refuse.
 */
interface StatementFacts {
  readonly selfLedger: boolean;
  readonly txnControl: string | null;
  readonly autocommit: boolean;
}

function statementFacts(sql: string): StatementFacts {
  const s = stripForStatementDetection(sql);
  const txn = s.match(TXN_CONTROL_RE);
  return {
    selfLedger: SELF_LEDGER_RE.test(s),
    txnControl: txn ? txn[1]!.toUpperCase() : null,
    autocommit: NEEDS_AUTOCOMMIT_RE.test(s),
  };
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
/**
 * 🚨 `-- retired: <why>` — THE FILE IS FROZEN HISTORY AND ITS BYTES MUST NEVER RUN AGAIN.
 *
 * WHY (the door this closes, 2026-09-20): an already-ledgered file is never re-judged —
 * its bytes are frozen history, which is what makes `--reapply` work at all (see the
 * DD-220 note in this file's header). But "frozen history" cuts both ways: a file that
 * REPLACED a function body which has since been replaced again still carries the OLD
 * body, and `--reapply` executes exactly those bytes against the one live database. That
 * is the `billing.plan_status` class in reverse — not a stale `-- based-on:` hash, but a
 * correct file whose whole content is superseded. `migrations/cvx_list_scoped_audience.sql`
 * carried the pre-`chat.conversation_lane` `public.cvx_audience`; re-running it would have
 * silently reverted the live classification rule with every check green.
 *
 * A reason is REQUIRED (there is no bare form) and it names what superseded the file, so
 * the refusal can hand the next lane the file that is actually current.
 */
const RETIRED_MARKER = /^\s*--\s*retired\s*:\s*(.+?)\s*$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const PG_INTERVAL_RE = /^\d+(?:\.\d+)?\s*(?:us|ms|s|min|h|d|)$/i;

function skipReason(sql: string): string | null {
  for (const line of sql.split("\n", 25)) {
    const m = line.match(SKIP_MARKER);
    if (m) return (m[1] ?? "").trim();
  }
  return null;
}

/** The `-- retired:` reason, or null. Same 25-line header window as `-- migrate: skip`. */
function retiredReason(sql: string): string | null {
  for (const line of sql.split("\n", 25)) {
    const m = line.match(RETIRED_MARKER);
    if (m) return (m[1] ?? "").trim();
  }
  return null;
}

/**
 * The five `SUPABASE_MATRIX_*` variables and the connection they open now live
 * in `scripts/lib/direct-db.ts`, because `pnpm db:based-on` and the DD-220 arm of
 * `pnpm check:migrations` need the identical loader — a second copy would be a
 * second place for the env-file order to drift.
 */

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
  // 🚨 NOTHING FAILS SILENTLY. Every DDL guard on this database speaks through
  // `RAISE WARNING` / `RAISE NOTICE` — the §6d-4 door guard's "THE GRANT DID NOT
  // STICK" sentence, DD-202's "EXECUTE for PUBLIC and anon was REVOKED", the
  // lock-timeout guard's bound. Until 2026-09-13 this runner discarded all of
  // them, so the one message db-rules FEATURE.md promises you "will see,
  // verbatim" reached nobody on the one sanctioned apply path. Print them.
  return connectDirect(env, "matrx-frontend db:apply", (n) => {
    const severity = (n.severity ?? "NOTICE").toUpperCase();
    const colour = severity.startsWith("W") ? C.yellow : C.dim;
    console.log(`${colour}[${severity}]${C.reset} ${n.message ?? ""}`);
    if (n.hint) console.log(`${C.dim}        hint: ${n.hint}${C.reset}`);
  });
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
): Promise<{ checksum: string; applied_at: string; chair_step: string | null } | null> {
  const out = await client.query<{ checksum: string; applied_at: string; chair_step: string | null }>(
    `select checksum, applied_at::text as applied_at,
            (to_jsonb(m) ->> 'chair_step') as chair_step
       from public._schema_migrations m
       where source = $1 and filename = $2`,
    [SOURCE, filename],
  );
  return out.rows[0] ?? null;
}


/**
 * A CAMPAIGN FILE MAY LAND ON THE MAIN DATABASE BEHIND ITS OWN LANE LOCK.
 *
 * 🚨 THE REHEARSAL COPY IS NOT A GATE (owner ruling, 2026-09-18: *"we have no
 * production. It's all just dev… All of your work should just go live"*). Until
 * then this function ALSO demanded a `public._schema_migrations` row on the branch
 * for the same basename with a byte-identical checksum, and refused the apply
 * without one. That gate is GONE: the rehearsal copy is a fast scratch run to catch
 * syntax errors, never a precondition. A file may be applied to the main database
 * with no prior rehearsal ledger row and no matching rehearsal checksum.
 *
 * Nothing about the STATEMENTS moved. The additive allow-list, the guard-read rule,
 * the named-by-the-command (chair-step) class and the `-- based-on:` hash check —
 * which is recomputed against THE DATABASE BEING APPLIED TO, immediately before the
 * file executes — all still judge every campaign file exactly as before.
 *
 * What remains here is the LANE LOCK: a `campaign_watch.build_lock` row on the
 * branch whose `held_by` is this `--lane`. It is concurrency control between lanes
 * (§4.14 — two lanes never land on one object at once), not a rehearsal claim, so it
 * stays. Read-only on the branch; opens and closes its own connection; refuses on
 * any error rather than assuming.
 */
async function assertCampaignProductionIsAuthorised(
  filename: string,
  checksum: string,
  lane: string,
  branchRef: BranchRef,
): Promise<string | null> {
  let branchEnv;
  try {
    branchEnv = loadBranchDbEnv(ROOT, branchRef);
  } catch (err) {
    return err instanceof TargetRefusal
      ? err.message
      : `could not read the rehearsal branch's connection: ${String(err)}`;
  }
  const branch = new pg.Client({
    host: branchEnv.host,
    port: branchEnv.port,
    user: branchEnv.user,
    password: branchEnv.password,
    database: branchEnv.database,
    ssl: { rejectUnauthorized: false },
    application_name: "db:apply (campaign authorisation, read only)",
  });
  try {
    await branch.connect();
    // The rehearsal row is read for INFORMATION ONLY — never to refuse. See the header.
    const rehearsal = await branch.query<{ checksum: string; applied_at: string }>(
      `select checksum, applied_at::text as applied_at from public._schema_migrations
         where source = $1 and filename = $2`,
      [SOURCE, filename],
    );
    const row = rehearsal.rows[0];
    const rehearsalNote = !row
      ? `${C.dim}not rehearsed on the copy — applying straight to the main database${C.reset}`
      : row.checksum !== checksum
        ? `${C.dim}rehearsed ${row.applied_at} with DIFFERENT bytes (copy ${row.checksum.slice(0, 12)}, ` +
          `this file ${checksum.slice(0, 12)}) — the copy is not a gate${C.reset}`
        : `${C.dim}rehearsed on the copy at ${row.applied_at}, byte-identical${C.reset}`;
    const lock = await branch.query<{ held_by: string; taken_at: string; lock_name: string }>(
      `select lock_name, held_by, taken_at::text as taken_at from campaign_watch.build_lock
         where held_by = $1`,
      [lane],
    );
    if (lock.rows.length === 0) {
      const anyLock = await branch.query<{ lock_name: string; held_by: string }>(
        `select lock_name, held_by from campaign_watch.build_lock order by lock_name`,
      );
      return (
        `lane ${lane} holds NO campaign_watch.build_lock row on the branch ${branchRef.branchRef}.\n` +
        `  §4.14: the production apply happens WHILE the lane holds its object lock, so two lanes\n` +
        `  never land on the same object at once and a lane that failed cannot land at all.\n` +
        (anyLock.rows.length
          ? `  Held right now: ${anyLock.rows.map((r) => `${r.lock_name} by ${r.held_by}`).join(", ")}.\n`
          : `  No lock is held by anybody right now.\n`) +
        `  Take yours on the BRANCH first:\n` +
        `    insert into campaign_watch.build_lock (lock_name, held_by, note)\n` +
        `    values ('<custom|platform|iam>', '${lane}', '<what for>')\n` +
        `    on conflict (lock_name) do nothing returning lock_name, held_by, taken_at;`
      );
    }
    console.log(
      `${TAG.ok}campaign authorisation ${C.dim}— lock ${lock.rows.map((r) => r.lock_name).join(", ")} ` +
        `held by ${lane} since ${lock.rows[0]!.taken_at}; ${rehearsalNote}${C.reset}`,
    );
    return null;
  } catch (err) {
    return (
      `the campaign authorisation could not be READ on the branch, so it is refused rather than\n` +
      `  assumed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    await branch.end().catch(() => {});
  }
}

function usage(): void {
  console.log(
    `${C.bold}pnpm db:apply <migrations/file.sql> [--target branch|production] [--dry-run] [--reapply] [--statement-timeout=10min] [--confirm-chair-step <file.sql>]${C.reset}\n` +
      `  pnpm db:apply migrations/${CAMPAIGN_DIRNAME}/<file>.sql --source ${CAMPAIGN_SOURCE} --target branch|production --lane <lane>\n` +
      `                                     the ONLY route into migrations/${CAMPAIGN_DIRNAME}/, which no\n` +
      `                                     release path, sweep, CI job or scheduled job scans\n` +
      `  pnpm db:apply --self-test          prove RED/GREEN against the live database\n` +
      `  pnpm db:apply --target-self-test   prove the --target refusal RED/GREEN on the rehearsal branch\n` +
      `  --pair <file.sql>                  a sibling file of THIS apply; the only thing it can do is\n` +
      `                                     carry the iam.entity_read_kernel_expected() re-record a\n` +
      `                                     file replacing an access-kernel body must land with\n` +
      `  --target defaults to production, so every file written before --target existed behaves\n` +
      `  exactly as it did. --target branch needs the file to be headed \`-- target: branch\`.\n` +
      `  Applies the WHOLE file in one transaction on a direct Postgres connection and\n` +
      `  ledgers the SHA-256 of the bytes it executed. The only sanctioned apply path\n` +
      `  for matrx-frontend migrations (see CLAUDE.md § Migrations).`,
  );
}

interface ApplyOpts {
  dryRun: boolean;
  reapply: boolean;
  statementTimeout: string;
  /** WHICH database this file may land on. Default `production` — see lib/migration-target.ts. */
  target: Target;
  /** `--source campaign` — the ONE route into `migrations/campaign/`. */
  campaignSource: boolean;
  /** `--lane <id>` — whose `campaign_watch.build_lock` row authorises a production apply. */
  lane: string | null;
  /** `--branch-ref=<path>` / MATRX_BRANCH_REF — the override a throwaway worktree needs. */
  branchRefPath?: string;
  /** `--confirm-chair-step <file>` — the basenames this command NAMED. A chair step at
   *  `--target production` runs only when its own basename is here (scripts/lib/chair-step.ts). */
  confirmedChairSteps?: readonly string[];
  /** `--pair <file.sql>` — sibling file(s) of THIS apply whose bytes carry the D249
   *  re-record. Judged together with the file being applied; see the kernel pairing
   *  refusal in applyFile. */
  pairedWith?: readonly string[];
}

/** Apply ONE file. The whole of db:apply lives here so --self-test exercises
 *  exactly the code an agent runs, not a paraphrase of it. */
async function applyFile(path: string, opts: ApplyOpts): Promise<number> {
  const { dryRun, reapply, statementTimeout, target, campaignSource, lane } = opts;
  const branchRefPath = opts.branchRefPath;
  const outsideMigrations = relative(MIGRATIONS_DIR, path).startsWith("..");
  // 🚨 THE ONE CARVE-OUT, and it is a filename pattern, not a flag. --target-self-test
  // writes its scratch file into a per-run temp directory instead of into the SHARED
  // migrations/ of this checkout, where two seats running the self-test at the same
  // moment clobbered each other's file and each other's ledger row (ATTACK-4 finding
  // 22). Nothing about the LEDGER rules moves: the file is still read from disk, still
  // ledgered by its basename, still checksummed on the bytes that executed, still in
  // one transaction with its ledger row. The only thing relaxed is WHERE the bytes may
  // sit, and only for a basename no real migration can ever have.
  if (outsideMigrations && !TARGET_SELFTEST_SCRATCH_RE.test(basename(path))) {
    console.error(
      `${TAG.fail}${relative(ROOT, path)} is not in migrations/. Every applied file lives in ` +
        `migrations/ so check:migrations can see it; move it there first.`,
    );
    return 1;
  }

  // 🚨 ATTACK-5 finding 1 — `migrations/rehearsal/` is where a branch-only file
  // lives, and it exists because a refusal in this runner was never going to be
  // enough. On 2026-09-16 03:52:12Z the scheduled fleet release applied
  // `custom_entity_types_detail_variant.sql` — headed `-- target: branch` — to
  // PRODUCTION, because `scripts/release.sh` sweeps `migrations/*.sql` through an
  // applier it resolves out of a sibling aidream checkout. The rehearsal file was
  // in the swept directory. Take it out of the directory and no runner version,
  // stale or current, can reach it: aidream's `_glob_for` is non-recursive.
  //
  // Ledgered by BASENAME, not by `rehearsal/<name>`, so the two rows this campaign
  // already wrote (branch 03:02:53Z, production 03:52:12Z) keep matching the file
  // that moved. One name, one ledger row, on both databases.
  const rehearsalDir = resolve(MIGRATIONS_DIR, REHEARSAL_DIRNAME);
  const inRehearsal = !outsideMigrations && !relative(rehearsalDir, path).startsWith("..");
  if (inRehearsal && target === "production") {
    console.error(
      `${TAG.fail}${relative(ROOT, path)} is in migrations/${REHEARSAL_DIRNAME}/, which is the ` +
        `rehearsal branch's directory.\n` +
        `  Refusing --target production by LOCATION, before its header is even read. A file here\n` +
        `  is deliberately invisible to every release path; promoting it to production means\n` +
        `  moving it back to migrations/ and changing its \`-- target:\` header on purpose.`,
    );
    return 1;
  }
  // `migrations/inverse/` — the down-migrations. Never swept (the globs are
  // non-recursive), so they need no `-- migrate: skip:` marker, which is what used to
  // make them unrunnable by ANY path: db:apply refuses a skip-marked file outright and
  // the MCP path is forbidden for this repo, so §8.9's abort checklist had no route to
  // the inverse it depends on (ATTACK-5 finding 1, "the abort checklist cannot undo
  // it"). A file here that names production must carry `-- chair-step: <why>`; the
  // header checks then print the reason and the whole body before it executes.
  const inverseDir = resolve(MIGRATIONS_DIR, INVERSE_DIRNAME);
  const inInverse = !outsideMigrations && !relative(inverseDir, path).startsWith("..");

  // 🚨 ATTACK-6 finding 1 — `migrations/campaign/` and the plan's own command.
  // The flag is an ASSERTION ABOUT THE FILE, checked both ways, so neither half can
  // drift into a habit: a campaign file without `--source campaign` is refused, and
  // `--source campaign` naming a file that is not a campaign file is refused too.
  // 🚨 THE CONFORMANCE CORPUS IS NEVER APPLIED, TO ANYTHING. Its files exist to be
  // JUDGED — they carry `DROP TABLE`, `GRANT USAGE ON SCHEMA custom TO authenticated`
  // and a trigger that raises on every write to `platform.associations`, on purpose —
  // so the refusal is by LOCATION, before a header is read, at every target, and it is
  // not softened by --dry-run or --reapply. `--judge-only` is the one thing that reads
  // this directory.
  const corpusDir = resolve(MIGRATIONS_DIR, JUDGMENT_CORPUS_DIRNAME);
  if (!outsideMigrations && !relative(corpusDir, path).startsWith("..")) {
    console.error(
      `${TAG.fail}${relative(ROOT, path)} is in migrations/${JUDGMENT_CORPUS_DIRNAME}/, the ` +
        `conformance corpus.\n` +
        `  Those files are FIXTURES: they exist so that both runners can be proven to judge\n` +
        `  the same bytes the same way (pnpm check:migration-judgment,\n` +
        `  uv run python scripts/check_migration_judgment.py), and several of them would do\n` +
        `  real damage if they ran. Refusing by LOCATION, at every target, before the header\n` +
        `  is even read. To see what the judges say about one:\n` +
        `    pnpm db:apply --judge-only ${relative(ROOT, path)}`,
    );
    return 1;
  }

  const campaignDir = resolve(MIGRATIONS_DIR, CAMPAIGN_DIRNAME);
  const inCampaign = !outsideMigrations && !relative(campaignDir, path).startsWith("..");
  if (inCampaign && !campaignSource) {
    console.error(
      `${TAG.fail}${relative(ROOT, path)} is in migrations/${CAMPAIGN_DIRNAME}/, which no release ` +
        `path scans.\n` +
        `  The ONE route to either database is the plan's own command:\n` +
        `    pnpm db:apply ${relative(ROOT, path)} --source ${CAMPAIGN_SOURCE} --target branch --lane <lane>\n` +
        `  and, while this lane holds its campaign_watch.build_lock row, the same file with\n` +
        `  --target production. A rehearsal on the copy is a convenience, never a precondition.\n` +
        `  Refusing by LOCATION, before its header is read.`,
    );
    return 1;
  }
  if (campaignSource && !inCampaign) {
    console.error(
      `${TAG.fail}--source ${CAMPAIGN_SOURCE} names ${relative(ROOT, path)}, which is not in ` +
        `migrations/${CAMPAIGN_DIRNAME}/.\n` +
        `  That flag is an assertion about WHERE the file lives, not a mode. An ordinary\n` +
        `  migration is applied without it; a campaign migration is moved into\n` +
        `  migrations/${CAMPAIGN_DIRNAME}/ first, so that no sweep in either repo can ever see it.`,
    );
    return 1;
  }
  if (inCampaign && !lane) {
    console.error(
      `${TAG.fail}${relative(ROOT, path)} is a campaign migration and no --lane was named.\n` +
        `  Every campaign apply is attributable to ONE lane: the lane id is what the\n` +
        `  campaign_watch.build_lock row on the rehearsal branch is checked against before a\n` +
        `  production apply. Pass --lane <lane id>.`,
    );
    return 1;
  }

  const filename =
    outsideMigrations || inRehearsal || inInverse || inCampaign
      ? basename(path)
      : relative(MIGRATIONS_DIR, path);
  const sql = readFileSync(path, "utf8");
  const checksum = sha256(sql);

  if (sql.trim().length === 0) {
    console.error(`${TAG.fail}${filename} is empty — nothing to apply.`);
    return 1;
  }

  // 🚨 `-- retired:` — refused at EVERY target, on EVERY path, before anything else this
  // runner does with the bytes. Not softened by --dry-run, not softened by --reapply, and
  // not excused by a confirmed `-- chair-step:` (this is read before the header checks run,
  // so the chair step is never even offered). A retired file has exactly one remedy and it
  // is a NEW migration.
  const retired = retiredReason(sql);
  if (retired !== null) {
    console.error(
      `${TAG.fail}${filename} carries \`-- retired: ${retired}\`\n` +
        `  Its bytes are frozen history that the live database has since moved past, so\n` +
        `  executing them again would REVERT what replaced them — silently, with every check\n` +
        `  green, because an already-ledgered file is never re-judged.\n` +
        `  Refused at every target, on every path: --reapply does not soften it, --dry-run does\n` +
        `  not soften it, and a confirmed --chair-step never reaches it.\n` +
        `  If those changes genuinely must run again, WRITE A NEW MIGRATION — a new file, judged\n` +
        `  and ledgered on its own bytes. Deleting this marker to re-run the old bytes is the\n` +
        `  exact defect it exists to stop.`,
    );
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

  // 🚨 D249 KERNEL PAIRING — the class that shut the provisioner down for 2.5 hours on
  // 2026-09-20 (P2-00f). Three landings — LEVELFIX, VIS2 and LADDER-PERF — CREATE OR
  // REPLACE'd bodies that `iam.entity_read_kernel_fingerprint()` hashes and re-recorded
  // nothing, so `iam.entity_read_kernel_expected()` went stale and `platform.provision`
  // refused EVERY spec with `preflight.read_kernel`. A guard for exactly this existed in
  // both repos on the day LADDER-PERF landed — and was wired into nothing. This is the
  // wire: the judgement happens HERE, on the bytes about to execute, before a connection
  // exists, at every target, and it is not softened by --dry-run or --reapply. `--pair`
  // is the sibling-file form the guard has always accepted (a re-record in a file applied
  // in the same command sequence); the file it names is read and judged, not taken on trust.
  {
    const paired: Record<string, string> = { [filename]: sql };
    for (const raw of opts.pairedWith ?? []) {
      const pairPath = existsSync(resolve(process.cwd(), raw))
        ? resolve(process.cwd(), raw)
        : resolve(MIGRATIONS_DIR, raw);
      if (!existsSync(pairPath)) {
        console.error(`${TAG.fail}--pair ${raw}: no such file. A pairing file is read and judged, never assumed.`);
        return 1;
      }
      paired[relative(ROOT, pairPath)] = readFileSync(pairPath, "utf8");
    }
    const pairing = judgeKernelPairing(paired);
    if (!pairing.ok) {
      const bodies = [
        ...new Set(pairing.kernelHits.map(({ rep }) => `${rep.schema ? `${rep.schema}.` : ""}${rep.name}`)),
      ].sort();
      console.error(
        `${TAG.fail}${filename} replaces the access-kernel ${bodies.length === 1 ? "body" : "bodies"} ` +
          `${C.bold}${bodies.join(", ")}${C.reset}, which ${C.bold}iam.entity_read_kernel_fingerprint()${C.reset} ` +
          `hashes, and nothing in this apply re-records ${C.bold}iam.entity_read_kernel_expected()${C.reset} — ` +
          `so the moment it lands the provisioner refuses every spec with \`preflight.read_kernel\` and no ` +
          `table can be created on this database.\n` +
          `  Fix it one of two ways, and neither of them is a blind stamp (AD242): prove the bodies still ` +
          `admit what they admitted, then\n` +
          `    1. add \`CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()\` to ${filename} itself, or\n` +
          `    2. write that re-record as its own file and name it in THIS SAME command:\n` +
          `         pnpm db:apply ${filename} … --pair migrations/<the re-record file>.sql\n` +
          `  Refused at every target; --dry-run and --reapply do not soften it.`,
      );
      return 1;
    }
    if (pairing.kernelHits.length > 0) {
      console.log(
        `${TAG.ok}kernel rerecord pairing ${C.dim}— this apply replaces ` +
          `${pairing.kernelHits.length} fingerprinted kernel body/bodies AND re-records ` +
          `iam.entity_read_kernel_expected() (${[...new Set(pairing.rerecordHits.map((h) => h.path))].join(", ")})${C.reset}`,
      );
    }
  }

  const stripped = stripForDetection(sql);
  const facts = statementFacts(sql);
  if (facts.selfLedger) {
    console.error(
      `${TAG.fail}${filename} writes public._schema_migrations itself.\n` +
        `  The applier owns that row and records the SHA-256 of the bytes it executed. A\n` +
        `  self-written checksum is a claim nobody can check and guarantees a false drift\n` +
        `  report next run. Delete the ledger statement from the file and re-run db:apply.`,
    );
    return 1;
  }
  if (facts.txnControl) {
    console.error(
      `${TAG.fail}${filename} carries its own ${facts.txnControl}.\n` +
        `  This runner owns the transaction: it opens one, runs the whole file inside it, writes\n` +
        `  the ledger row in the same transaction and commits once. A COMMIT inside the file would\n` +
        `  end that transaction early, so the rest of the file — and the ledger row — would land\n` +
        `  outside it and a later failure could no longer roll anything back.\n` +
        `  Delete the BEGIN/COMMIT lines from the file and re-run db:apply.`,
    );
    return 1;
  }
  if (facts.autocommit) {
    console.error(
      `${TAG.fail}${filename} contains a statement that cannot run inside a transaction\n` +
        `  (CREATE/DROP INDEX CONCURRENTLY, REINDEX CONCURRENTLY, VACUUM, or ALTER TYPE ... ADD VALUE).\n` +
        `  This runner is transactional, so applying it here would fail halfway. Apply it from\n` +
        `  the aidream checkout, which runs such files in autocommit and owns the same ledger:\n` +
        `      python db/apply_migrations.py --source ${SOURCE} --only ${filename}`,
    );
    return 1;
  }

  // ── --target: WHICH database, refused BEFORE a connection exists ──────────
  // The environment SELECTS a connection; it has never AUTHORISED one. Both
  // databases are named `postgres` and both connect as `postgres`, so until this
  // existed nothing in this runner could tell the rehearsal branch from
  // production. See scripts/lib/migration-target.ts.
  let branchRef: BranchRef;
  let guard: { feature: string; key: string } | null = null;
  let revokeExemption: { schema: string; statements: Array<{ text: string }> } | null = null;
  let chairStep: { why: string; reasons: string[] } | null = null;
  let customDataInserts: string[] = [];
  let chairStepConfirmed: string | null = null;
  let headerNamesProduction = false;
  try {
    const header = readHeader(sql);
    headerNamesProduction = header.targets !== null && header.targets.includes("production");
    // BRANCH-REF is read for EVERY apply, not only --target branch: the
    // production half needs the branch's identity to refuse a file that would
    // land on the branch while claiming production.
    branchRef = loadBranchRef(ROOT, branchRefPath);
    ({ guard, revokeExemption, chairStep, customDataInserts } = assertHeaderAgreesWithFlag({
      basedOnNames: basedOnFunctionNames(sql),
      filename,
      flagTarget: target,
      header,
      strippedSql: stripped,
    }));
  } catch (err) {
    if (err instanceof TargetRefusal) {
      console.error(`${TAG.fail}${err.message}`);
      return 1;
    }
    throw err;
  }

  // Nothing fails silently — and nothing PASSES silently either. A used exemption
  // is printed with the statements it allowed, by name.
  if (revokeExemption) {
    console.log(
      `${TAG.ok}revoke exemption ${C.bold}-- allows: revoke ${revokeExemption.schema}${C.reset} ` +
        `${C.dim}— every REVOKE below stays inside schema ${revokeExemption.schema}; no other ` +
        `non-additive statement is excused${C.reset}`,
    );
    for (const st of revokeExemption.statements) {
      console.log(`       ${C.dim}${st.text}${C.reset}`);
    }
  }

  // The same rule for the custom-data INSERT: a shape that puts ROWS on production is
  // announced with the statements it admitted, or it is not bounded.
  if (customDataInserts.length) {
    console.log(
      `${TAG.ok}custom-data insert ${C.bold}schema custom${C.reset} ` +
        `${C.dim}— ${customDataInserts.length} row-writing statement(s) admitted under ` +
        `-- guard: ${guard ? `${guard.feature}/${guard.key}` : "(none)"}; schema custom is revoked ` +
        `from every client role and absent from pgrst.db_schemas, and the file's inverse removes ` +
        `them${C.reset}`,
    );
    for (const st of customDataInserts) {
      console.log(`       ${C.dim}${st.slice(0, 200)}${st.length > 200 ? " …" : ""}${C.reset}`);
    }
  }

  // A chair step is the loudest thing this runner does: the reason, then the ENTIRE
  // file, before anything connects. An escape nobody can see is not an escape.
  if (chairStep) {
    console.log(
      `${TAG.warn}${C.bold}-- chair-step${C.reset}: ${chairStep.why}\n` +
        `       ${C.dim}this file is NOT additive` +
        (chairStep.reasons.length ? ` — it carries ${chairStep.reasons.join(", ")}` : "") +
        ` and is about to run against ${target === "production" ? "PRODUCTION" : "the REHEARSAL BRANCH"}.` +
        ` Its entire body follows.${C.reset}`,
    );
    for (const line of sql.split("\n")) console.log(`       ${C.dim}${line}${C.reset}`);
  }

  // The chair step's confirmation, and the campaign's own two production conditions.
  // Both happen BEFORE any production credential is loaded: a refusal here never
  // opened a connection.
  if (chairStep && target === "production" && !dryRun) {
    const refused = await confirmChairStep(filename, chairStep.why, opts.confirmedChairSteps ?? []);
    if (refused) {
      console.error(`${TAG.fail}${refused}`);
      return 1;
    }
    chairStepConfirmed = chairStep.why;
  }
  if (inCampaign && target === "production" && !dryRun) {
    const refused = await assertCampaignProductionIsAuthorised(filename, checksum, lane!, branchRef);
    if (refused) {
      console.error(`${TAG.fail}${refused}`);
      return 1;
    }
  }

  let env: DbEnv | { missing: string[]; looked: string[] };
  if (target === "branch") {
    try {
      const b = loadBranchDbEnv(ROOT, branchRef);
      env = { ...b };
    } catch (err) {
      if (err instanceof TargetRefusal) {
        console.error(`${TAG.fail}${err.message}`);
        return 1;
      }
      throw err;
    }
  } else {
    env = loadDbEnv();
  }
  if (!("missing" in env)) {
    try {
      assertConfiguredHostMatchesTarget(env, target, branchRef);
    } catch (err) {
      if (err instanceof TargetRefusal) {
        console.error(`${TAG.fail}${err.message}`);
        return 1;
      }
      throw err;
    }
  }
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
    // ── --target, second half: the SERVER's own identity, not the argument ───
    // `pg_control_system().system_identifier` is the cluster's control-file id.
    // Both databases answer `postgres` to current_database() and `postgres` to
    // current_user; this is the one thing that differs and does not move. Read
    // from the server, so a wrong --target is caught by the database's answer.
    try {
      const sysid = await assertServerMatchesTarget(
        (text) => client.query(text) as Promise<{ rows: Array<Record<string, unknown>> }>,
        target,
        branchRef,
        filename,
      );
      console.log(
        `${TAG.ok}target ${C.bold}${target}${C.reset} ${C.dim}(server system_identifier ${sysid}, ` +
          `from ${branchRef.path})${C.reset}`,
      );
      // A `-- target: branch,production` file lands on production only while its
      // named knob is OFF — the knob's platform value, which is
      // coalesce(value, default_value): platform.knob_scope_kind has no `system`
      // rung and never did.
    } catch (err) {
      if (err instanceof TargetRefusal) {
        console.error(`${TAG.fail}${err.message}`);
        return 1;
      }
      console.error(
        `${TAG.fail}Could not read the connected server's identity — ${formatPgError(err)}`,
      );
      return 2;
    }

    // ATTACK-4 finding 3: the guard is now MANDATORY for any file whose header names
    // production, so on that path `guard` is null only for a `-- seeds-guards: yes`
    // register file — which is bounded to the knob register itself. A header that
    // names production with neither is refused before this line by
    // assertHeaderAgreesWithFlag, so this can never quietly skip a guard check.
    if (target === "production" && headerNamesProduction && !guard) {
      console.log(
        `${TAG.ok}guard ${C.bold}-- seeds-guards: yes${C.reset} ${C.dim}— this file seeds the ` +
          `knob register itself and touches nothing else${C.reset}`,
      );
    }
    if (guard && target === "production") {
      try {
        await assertGuardResolvesOff(
          (text) => client.query(text) as Promise<{ rows: Array<Record<string, unknown>> }>,
          guard,
          filename,
        );
        console.log(
          `${TAG.ok}guard ${C.bold}${guard.feature}/${guard.key}${C.reset} ` +
            `${C.dim}resolves false — the old path is untouched by this apply${C.reset}`,
        );
      } catch (err) {
        if (err instanceof TargetRefusal) {
          console.error(`${TAG.fail}${err.message}`);
          return 1;
        }
        console.error(`${TAG.fail}Could not resolve the guard — ${formatPgError(err)}`);
        return 2;
      }
    }

    const existing = await ledgerRow(client, filename).catch((err: unknown) => {
      console.error(`${TAG.fail}Could not read the ledger — ${formatPgError(err)}`);
      return undefined;
    });
    if (existing === undefined) return 2;

    if (existing) {
      if (existing.checksum === checksum && !reapply) {
        console.log(
          `${TAG.ok}Already applied, byte-identical (ledgered ${existing.applied_at}). Nothing to do.`,
        );
        return 0;
      }
      if (existing.checksum === checksum) {
        // --reapply means EXECUTE THESE BYTES AGAIN. Until 2026-09-16 it did
        // nothing when the ledgered checksum MATCHED, so the one workflow the
        // campaign's rollback rule depends on — run a file's down-migration,
        // then put the file back — was impossible through this runner: the down
        // leaves the up's ledger row standing, and the up then short-circuits on
        // its own unchanged checksum. aidream's runner has always had this as
        // `--rerun PREFIX`. Reproduced live on the rehearsal branch.
        console.log(
          `${TAG.warn}--reapply: re-executing bytes the ledger already holds ` +
            `(applied ${existing.applied_at}). The ledger row is rewritten with the same checksum.`,
        );
      } else if (!reapply) {
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

    // ── ATTACK-5 finding 3: the header-less file on production ───────────────
    // Whether a file is FROZEN HISTORY is a fact only the ledger holds, so this
    // one judgement waits for the ledger read; every other target check already
    // refused before the connection opened. A file with no `-- target:` line that
    // has never run is judged for the seven non-additive statement classes —
    // which is what rule 8 and §4.9 have always claimed the runner does.
    if (target === "production" && !existing) {
      try {
        const late = assertHeaderAgreesWithFlag({
          basedOnNames: basedOnFunctionNames(sql),
          filename,
          flagTarget: target,
          header: readHeader(sql),
          strippedSql: stripped,
          alreadyLedgered: false,
        });
        if (late.chairStep) {
          // The escape is LOUD or it is not an escape: the reason, then the file.
          console.log(
            `${TAG.warn}${C.bold}-- chair-step${C.reset}: ${late.chairStep.why}\n` +
              `       ${C.dim}this header-less file carries ${late.chairStep.reasons.join(", ")} and is ` +
              `about to run against PRODUCTION. Its entire body follows.${C.reset}`,
          );
          for (const line of sql.split("\n")) console.log(`       ${C.dim}${line}${C.reset}`);
          if (!dryRun) {
            const refused = await confirmChairStep(filename, late.chairStep.why, opts.confirmedChairSteps ?? []);
            if (refused) {
              console.error(`${TAG.fail}${refused}`);
              await client.query("rollback").catch(() => {});
              return 1;
            }
            chairStepConfirmed = late.chairStep.why;
          }
        }
      } catch (err) {
        if (err instanceof TargetRefusal) {
          console.error(`${TAG.fail}${err.message}`);
          return 1;
        }
        throw err;
      }
    }

    // ── DD-220: a migration replaces only the body it declares it saw ────────
    // `CREATE OR REPLACE FUNCTION` is a whole-body write with NO concurrency
    // check — it never asks what it is overwriting. On 2026-09-14 that silently
    // reverted `billing.plan_status` to a pre-DD-173 dump and every signed-in
    // caller got 42883 for 3m21s while three separate gates read green.
    //
    // Ledgered files are EXEMPT, deliberately: their bytes already ran, so
    // re-judging them today would refuse a `--reapply` of a file that was correct
    // when it applied, and files applied before this guard existed are frozen.
    if (!existing) {
      const q: Query = async (text, params) =>
        (await client.query(text, (params ?? []) as never[])).rows as Record<string, unknown>[];
      let based;
      try {
        based = await basedOnCheck(q, sql);
      } catch (err) {
        console.error(
          `${TAG.fail}${filename} — could not read the live function catalogue to check what this\n` +
            `  file would overwrite (DD-220). Refusing rather than applying a whole-body write\n` +
            `  against a body nobody looked at.\n${C.red}${formatPgError(err)}${C.reset}`,
        );
        return 1;
      }
      if (based.findings.length) {
        console.error(
          `${TAG.fail}${filename} — ${based.findings.length} problem(s) with what this file would ` +
            `OVERWRITE. Nothing was applied, no ledger row was written.`,
        );
        for (const f of based.findings) console.error(`  ${C.red}- ${f.message}${C.reset}`);
        console.error(
          `  ${C.dim}Law: a replace declares the body it is based on ` +
            `(common-docs/systems/platform/db-rules/FEATURE.md §6d, DD-220).${C.reset}`,
        );
        return 1;
      }
      if (based.verified.length)
        console.log(
          `${TAG.ok}based-on verified: ${based.verified.length} existing function ` +
            `${based.verified.length === 1 ? "body is" : "bodies are"} exactly the ` +
            `${based.verified.length === 1 ? "one" : "ones"} this file declares it saw ` +
            `${C.dim}(${based.verified.join(", ")})${C.reset}`,
        );
    } else if (findReplaceOccurrences(sql).length) {
      console.log(
        `${TAG.warn}DD-220 based-on check skipped: ${filename} is already ledgered (applied ` +
          `${existing.applied_at}), and ledgered bytes are frozen history — never re-judged.`,
      );
    }

    // The prologue and the ledger upsert are their own statements so the FILE is
    // a payload of exactly its own bytes — which is what makes a Postgres error
    // `position` point at a line in the file.
    const prologue =
      `set local lock_timeout = '${LOCK_TIMEOUT}';\n` +
      `set local statement_timeout = '${statementTimeout}';\n` +
      `select set_config('matrx.db_apply_t0', clock_timestamp()::text, true);`;
    // A CONFIRMED CHAIR STEP IS LOGGED TO THE LEDGER (ATTACK-6 finding 4). The
    // column is added idempotently on the one path that writes it, so the record of
    // who waived the additive rule and why outlives the command that named it.
    // Nullable, no default, no live reader — every other insert names its columns.
    const chairStepLog = chairStepConfirmed
      ? `alter table public._schema_migrations add column if not exists chair_step text;\n`
      : ``;
    const ledgerUpsert =
      chairStepLog +
      `insert into public._schema_migrations (source, filename, checksum, duration_ms` +
      (chairStepConfirmed ? `, chair_step` : ``) +
      `)\n` +
      `values (${lit(SOURCE)}, ${lit(filename)}, ${lit(checksum)},\n` +
      `        greatest(1, (extract(epoch from clock_timestamp()\n` +
      `                     - current_setting('matrx.db_apply_t0')::timestamptz) * 1000)::int)` +
      (chairStepConfirmed
        ? `,\n        ${lit(`${chairStepConfirmed} — named with --confirm-chair-step by ${process.env.USER ?? "unknown"}`)}`
        : ``) +
      `)\n` +
      `on conflict (source, filename) do update set\n` +
      `  checksum = excluded.checksum, applied_at = now(), duration_ms = excluded.duration_ms` +
      (chairStepConfirmed ? `, chair_step = excluded.chair_step` : ``) +
      `;`;

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
/** DD-220 arm: a real function, created then replaced, on the live database. */
const SELFTEST_FN_FILE = "zz_db_apply_selftest_dd220_fn.sql";
const SELFTEST_REPLACE_FILE = "zz_db_apply_selftest_dd220_replace.sql";
/** V-84 residue: the same rule applied to DDL built at runtime. */
const SELFTEST_DYNAMIC_FILE = "zz_db_apply_selftest_dd220_dynamic.sql";
/** `-- retired:` arm: a file the live database has moved past, proven unrunnable. */
const SELFTEST_RETIRED_FILE = "zz_db_apply_selftest_retired.sql";

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
  const fnPath = resolve(MIGRATIONS_DIR, SELFTEST_FN_FILE);
  const replacePath = resolve(MIGRATIONS_DIR, SELFTEST_REPLACE_FILE);
  const dynamicPath = resolve(MIGRATIONS_DIR, SELFTEST_DYNAMIC_FILE);
  const retiredPath = resolve(MIGRATIONS_DIR, SELFTEST_RETIRED_FILE);
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
  const opts: ApplyOpts = {
    dryRun: false,
    reapply: false,
    statementTimeout,
    target: "production",
      campaignSource: false,
    lane: null,
  };

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

    // ── DD-220: a replace declares the body it saw ───────────────────────────
    // Four proofs, all against the REAL catalogue, because the whole guard is a
    // statement about what is live at the moment of apply:
    //   1. a NEW function with no `-- based-on:` line applies (nothing to clobber)
    //   2. replacing it with NO line is refused
    //   3. replacing it with a STALE hash is refused, naming both hashes
    //   4. replacing it with the hash the catalogue actually holds applies
    console.log(`${C.bold}self-test DD-220${C.reset} ${C.dim}(a replace declares the body it saw)${C.reset}`);
    const fnBody = (note: string) =>
      `create schema if not exists ${SELFTEST_SCHEMA};\n` +
      `create or replace function ${SELFTEST_SCHEMA}.probe(p_in text)\n` +
      `returns text language sql immutable as $fn$ select ${lit(note)} || p_in $fn$;\n`;

    writeFileSync(fnPath, fnBody("new:"), "utf8");
    const newCode = await applyFile(fnPath, opts);
    if (newCode !== 0) fail(`a NEW function with no based-on line exited ${newCode}, expected 0`);

    // The hash the guard will recompute: sha256 of the live `pg_get_functiondef` text.
    const realHash = String(
      (
        await client.query<{ h: string }>(
          `select encode(sha256(convert_to(pg_get_functiondef(
             to_regprocedure('${SELFTEST_SCHEMA}.probe(text)')), 'utf8')), 'hex') as h`,
        )
      ).rows[0]?.h ?? "",
    );
    if (!/^[0-9a-f]{64}$/.test(realHash))
      fail(`could not read the live body hash of ${SELFTEST_SCHEMA}.probe(text)`);

    writeFileSync(replacePath, fnBody("replaced:"), "utf8");
    const noHeader = await applyFile(replacePath, opts);
    if (noHeader !== 1)
      fail(`replacing an EXISTING function with no based-on line exited ${noHeader}, expected 1`);

    const stale = sha256("a body this database has never held");
    writeFileSync(
      replacePath,
      `-- based-on: ${SELFTEST_SCHEMA}.probe(text) ${stale}\n${fnBody("replaced:")}`,
      "utf8",
    );
    const staleCode = await applyFile(replacePath, opts);
    if (staleCode !== 1) fail(`a STALE based-on hash exited ${staleCode}, expected 1`);

    writeFileSync(
      replacePath,
      `-- based-on: ${SELFTEST_SCHEMA}.probe(text) ${realHash}\n${fnBody("replaced:")}`,
      "utf8",
    );
    const goodCode = await applyFile(replacePath, opts);
    if (goodCode !== 0) fail(`the CORRECT based-on hash exited ${goodCode}, expected 0`);
    const nowSays = (
      await client.query<{ v: string }>(`select ${SELFTEST_SCHEMA}.probe('x') as v`)
    ).rows[0]?.v;
    if (nowSays !== "replaced:x")
      fail(`the declared replace did not land — probe('x') returned ${JSON.stringify(nowSays)}`);

    // ── Proof 5 (V-84 residue): the SAME rule for DDL built at runtime ───────
    // The first cut of this guard stripped dollar-quoted bodies, so a
    // `DO $$ … EXECUTE 'create or replace function …' … $$;` was invisible — and
    // that is a live pattern in this repo's own migrations
    // (`ddl_guard_org_backstop_oid_comparison.sql` replaces platform._ddl_guard()
    // exactly that way). A silent bypass produces no refusal, so none of the four
    // proofs above could ever have caught it. This one can.
    const dynBody = (note: string) =>
      `do $do$\nbegin\n  execute 'create or replace function ${SELFTEST_SCHEMA}.probe(p_in text) ` +
      `returns text language sql immutable as $f$ select ''${note}'' || p_in $f$';\nend\n$do$;\n`;

    writeFileSync(dynamicPath, dynBody("dyn:"), "utf8");
    const dynNoHeader = await applyFile(dynamicPath, opts);
    if (dynNoHeader !== 1)
      fail(`a DYNAMIC replace with no based-on line exited ${dynNoHeader}, expected 1`);

    // A name assembled at runtime cannot be looked up at all: refused by name.
    writeFileSync(
      dynamicPath,
      `do $do$\nbegin\n  execute format('create or replace function %I.probe(p_in text) returns text ` +
        `language sql immutable as $f$ select ''c:'' || p_in $f$', '${SELFTEST_SCHEMA}');\nend\n$do$;\n`,
      "utf8",
    );
    const computed = await applyFile(dynamicPath, opts);
    if (computed !== 1) fail(`a COMPUTED function name exited ${computed}, expected 1`);

    const hashNow = String(
      (
        await client.query<{ h: string }>(
          `select encode(sha256(convert_to(pg_get_functiondef(
             to_regprocedure('${SELFTEST_SCHEMA}.probe(text)')), 'utf8')), 'hex') as h`,
        )
      ).rows[0]?.h ?? "",
    );
    writeFileSync(
      dynamicPath,
      `-- based-on: ${SELFTEST_SCHEMA}.probe(text) ${hashNow}\n${dynBody("dyn:")}`,
      "utf8",
    );
    const dynGood = await applyFile(dynamicPath, opts);
    if (dynGood !== 0) fail(`a DECLARED dynamic replace exited ${dynGood}, expected 0`);
    const dynSays = (
      await client.query<{ v: string }>(`select ${SELFTEST_SCHEMA}.probe('x') as v`)
    ).rows[0]?.v;
    if (dynSays !== "dyn:x")
      fail(`the declared dynamic replace did not land — probe('x') returned ${JSON.stringify(dynSays)}`);

    if (failures === 0)
      console.log(
        `${TAG.ok}DD-220 proven: new function applies unguarded; replacing an existing one is ` +
          `REFUSED with no header and REFUSED on a stale hash; the declared hash applies and lands; ` +
          `and a DO-block/EXECUTE replace is judged the same — refused bare, refused on a computed ` +
          `name, applied when declared (V-84 residue)`,
      );

    // ── `-- retired:`: frozen history that must never execute again ──────────
    // The door this closes is the one --reapply deliberately leaves open: an
    // already-ledgered file is never re-judged, so its OLD bytes still run. Five
    // proofs, in the order that matters — the refusal must hold on the paths an
    // agent would actually reach for:
    //   1. plain apply of a marked file           → refused, NOTHING ledgered
    //   2. the same file with --reapply           → refused (the flag is not a key)
    //   3. the same file with a CONFIRMED chair step → refused (never even offered)
    //   4. the SAME BYTES with the marker removed → applies (so the refusal is the
    //      marker, not the file: this arm can go green, which is what makes it a test)
    //   5. the marker restored on the now-LEDGERED file, with --reapply → refused
    //      (the live shape: `migrations/cvx_list_scoped_audience.sql`)
    console.log(
      `${C.bold}self-test retired${C.reset} ${C.dim}(frozen history cannot be re-executed)${C.reset}`,
    );
    const retiredBody =
      `create table if not exists ${SELFTEST_SCHEMA}.retired_probe (id int primary key);\n`;
    const marker = `-- retired: superseded by ${SELFTEST_FILE} (self-test)\n`;
    const retiredLedgerRows = async () =>
      (
        await client.query<{ n: number }>(
          `select count(*)::int as n from public._schema_migrations
             where source = ${lit(SOURCE)} and filename = ${lit(SELFTEST_RETIRED_FILE)}`,
        )
      ).rows[0]!.n;

    writeFileSync(retiredPath, marker + retiredBody, "utf8");
    const retiredPlain = await applyFile(retiredPath, opts);
    if (retiredPlain !== 1) fail(`a \`-- retired:\` file exited ${retiredPlain}, expected 1`);
    if ((await retiredLedgerRows()) !== 0) fail(`a \`-- retired:\` file wrote a ledger row`);

    const retiredReapply = await applyFile(retiredPath, { ...opts, reapply: true });
    if (retiredReapply !== 1) fail(`--reapply on a retired file exited ${retiredReapply}, expected 1`);

    writeFileSync(
      retiredPath,
      `${marker}-- chair-step: prove a confirmed chair step does not excuse a retired file\n${retiredBody}`,
      "utf8",
    );
    const retiredChair = await applyFile(retiredPath, {
      ...opts,
      confirmedChairSteps: [SELFTEST_RETIRED_FILE],
    });
    if (retiredChair !== 1)
      fail(`a CONFIRMED chair step on a retired file exited ${retiredChair}, expected 1`);
    if ((await retiredLedgerRows()) !== 0)
      fail(`a retired file reached the ledger through --reapply or a chair step`);

    // GREEN: the identical bytes WITHOUT the marker. If this ever fails, the arm is
    // refusing something else and proves nothing about the marker.
    writeFileSync(retiredPath, retiredBody, "utf8");
    const retiredUnmarked = await applyFile(retiredPath, opts);
    if (retiredUnmarked !== 0)
      fail(`the same bytes with NO retired marker exited ${retiredUnmarked}, expected 0`);
    if ((await retiredLedgerRows()) !== 1)
      fail(`the unmarked file did not land exactly one ledger row`);

    // The live shape: a file that already RAN, marked afterwards, re-run on purpose.
    writeFileSync(retiredPath, marker + retiredBody, "utf8");
    const retiredLedgered = await applyFile(retiredPath, { ...opts, reapply: true });
    if (retiredLedgered !== 1)
      fail(`--reapply of a LEDGERED retired file exited ${retiredLedgered}, expected 1`);

    if (failures === 0)
      console.log(
        `${TAG.ok}retired proven: a \`-- retired:\` file is refused unledgered, refused under ` +
          `--reapply, refused with a CONFIRMED chair step, and refused again once ledgered — while ` +
          `the SAME bytes without the marker apply normally`,
      );
  } finally {
    await client
      .query(
        `drop schema if exists ${SELFTEST_SCHEMA} cascade;
         delete from public._schema_migrations where source = ${lit(SOURCE)}
            and filename in (${lit(SELFTEST_FILE)}, ${lit(SELFTEST_FN_FILE)},
                             ${lit(SELFTEST_REPLACE_FILE)}, ${lit(SELFTEST_DYNAMIC_FILE)},
                             ${lit(SELFTEST_RETIRED_FILE)});`,
      )
      .catch((err: unknown) =>
        console.error(
          `${TAG.fail}self-test cleanup FAILED — remove schema ${SELFTEST_SCHEMA} and the ` +
            `${SELFTEST_FILE} ledger row by hand: ${formatPgError(err)}`,
        ),
      );
    await client.end().catch(() => undefined);
    for (const p of [path, fnPath, replacePath, dynamicPath, retiredPath])
      if (existsSync(p)) unlinkSync(p);
  }

  if (failures) {
    console.error(`${TAG.fail}db:apply --self-test FAILED (${failures} assertion(s))`);
    return 1;
  }
  console.log(`${TAG.ok}db:apply --self-test passed against the live database`);
  return 0;
}


// ════════════════════════════════════════════════════════════════════════════
// --target-self-test — the refusal proven RED then GREEN, on the BRANCH only
// ════════════════════════════════════════════════════════════════════════════
//
// Four proofs, each run by SPAWNING THIS SCRIPT, so what is proven is exactly
// what an agent runs — not a paraphrase of it:
//
//   1. header vs flag           refused with NO connection at all
//   2. configured host vs flag  refused with NO production credential in the
//                               process (SUPABASE_BRANCH_DATABASE_URL is pointed
//                               at a production-SHAPED DSN carrying a fake
//                               password; nothing is opened)
//   3. connected server vs flag `--target production` while the five
//                               SUPABASE_MATRIX_* are the BRANCH's -> refused by
//                               pg_control_system().system_identifier, which is
//                               read from the server and not from the argument
//   4. GREEN                    a `-- target: branch` file APPLIES to the branch,
//                               leaves a real object, and ledgers on the branch
//
// Production is never connected to and no file ever lands on it here.
//
// 🚨 PER-RUN, NOT SHARED (ATTACK-4 finding 22, fixed 2026-09-15). Until this was
// fixed the scratch `.sql` was written into the SHARED matrx-frontend checkout's
// migrations/ under a FIXED name, and it created a FIXED schema on the branch. Two
// seats running --target-self-test at the same moment overwrote each other's file
// mid-proof, dropped each other's schema, and deleted each other's ledger row —
// and the cleanup ran only inside the green branch and asserted nothing, so the
// wreckage was silent. Now: the file lives in a per-run mkdtemp directory OUTSIDE
// the checkout, the filename and the schema both carry a per-run suffix, cleanup
// runs on EVERY path, and cleanup is ASSERTED against the branch the way aidream's
// half already asserted its own.
const TARGET_SELFTEST_SCRATCH_RE = /^zz_db_apply_target_selftest_[0-9a-f]{12}\.sql$/;

async function targetSelfTest(statementTimeout: string): Promise<number> {
  const { spawnSync } = await import("node:child_process");
  let failures = 0;
  const fail = (what: string) => {
    failures += 1;
    console.error(`${TAG.fail}target-self-test: ${what}`);
  };
  const pass = (what: string) => console.log(`${TAG.ok}target-self-test: ${what}`);

  let ref;
  try {
    ref = loadBranchRef(ROOT);
  } catch (err) {
    console.error(
      `${TAG.fail}target-self-test cannot run: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 2;
  }
  let branchEnv;
  try {
    branchEnv = loadBranchDbEnv(ROOT, ref);
  } catch (err) {
    console.error(
      `${TAG.fail}target-self-test cannot run: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 2;
  }

  // Per-run identity: the scratch file, the schema and the ledger filename all carry
  // it, so two seats can run this at the same moment and never touch each other.
  const runId = randomBytes(6).toString("hex");
  const selftestFile = `zz_db_apply_target_selftest_${runId}.sql`;
  const selftestSchema = `zz_w0_target_selftest_${runId}`;
  const scratchDir = mkdtempSync(join(tmpdir(), "db-apply-target-selftest-"));
  const path = join(scratchDir, selftestFile);
  const self = resolve(ROOT, "scripts", "apply-migration.ts");
  const run = (args: string[], env: Record<string, string>) =>
    spawnSync("npx", ["tsx", self, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, ...env } as NodeJS.ProcessEnv,
      timeout: 180_000,
    });

  // The branch's five variables, so a production credential is never in the
  // spawned process for proofs 2 and 3.
  const branchAsMatrix: Record<string, string> = {
    SUPABASE_MATRIX_USER: branchEnv.user,
    SUPABASE_MATRIX_PASSWORD: branchEnv.password,
    SUPABASE_MATRIX_HOST: branchEnv.host,
    SUPABASE_MATRIX_PORT: String(branchEnv.port),
    SUPABASE_MATRIX_DATABASE_NAME: branchEnv.database,
  };

  const branchBody =
    `-- target: branch\n` +
    `create schema if not exists ${selftestSchema};\n` +
    `create table if not exists ${selftestSchema}.landed (id int primary key);\n` +
    `insert into ${selftestSchema}.landed (id) values (1) on conflict do nothing;\n`;

  try {
    // ── 1. header vs flag, no connection ───────────────────────────────────
    // ORDER MATTERS: the header-vs-flag DISAGREEMENT must be refused before the
    // additive/guard requirement this file would also fail, so the message an
    // agent reads is the one that names the contradiction.
    writeFileSync(
      path,
      `-- target: production\ncreate schema if not exists ${selftestSchema};\n`,
      "utf8",
    );
    const r1 = run([path, "--target", "branch"], {
      ...branchAsMatrix,
    });
    const out1 = `${r1.stdout ?? ""}${r1.stderr ?? ""}`;
    if (r1.status !== 1) fail(`a production-headed file with --target branch exited ${r1.status}, expected 1`);
    else if (!/file header: production/.test(out1) || !/command flag: branch/.test(out1))
      fail(`the header/flag refusal did not print both identities:\n${out1.slice(0, 600)}`);
    else pass("a `-- target: production` file is refused by --target branch, before any connection");

    // ── 1b. ATTACK-4 finding 3 — a production-headed file gets the SAME additive
    //        and guard requirement a branch,production file gets ──────────────
    const r1b = run([path, "--target", "production"], { ...branchAsMatrix });
    const out1b = `${r1b.stdout ?? ""}${r1b.stderr ?? ""}`;
    if (r1b.status !== 1)
      fail(`a bare \`-- target: production\` file without --additive/--guard exited ${r1b.status}, expected 1`);
    else if (!/without `-- additive: yes`/.test(out1b))
      fail(`the production-header requirement did not fire:\n${out1b.slice(0, 900)}`);
    else if (!/with NO `-- target:` line is production-only/.test(out1b))
      fail(`the refusal did not say that header-less files are deliberately untouched:\n${out1b.slice(0, 900)}`);
    else
      pass(
        "a `-- target: production` file without `-- additive: yes` / `-- guard:` is refused, and " +
          "the message says header-less files are deliberately untouched",
      );

    // ── 1c. the non-regression half of the same finding: NO header, non-additive
    //        body, --target production — accepted by the header checks exactly as
    //        it was before. It fails LATER, on the branch's own identity, which is
    //        proof the header checks did not refuse it. ────────────────────────
    writeFileSync(path, `drop table if exists ${selftestSchema}.no_such_table;\n`, "utf8");
    const r1c = run([path, "--target", "production"], { ...branchAsMatrix });
    const out1c = `${r1c.stdout ?? ""}${r1c.stderr ?? ""}`;
    if (/without `-- additive: yes`/.test(out1c) || /without a `-- guard:` line/.test(out1c))
      fail(`a header-LESS file was judged by the production-header rule — the world just broke:\n${out1c.slice(0, 900)}`);
    else if (!/the configured connection IS the rehearsal branch/.test(out1c))
      fail(`the header-less file did not reach the connection-identity check:\n${out1c.slice(0, 900)}`);
    else
      pass(
        "a file with NO `-- target:` header and a DROP in it is still accepted by the header " +
          "checks and refused only by the connection's identity — ~3,567 migrations unmoved",
      );

    // ── 2. configured host vs flag, no production credential ───────────────
    writeFileSync(path, branchBody, "utf8");
    const r2 = run([path, "--target", "branch"], {
      [ref.passwordEnvVar]: `postgresql://postgres.${ref.parentRef}:not-a-real-password@${ref.poolerHost}:${ref.poolerPort}/${ref.database}`,
    });
    const out2 = `${r2.stdout ?? ""}${r2.stderr ?? ""}`;
    if (r2.status !== 1) fail(`--target branch against a production-shaped DSN exited ${r2.status}, expected 1`);
    else if (!new RegExp(`does not point at the branch ${ref.branchRef}`).test(out2))
      fail(`the pre-connection refusal did not name the branch:\n${out2.slice(0, 600)}`);
    else pass("--target branch against a production-shaped DSN is refused with nothing opened");

    // ── 3. connected server vs flag ────────────────────────────────────────
    // The file says both targets and is additive and guarded, so the header and
    // the flag AGREE — only the server can refuse this one.
    writeFileSync(
      path,
      `-- target: branch,production\n-- additive: yes\n-- guard: custom/system_enabled\n` +
        `create schema if not exists ${selftestSchema};\n`,
      "utf8",
    );
    const r3 = run([path, "--target", "production"], {
      ...branchAsMatrix,
    });
    const out3 = `${r3.stdout ?? ""}${r3.stderr ?? ""}`;
    if (r3.status !== 1) fail(`--target production while connected to the branch exited ${r3.status}, expected 1`);
    else if (!new RegExp(`the rehearsal branch ${ref.branchRef}`).test(out3))
      fail(`the server-identity refusal did not name what it was really connected to:\n${out3.slice(0, 900)}`);
    else
      pass(
        "--target production while connected to the branch is refused by the server's own " +
          "system_identifier",
      );

    // ── 3b. ATTACK-4 finding 4 — the revoke exemption, RED then GREEN, with no
    //        connection needed for either verdict ─────────────────────────────
    const revokeBody =
      `-- target: branch,production\n-- additive: yes\n-- guard: custom/system_enabled\n` +
      `revoke usage on schema ${selftestSchema} from authenticated;\n`;
    writeFileSync(path, revokeBody, "utf8");
    const r3b = run([path, "--target", "production"], { ...branchAsMatrix });
    const out3b = `${r3b.stdout ?? ""}${r3b.stderr ?? ""}`;
    // The assertion is on the ALLOW-LIST's own vocabulary, not on a sentence. It used
    // to read `/body contains a REVOKE/` — the wording of the blacklist this campaign
    // replaced — so from the moment ATTACK-4 finding 3 turned the judgement into an
    // allow-list, W0-TGT-FE's exit proof FAILED on a refusal that was working perfectly:
    // the file WAS refused, by name, naming the statement. Measured 2026-09-16, the
    // lane could not report DONE and wave zero stopped at lane 1 of 47. `not one of the
    // enumerated ADDITIVE shapes` + `a REVOKE` is what `nonAdditiveReasons` prints and
    // what `migrations/JUDGMENT.md` pins as `refuse:not-additive`.
    if (
      r3b.status !== 1 ||
      !/not one of the enumerated ADDITIVE shapes/.test(out3b) ||
      !/a REVOKE/.test(out3b)
    )
      fail(`a REVOKE with no \`-- allows:\` line was not refused by name:\n${out3b.slice(0, 900)}`);
    else pass("a REVOKE with no `-- allows:` line is refused by name");

    writeFileSync(
      path,
      revokeBody.replace(
        "-- guard: custom/system_enabled\n",
        `-- guard: custom/system_enabled\n-- allows: revoke ${selftestSchema}\n`,
      ),
      "utf8",
    );
    const r3c = run([path, "--target", "production"], { ...branchAsMatrix });
    const out3c = `${r3c.stdout ?? ""}${r3c.stderr ?? ""}`;
    // The same stale phrase made THIS assertion vacuous rather than red: it could never
    // fire, so "the exemption suppresses the reason" was never actually measured.
    if (/a REVOKE \(the bounded route is/.test(out3c))
      fail(`\`-- allows: revoke\` did not suppress the REVOKE reason:\n${out3c.slice(0, 900)}`);
    else if (!new RegExp(`revoke exemption .*-- allows: revoke ${selftestSchema}`).test(out3c))
      fail(`the used exemption was not ANNOUNCED — it passed silently:\n${out3c.slice(0, 900)}`);
    else if (!/the configured connection IS the rehearsal branch/.test(out3c))
      fail(`the exempted file did not get past the header checks:\n${out3c.slice(0, 900)}`);
    else
      pass(
        "`-- allows: revoke <schema>` suppresses the REVOKE reason, announces itself by name, " +
          "and excuses nothing else",
      );

    writeFileSync(
      path,
      revokeBody
        .replace(
          "-- guard: custom/system_enabled\n",
          `-- guard: custom/system_enabled\n-- allows: revoke ${selftestSchema}\n`,
        )
        .replace(`on schema ${selftestSchema}`, "on schema public"),
      "utf8",
    );
    const r3d = run([path, "--target", "production"], { ...branchAsMatrix });
    const out3d = `${r3d.stdout ?? ""}${r3d.stderr ?? ""}`;
    if (r3d.status !== 1 || !/does not stay inside it/.test(out3d))
      fail(`a REVOKE naming another schema slipped past the exemption:\n${out3d.slice(0, 900)}`);
    else pass("a REVOKE naming a schema the exemption does not cover refuses the whole file");

    // ── 4. GREEN — a real migration lands on the branch and reads back ──────
    writeFileSync(path, branchBody, "utf8");
    const r4 = run(
      [path, "--target", "branch", `--statement-timeout=${statementTimeout}`],
      {},
    );
    const out4 = `${r4.stdout ?? ""}${r4.stderr ?? ""}`;
    if (r4.status !== 0) {
      fail(`the GREEN branch apply exited ${r4.status}, expected 0:\n${out4.slice(0, 900)}`);
    } else {
      const c = await connectDirect(
        {
          user: branchEnv.user,
          password: branchEnv.password,
          host: branchEnv.host,
          port: branchEnv.port,
          database: branchEnv.database,
          from: branchEnv.from,
        },
        "matrx-frontend db:apply --target-self-test",
      );
      try {
        const back = await c.query<{ n: string; ledger: string }>(
          `select (select count(*)::text from ${selftestSchema}.landed) as n,
                  (select count(*)::text from public._schema_migrations
                     where source = ${lit(SOURCE)} and filename = ${lit(selftestFile)}) as ledger`,
        );
        if (back.rows[0]?.n !== "1") fail(`the branch object did not read back (rows: ${back.rows[0]?.n})`);
        else if (back.rows[0]?.ledger !== "1")
          fail(`the branch ledger row is missing (rows: ${back.rows[0]?.ledger})`);
        else pass("a `-- target: branch` file applied to the branch, read back, and ledgered there");
      } finally {
        await c.end();
      }
    }
  } finally {
    // CLEANUP ON EVERY PATH, AND ASSERTED — aidream's half has always asserted its
    // own; this one used to run only inside the green branch and assert nothing, so
    // a red run left a schema and a ledger row on the branch in silence.
    if (existsSync(path)) unlinkSync(path);
    rmSync(scratchDir, { recursive: true, force: true });
    try {
      const c = await connectDirect(
        {
          user: branchEnv.user,
          password: branchEnv.password,
          host: branchEnv.host,
          port: branchEnv.port,
          database: branchEnv.database,
          from: branchEnv.from,
        },
        "matrx-frontend db:apply --target-self-test cleanup",
      );
      try {
        await c.query(`drop schema if exists ${selftestSchema} cascade`);
        await c.query(
          `delete from public._schema_migrations where source = ${lit(SOURCE)} and filename = ${lit(selftestFile)}`,
        );
        const left = await c.query<{ schemas: string; ledger: string }>(
          `select (select count(*)::text from information_schema.schemata
                     where schema_name = ${lit(selftestSchema)}) as schemas,
                  (select count(*)::text from public._schema_migrations
                     where source = ${lit(SOURCE)} and filename = ${lit(selftestFile)}) as ledger`,
        );
        if (left.rows[0]?.schemas !== "0" || left.rows[0]?.ledger !== "0")
          fail(
            `cleanup left something behind on the branch (schema rows ${left.rows[0]?.schemas}, ` +
              `ledger rows ${left.rows[0]?.ledger})`,
          );
        else
          pass(`cleanup verified on the branch — ${selftestSchema} gone, ledger row gone`);
      } finally {
        await c.end();
      }
    } catch (err) {
      fail(
        `cleanup could not be VERIFIED on the branch — remove schema ${selftestSchema} and the ` +
          `${selftestFile} ledger row by hand: ${formatPgError(err)}`,
      );
    }
  }

  if (failures) {
    console.error(`${TAG.fail}db:apply --target-self-test FAILED (${failures} assertion(s))`);
    return 1;
  }
  console.log(
    `${TAG.ok}db:apply --target-self-test passed — the refusal holds in both places and the ` +
      `branch apply is real`,
  );
  return 0;
}

/**
 * `--judge-only [path…]` — THE JUDGEMENT, AND NOTHING ELSE (ATTACK-7).
 *
 * 🚨 The campaign has two sanctioned runners. Until this existed, the only way to know
 * whether they judged a file the same way was to read both implementations — and they
 * did not: `-- chair-step:` waived the allow-list here and nothing there, `--source
 * campaign` demanded its target there and defaulted to PRODUCTION here. So both runners
 * now expose the same read-only mode over the same corpus, and
 * `pnpm check:migration-judgment` / `uv run python scripts/check_migration_judgment.py`
 * fail on any disagreement.
 *
 * It opens NO connection, reads no environment and writes nothing: one JSON object per
 * (file, target) on stdout. It judges the HEADER, exactly as an apply would — with
 * `alreadyLedgered: false`, because a fixture has never run — and deliberately not the
 * LOCATION rules (which directory a file sits in), which are the runner's, not the judge's.
 */
function judgeOnly(paths: readonly string[]): number {
  const files: string[] = [];
  for (const p of paths) {
    if (!existsSync(p)) {
      console.error(`${TAG.fail}--judge-only: no such file or directory: ${p}`);
      return 1;
    }
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p).sort()) if (name.endsWith(".sql")) files.push(resolve(p, name));
    } else files.push(resolve(p));
  }
  if (files.length === 0) {
    console.error(`${TAG.fail}--judge-only: nothing to judge in ${paths.join(", ")}`);
    return 1;
  }
  for (const file of files) {
    const sql = readFileSync(file, "utf8");
    const name = basename(file);
    // Target-independent, and printed on BOTH the accept and the refuse line: the
    // statement detectors are the OTHER half of the judgement, and until 2026-09-17
    // the corpus could not see them at all (the autocommit detector read a function's
    // HINT text as DDL and nothing went red).
    const facts = statementFacts(sql);
    // The D249 kernel pairing is judged on the file's OWN bytes here — `--judge-only`
    // has no invocation to look across, so a file that re-records in a sibling shows
    // `kernel_rerecord: "unpaired"` and the apply's `--pair` is what resolves it.
    const pairing = judgeKernelPairing({ [name]: sql });
    const detectors = {
      autocommit: facts.autocommit,
      txn_control: facts.txnControl,
      self_ledger: facts.selfLedger,
      kernel_rerecord: pairing.kernelHits.length === 0
        ? "untouched"
        : pairing.ok
          ? "paired"
          : "unpaired",
    };
    for (const target of TARGETS) {
      let line: Record<string, unknown>;
      try {
        const header = readHeader(sql);
        const verdict = assertHeaderAgreesWithFlag({
          filename: name,
          flagTarget: target,
          header,
          strippedSql: stripForDetection(sql),
          alreadyLedgered: false,
          basedOnNames: basedOnFunctionNames(sql),
        });
        line = {
          runner: "matrx-frontend",
          file: name,
          target,
          verdict: "accept",
          code: "accept",
          guard: verdict.guard ? `${verdict.guard.feature}/${verdict.guard.key}` : null,
          chair_step: Boolean(verdict.chairStep),
          excused: verdict.chairStep ? verdict.chairStep.reasons.length : 0,
          revoke_exemption: verdict.revokeExemption ? verdict.revokeExemption.schema : null,
          custom_inserts: verdict.customDataInserts.length,
          ...detectors,
        };
      } catch (err) {
        if (!(err instanceof TargetRefusal)) throw err;
        line = {
          runner: "matrx-frontend",
          file: name,
          target,
          verdict: "refuse",
          code: err.code,
          detail: err.message.split("\n")[0],
          ...detectors,
        };
      }
      console.log(JSON.stringify(line));
    }
  }
  return 0;
}


/* ───────────────────────── --amend-idempotent ──────────────────────────────
 *
 * A LEDGERED MIGRATION'S BYTES ARE FROZEN HISTORY. THIS AMENDS THE LEDGER, NEVER THE DATABASE.
 *
 * WHY IT EXISTS (lane INVERSE-GUARD, 2026-09-22, chair ruling on the 28). Rule 27 is
 * `up -> inverse -> up`. An inverse may NOT drop a body a live trigger reaches or a later lane
 * adopted — `pnpm check:inverses-leave-the-ground-standing` refuses that, and it is right to:
 * dropping `custom.assert_store_door` under nineteen attached triggers breaks the store, it does
 * not restore a defect. But an up-file that creates those bodies with a bare `CREATE FUNCTION`
 * can then never be re-applied on top of what the inverse left, so rule 27 fails. Measured on
 * the rehearsal branch: of the 84 inverses the ground-standing fixes touched, 28 fail exactly
 * this way, and the SAME pairs pass with the pre-fix inverse bytes.
 *
 * The defect is the up-file's bare `CREATE FUNCTION`, and it is a CLASS across the campaign, not
 * 28 instances. But the two obvious routes are both forbidden:
 *   - editing the file quietly makes `pnpm check:migrations` report checksum drift forever, and
 *     a ledger that disagrees with the tree is the thing this runner exists to prevent;
 *   - `--reapply` EXECUTES the whole file again against the one live database, which for a
 *     campaign up-file means re-running its DDL, its seeds and its guards. Not for a typo.
 *
 * So this is the missing primitive: it EXECUTES NOTHING. It proves the only thing that changed
 * is idempotency, then moves the ledger's checksum to the new bytes and records what it did.
 *
 *   1. It finds the LEDGERED bytes by walking `git log` over that path and hashing each blob
 *      until one matches the ledger's checksum. No match -> refuse. (The bytes that ran are the
 *      only honest baseline; the current file is not evidence about itself.)
 *   2. It proves the ONLY difference is `CREATE FUNCTION` -> `CREATE OR REPLACE FUNCTION` and
 *      `CREATE TRIGGER` -> `CREATE OR REPLACE TRIGGER`: both sides are normalised and must come
 *      out byte-identical. Any other difference -> refuse, with the first differing line.
 *   3. It updates the ledger checksum and writes the OLD checksum and the word
 *      `amend-idempotent` into `chair_step`, so the amendment is visible in the ledger forever.
 *   4. `--amend-idempotent --self-test` proves the predicate RED then GREEN with no database.
 */

/**
 * THE TRANSFORM, AS A SQL SCAN AND NOT A REGEX.
 *
 * 🚨 WHY THIS IS NOT A `String.replace` (VERIFY-AMEND, 2026-09-21, verdict DOES NOT HOLD).
 * The first version of this was three whole-file case-insensitive regexes. A regex has no idea
 * what a SQL statement is, so it rewrote the same words inside `--` comments, inside
 * `using hint = '…'` message literals a person reads, inside plpgsql `cmd.command_tag = '…'`
 * comparisons, and inside `CREATE EVENT TRIGGER … WHEN TAG IN ('CREATE FUNCTION', …)`. Postgres
 * VALIDATES event-trigger filter values, so
 * `open_census_a_closed_schema_closes_itself.sql` stopped being applicable at all — and the
 * production ledger had already been moved onto those bytes, certifying as "what ran" a file
 * Postgres refuses. Three `w0_sync_*` files lost their DDL-guard arms the same way: they still
 * compile and never fire, which is worse.
 *
 * And the predicate could not see ANY of it, because it normalised BOTH sides with this same
 * function — a check that transforms the thing it is checking can only ever confirm it.
 *
 * So: this walks the text, skipping `--` comments, `/* *\/` comments, single-quoted strings and
 * dollar-quoted bodies, and rewrites `CREATE FUNCTION|TRIGGER|VIEW` ONLY where it begins a
 * top-level statement. It inserts ` OR REPLACE` and changes nothing else — not one other byte,
 * not the case of the keyword (the old regex lower-cased `CREATE FUNCTION` to
 * `create or replace function`, which is 28 more files of gratuitous diff).
 */
export function rewriteBareCreates(sql: string): { out: string; changed: number } {
  let out = "";
  let changed = 0;
  let i = 0;
  /** The last character that was actual SQL — a statement head may only follow `;` or nothing. */
  let lastSignificant = "";
  const n = sql.length;

  while (i < n) {
    const two = sql.slice(i, i + 2);

    if (two === "--") {
      const j = sql.indexOf("\n", i);
      const end = j === -1 ? n : j;
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (two === "/*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql.slice(j, j + 2) === "/*") { depth++; j += 2; continue; }
        if (sql.slice(j, j + 2) === "*/") { depth--; j += 2; continue; }
        j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    // AN E'' STRING TAKES BACKSLASH ESCAPES, so `E'a\'; create function …'` is still ONE string
    // and the `create` inside it is not a statement head. Without this the scanner would close
    // the literal at `\'`, rewrite inside it, and then miss the real head that follows.
    // (VERIFY-AMEND second pass, 2026-09-22. Unreachable today — there is no E'' string under
    // migrations/ — which is exactly why it is worth closing before one is written.)
    const isEString =
      (sql[i] === "E" || sql[i] === "e") &&
      sql[i + 1] === "'" &&
      !/[A-Za-z0-9_$]/.test(sql[i - 1] ?? "");
    if (isEString || sql[i] === "'") {
      const start = isEString ? i + 1 : i;
      let j = start + 1;
      while (j < n) {
        if (isEString && sql[j] === "\\") { j += 2; continue; }
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      out += sql.slice(i, j);
      i = j;
      lastSignificant = "'";
      continue;
    }
    if (sql[i] === '"') {
      let j = i + 1;
      while (j < n && sql[j] !== '"') j++;
      j++;
      out += sql.slice(i, j);
      i = j;
      lastSignificant = '"';
      continue;
    }
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
    if (dollar) {
      const tag = dollar[0];
      const close = sql.indexOf(tag, i + tag.length);
      const j = close === -1 ? n : close + tag.length;
      out += sql.slice(i, j);
      i = j;
      lastSignificant = "$";
      continue;
    }

    // A statement head: `create` in plain SQL, preceded by `;` or by nothing at all.
    if ((sql[i] === "c" || sql[i] === "C") && (lastSignificant === "" || lastSignificant === ";")) {
      const m = /^(create)(\s+)(function|trigger|view)\b/i.exec(sql.slice(i, i + 64));
      if (m) {
        const orReplace = m[1] === m[1]!.toUpperCase() ? " OR REPLACE" : " or replace";
        out += m[1] + orReplace + m[2] + m[3];
        i += m[0].length;
        changed++;
        lastSignificant = "e";
        continue;
      }
    }

    const ch = sql[i]!;
    out += ch;
    if (!/\s/.test(ch)) lastSignificant = ch;
    i++;
  }

  return { out, changed };
}

export interface AmendVerdict {
  readonly ok: boolean;
  readonly why?: string;
  readonly changed: number;
}

/**
 * THE PROOF, AND IT IS ONE-SIDED ON PURPOSE. `transform(the bytes that actually ran)` must equal
 * the current file BYTE FOR BYTE. The current side is never normalised, never touched: if the
 * file carries so much as a changed comment or a re-cased keyword that this transform would not
 * itself have produced, the comparison fails and the amendment is refused.
 */
export function onlyIdempotencyDiffers(ledgered: string, current: string): AmendVerdict {
  if (ledgered === current) {
    return { ok: false, changed: 0, why: "the bytes are identical — there is nothing to amend." };
  }
  const { out, changed } = rewriteBareCreates(ledgered);
  if (out !== current) {
    const al = out.split("\n");
    const bl = current.split("\n");
    let i = 0;
    while (i < al.length && i < bl.length && al[i] === bl[i]) i++;
    return {
      ok: false,
      changed: 0,
      why:
        `the current file is NOT what making the ledgered bytes idempotent produces. This mode may ` +
        `only ever cover a change the database cannot tell apart from what it already ran, and the ` +
        `file carries something else. First difference at line ${i + 1}:\n` +
        `    making the applied bytes idempotent gives: ${(al[i] ?? "<end of file>").slice(0, 160)}\n` +
        `    the file on disk says:                     ${(bl[i] ?? "<end of file>").slice(0, 160)}`,
    };
  }
  if (changed <= 0) {
    return { ok: false, changed: 0, why: "no bare CREATE FUNCTION/TRIGGER/VIEW statement was made idempotent." };
  }
  return { ok: true, changed };
}

/** Step 1: the ledgered bytes, out of git history for that path. */
function ledgeredBytesFromGit(path: string, wantChecksum: string): { bytes: string; commit: string } | null {
  let shas: string[];
  try {
    shas = execFileSync("git", ["log", "--format=%H", "--", path], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return null;
  }
  for (const sha of shas) {
    let bytes: string;
    try {
      bytes = execFileSync("git", ["show", `${sha}:${path}`], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      continue;
    }
    if (sha256(bytes) === wantChecksum) return { bytes, commit: sha };
  }
  return null;
}

/**
 * THE FOUR FILES THIS MODE BROKE, pinned by the commit that carried the damage
 * (`a482b925a3` — `origin/main` as VERIFY-AMEND found it). Their damaged bytes must be REFUSED
 * against the bytes that actually ran, forever. This is the regression proof for the class: it
 * is not a fixture someone can quietly loosen, it is the real incident.
 */
const DAMAGED_BY_THIS_MODE = "a482b925a3d4b175768f0a1aa889134b1e896273";
const DAMAGED_FILES = [
  "migrations/campaign/open_census_a_closed_schema_closes_itself.sql",
  "migrations/campaign/w0_sync_provisioner_and_shape_guard.sql",
  "migrations/campaign/w0_sync_provisioner_bodies_byte_exact.sql",
  "migrations/campaign/w0_sync_ruling_schema_functions.sql",
];

/** Step 4: RED then GREEN, with no database. */
function amendSelfTest(): number {
  let failed = 0;
  const red = (name: string, ledgered: string, current: string): void => {
    const v = onlyIdempotencyDiffers(ledgered, current);
    if (v.ok) {
      console.error(`${TAG.fail}SELF-TEST FAILED — ${name} was ACCEPTED. It must be refused.`);
      failed++;
      return;
    }
    console.log(`${TAG.ok}self-test RED — ${name} is refused.`);
  };

  const base =
    "-- a lane that CREATE FUNCTION is mentioned in\nset lock_timeout = '5s';\n" +
    "CREATE FUNCTION custom.f(a uuid) returns int language sql as $$ select 1 $$;\n" +
    "create trigger t after insert on custom.record execute function custom.f();\n" +
    "create view custom.v as select 1 as n;\n" +
    "create event trigger e on ddl_command_end\n" +
    "  when tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')\n" +
    "  execute function custom.f();\n" +
    "create function custom.g() returns event_trigger language plpgsql as $b$\n" +
    "begin\n" +
    "  if cmd.command_tag = 'CREATE FUNCTION' then return; end if;\n" +
    "end $b$;\n";

  const good = rewriteBareCreates(base).out;

  // E — the verifier's case: ONLY an event-trigger WHEN TAG IN literal moved. It breaks the file
  // (Postgres validates filter values) and the old predicate took it.
  red("a WHEN TAG IN literal", base, base.replace("when tag in ('CREATE FUNCTION'", "when tag in ('create or replace function'"));
  // F — ONLY a plpgsql command_tag comparison moved. It compiles and silently never fires.
  red("a plpgsql command_tag comparison", base, base.replace("cmd.command_tag = 'CREATE FUNCTION'", "cmd.command_tag = 'create or replace function'"));
  // A comment is a byte too.
  red("a comment", base, base.replace("mentioned in", "mentioned in, twice"));
  // Case-folding the keyword is not this transform's output either.
  red("a re-cased keyword", base, good.replace("CREATE OR REPLACE FUNCTION", "create or replace function"));
  // The original arms.
  red("a changed function body", base, good.replace("select 1", "select 2"));
  red("identical bytes", base, base);
  red("a trailing newline", base, good + "\n");

  // THE INCIDENT ITSELF: the four files this mode damaged must be refused against what ran.
  for (const path of DAMAGED_FILES) {
    let damaged: string;
    try {
      damaged = execFileSync("git", ["show", `${DAMAGED_BY_THIS_MODE}:${path}`], {
        cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      console.error(
        `${TAG.fail}SELF-TEST FAILED — cannot read the damaged bytes of ${path} at ` +
          `${DAMAGED_BY_THIS_MODE.slice(0, 10)}. The regression proof for this mode's own incident ` +
          `is unavailable, so it is not proven.`,
      );
      failed++;
      continue;
    }
    // The bytes that actually ran: the parent state of the damage for that path.
    let applied: string;
    try {
      const prior = execFileSync("git", ["log", "--format=%H", "-2", DAMAGED_BY_THIS_MODE, "--", path], {
        cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
      }).split("\n").filter(Boolean);
      const parent = execFileSync("git", ["rev-parse", `${prior[0]}^`], { cwd: ROOT, encoding: "utf8" }).trim();
      applied = execFileSync("git", ["show", `${parent}:${path}`], {
        cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      console.error(`${TAG.fail}SELF-TEST FAILED — cannot read the pre-damage bytes of ${path}.`);
      failed++;
      continue;
    }
    const v = onlyIdempotencyDiffers(applied, damaged);
    if (v.ok) {
      console.error(
        `${TAG.fail}SELF-TEST FAILED — the damaged bytes of ${basename(path)} were ACCEPTED. This is ` +
          `the exact file that ended up ledgered onto bytes Postgres refuses.`,
      );
      failed++;
    } else {
      console.log(`${TAG.ok}self-test RED — the real incident: ${basename(path)}'s damaged bytes are refused.`);
    }
  }

  // THE E'' HOLE (VERIFY-AMEND second pass). The escape makes the whole thing ONE string, so
  // the `create function` inside it is not a statement head — and the REAL head after it is.
  const estr =
    "select E'a\\'; create function custom.not_a_head() returns int language sql as $$ select 1 $$;';\n" +
    "create function custom.real_head() returns int language sql as $$ select 1 $$;\n";
  const estrOut = rewriteBareCreates(estr);
  if (estrOut.changed !== 1 || !estrOut.out.includes("create or replace function custom.real_head")) {
    console.error(
      `${TAG.fail}SELF-TEST FAILED — an E'' string with a backslash escape was mis-scanned: ` +
        `${estrOut.changed} head(s) rewritten, expected exactly 1 (the one AFTER the string).`,
    );
    failed++;
  } else if (estrOut.out.includes("create or replace function custom.not_a_head")) {
    console.error(`${TAG.fail}SELF-TEST FAILED — the transform reached inside an E'' string.`);
    failed++;
  } else {
    console.log(`${TAG.ok}self-test GREEN — an E'' backslash escape keeps its string whole; only the real head after it is rewritten.`);
  }
  red("a change inside an E'' string", estr, estr.replace("; create function custom.not_a_head", "; create or replace function custom.not_a_head"));

  // GREEN — and only the statement heads count.
  const v = onlyIdempotencyDiffers(base, good);
  if (!v.ok || v.changed !== 4) {
    console.error(
      `${TAG.fail}SELF-TEST FAILED — the idempotency-only amendment was refused ` +
        `(${v.why?.split("\n")[0] ?? "no reason"}) or counted ${v.changed} instead of 4.`,
    );
    failed++;
  } else {
    console.log(
      `${TAG.ok}self-test GREEN — 4 statement heads made idempotent (CREATE FUNCTION, trigger, view, ` +
        `function), and the event-trigger literal, the command_tag comparison and the comment that ` +
        `all say the same words are untouched.`,
    );
  }

  if (failed) {
    console.error(`${TAG.fail}${failed} self-test arm(s) failed. This mode is NOT safe to run.`);
    return 1;
  }
  return 0;
}

/**
 * THE REVERSE MOVE, and it can only ever undo THIS mode's own mistake.
 *
 * `--amend-idempotent --restore-ledger <file>` puts a row's checksum back to the value the row
 * ITSELF records as the bytes that ran, and it is permitted only when both of these hold:
 *   - `chair_step` carries this mode's note, `amend-idempotent: was <sha>`; and
 *   - the file on disk hashes to exactly that `<sha>`.
 * So it cannot invent history, cannot reach a row this mode never touched, and cannot be used to
 * re-stamp a file: it restores a checksum the ledger already claims, over bytes that match it.
 *
 * It exists because `open_census_a_closed_schema_closes_itself.sql` should never have been edited
 * at all — its only "CREATE FUNCTION" occurrences were an event-trigger `WHEN TAG IN` literal and
 * a comment, so the correct file IS the applied file, and there is nothing to amend forward to.
 */
async function restoreLedger(path: string, target: Target): Promise<number> {
  const filename = basename(path);
  if (!existsSync(path)) {
    console.error(`${TAG.fail}${path} does not exist.`);
    return 1;
  }
  const current = readFileSync(path, "utf8");
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(`${TAG.fail}missing ${env.missing.join(", ")} — cannot read the ledger.`);
    return 1;
  }
  assertConfiguredHostMatchesTarget(env, target, loadBranchRef(ROOT, undefined));
  const client = await connectDirect(env, "db:apply --restore-ledger");
  try {
    const row = await ledgerRow(client, filename);
    if (!row) {
      console.error(`${TAG.fail}${filename} has no ledger row at --target ${target}.`);
      return 1;
    }
    const note = /amend-idempotent: was ([0-9a-f]{64})/.exec(row.chair_step ?? "");
    if (!note) {
      console.error(
        `${TAG.fail}REFUSED — ${filename}'s ledger row carries no amend-idempotent note, so this mode ` +
          `never touched it and has nothing to put back. A checksum is not restored on a guess.`,
      );
      return 1;
    }
    // A row amended TWICE records only the last step, so the note can name another amendment's
    // output rather than the bytes that ran. `--applied-checksum=` names the true one; the file
    // still has to hash to exactly it, so nothing is taken on trust.
    const explicit = process.argv.find((a) => a.startsWith("--applied-checksum="));
    const applied = explicit ? explicit.slice("--applied-checksum=".length).trim() : note[1]!;
    const now = sha256(current);
    if (now !== applied) {
      console.error(
        `${TAG.fail}REFUSED — the file on disk hashes to ${now.slice(0, 12)}, and the row says the ` +
          `bytes that ran hash to ${applied.slice(0, 12)}. Restore the file first; this mode moves a ` +
          `checksum onto bytes that match it, never the other way round.`,
      );
      return 1;
    }
    await client.query(
      `update public._schema_migrations set checksum = $1, chair_step = $2
        where source = $3 and filename = $4`,
      [
        applied,
        `amend-idempotent REVERSED 2026-09-22: a bad amendment had written ${row.checksum}; the file ` +
          `is back to the bytes that ran and the checksum with it. Nothing was ever executed.`,
        SOURCE,
        filename,
      ],
    );
    console.log(
      `${TAG.ok}${filename} — ledger RESTORED at --target ${target}: ${row.checksum.slice(0, 12)} -> ` +
        `${applied.slice(0, 12)}, which is the SHA-256 of the file on disk. Nothing was executed.`,
    );
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

async function amendIdempotent(path: string, target: Target, statementTimeout: string): Promise<number> {
  void statementTimeout;
  const filename = basename(path);
  if (!existsSync(path)) {
    console.error(`${TAG.fail}${path} does not exist.`);
    return 1;
  }
  const current = readFileSync(path, "utf8");
  const rel = relative(ROOT, resolve(path));

  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(`${TAG.fail}missing ${env.missing.join(", ")} — cannot read the ledger.`);
    return 1;
  }
  // The same host assertion every apply makes: amending a ledger on the wrong database would
  // move a checksum that belongs to the other one.
  assertConfiguredHostMatchesTarget(env, target, loadBranchRef(ROOT, undefined));
  const client = await connectDirect(env, "db:apply --amend-idempotent");
  try {
    const row = await ledgerRow(client, filename);
    if (!row) {
      console.error(
        `${TAG.fail}${filename} has no ledger row at --target ${target}. There is nothing to amend: ` +
          `apply it normally.`,
      );
      return 1;
    }
    // 🚨 FOLLOW THIS MODE'S OWN NOTE TRAIL BACK TO THE BYTES THAT RAN (VERIFY-AMEND repair,
    // 2026-09-22). If a previous amendment moved this row, the checksum in the ledger is no
    // longer the checksum of anything the database executed — it is what that amendment wrote.
    // The row records what it was, so the baseline is that, not the current value. Without this
    // a bad amendment can never be undone: the tool would compare against its own mistake.
    const priorNote = /amend-idempotent: was ([0-9a-f]{64})/.exec(row.chair_step ?? "");
    // A row amended TWICE only records the last step, so the note can point at another
    // amendment's output rather than at what ran. `--applied-checksum <sha>` names the true
    // one explicitly; it proves nothing by itself — the byte-for-byte comparison below still
    // has to hold against THAT blob — it only says which history to compare against.
    const explicit = process.argv.find((a) => a.startsWith("--applied-checksum="));
    const appliedChecksum = explicit
      ? explicit.slice("--applied-checksum=".length).trim()
      : priorNote
        ? priorNote[1]!
        : row.checksum;
    if (priorNote) {
      console.log(
        `${TAG.warn}this row was amended before: the ledger holds ${row.checksum.slice(0, 12)}, but the ` +
          `bytes that ACTUALLY ran hash to ${appliedChecksum.slice(0, 12)}. Judging against those.`,
      );
    }
    const found = ledgeredBytesFromGit(rel, appliedChecksum);
    if (!found) {
      console.error(
        `${TAG.fail}REFUSED — no commit touching ${rel} carries bytes hashing to ` +
          `${appliedChecksum}. The bytes that ran are not in this history, so nothing here can ` +
          `prove what changed. Do not amend; investigate.`,
      );
      return 1;
    }
    const verdict = onlyIdempotencyDiffers(found.bytes, current);
    if (!verdict.ok) {
      console.error(`${TAG.fail}REFUSED — ${verdict.why}`);
      console.error(
        `       ledgered bytes are ${found.commit.slice(0, 12)}:${rel} (applied ${row.applied_at}).\n` +
          `       This mode amends a checksum and executes NOTHING, so it may only ever cover a change ` +
          `the database cannot tell apart from what it already ran.`,
      );
      return 1;
    }

    const newChecksum = sha256(current);
    const note = `amend-idempotent: was ${appliedChecksum} (${found.commit.slice(0, 12)}), ` +
      `${verdict.changed} create(s) made idempotent, nothing executed` +
      (priorNote ? ` [repaired over a bad amendment that had written ${row.checksum.slice(0, 12)}]` : ``);
    await client.query(`alter table public._schema_migrations add column if not exists chair_step text`);
    await client.query(
      `update public._schema_migrations set checksum = $1, chair_step = $2
        where source = $3 and filename = $4`,
      [newChecksum, note, SOURCE, filename],
    );
    console.log(
      `${TAG.ok}${filename} — ledger amended at --target ${target}. ${verdict.changed} bare create(s) ` +
        `are now idempotent; checksum ${row.checksum.slice(0, 12)} -> ${newChecksum.slice(0, 12)}. ` +
        `NOTHING WAS EXECUTED, and the ledger row says so forever.`,
    );
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
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

  let target: Target;
  try {
    target = parseTargetFlag(argv);
  } catch (err) {
    if (err instanceof TargetRefusal) {
      console.error(`${TAG.fail}${err.message}`);
      return 1;
    }
    throw err;
  }

  if (argv.includes("--judge-only")) {
    const i = argv.indexOf("--judge-only");
    const given = argv.slice(i + 1).filter((a) => !a.startsWith("--"));
    const paths = given.length
      ? given.map((a) => (existsSync(resolve(process.cwd(), a)) ? resolve(process.cwd(), a) : resolve(MIGRATIONS_DIR, a)))
      : [resolve(MIGRATIONS_DIR, JUDGMENT_CORPUS_DIRNAME)];
    return judgeOnly(paths);
  }
  if (argv.includes("--amend-idempotent")) {
    if (argv.includes("--self-test")) return amendSelfTest();
    if (argv.includes("--restore-ledger")) {
      const j = argv.indexOf("--restore-ledger");
      const f = argv.slice(j + 1).find((a) => !a.startsWith("--")) ??
        argv.slice(argv.indexOf("--amend-idempotent") + 1).find((a) => !a.startsWith("--"));
      if (!f) {
        console.error(`${TAG.fail}--restore-ledger needs a file.`);
        return 1;
      }
      return restoreLedger(resolve(ROOT, f), parseTargetFlag(argv));
    }
    const i = argv.indexOf("--amend-idempotent");
    const given = argv.slice(i + 1).find((a) => !a.startsWith("--"));
    if (!given) {
      console.error(
        `${TAG.fail}--amend-idempotent needs a file: pnpm db:apply --amend-idempotent ` +
          `migrations/campaign/<file>.sql --target production`,
      );
      return 1;
    }
    return amendIdempotent(resolve(ROOT, given), parseTargetFlag(argv), statementTimeout);
  }

  if (argv.includes("--target-self-test")) return targetSelfTest(statementTimeout);
  if (argv.includes("--self-test")) return selfTest(statementTimeout);

  // `--source campaign` / `--lane <id>` — the plan's own command, and the ONLY
  // route into `migrations/campaign/` (ATTACK-6 finding 1).
  const valueOf = (flag: string): string | null => {
    const eq = argv.find((a) => a.startsWith(`${flag}=`));
    if (eq) return eq.slice(flag.length + 1).trim() || null;
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[i + 1]!.trim() : null;
  };
  const sourceArg = valueOf("--source");
  const lane = valueOf("--lane");
  if (sourceArg !== null && sourceArg !== CAMPAIGN_SOURCE) {
    console.error(
      `${TAG.fail}--source ${sourceArg} is not a source this runner knows. The ONE value is ` +
        `\`--source ${CAMPAIGN_SOURCE}\`,\n` +
        `  which names a file in migrations/${CAMPAIGN_DIRNAME}/ and nothing else. Ordinary ` +
        `migrations take no --source at all.`,
    );
    return 1;
  }
  const campaignSource = sourceArg === CAMPAIGN_SOURCE;
  // 🚨 ATTACK-7 finding 4. `--target` DEFAULTS to production — deliberately, so every
  // migration written before it behaves as it did — and a CAMPAIGN file must never
  // inherit that default, because the default is the database that must not be reached
  // by accident. aidream's runner has refused this by name since ATTACK-6; this one
  // filled the missing flag in with production and printed
  // `[ OK ] target production` as if the caller had asked for it. Rule 27's own loop
  // (apply on the branch, apply again, run the inverse, re-apply the up) is where both
  // production authorisations — the rehearsal ledger row and the lane's build lock —
  // are already satisfied, so ONE omitted `--target branch` inside that loop lands the
  // campaign file on production in the middle of its own rehearsal.
  if (
    campaignSource &&
    !argv.includes("--target") &&
    !argv.some((a) => a.startsWith("--target="))
  ) {
    console.error(
      `${TAG.fail}--source ${CAMPAIGN_SOURCE} requires an explicitly NAMED --target.\n` +
        `  \`production\` is this runner's default for every migration written before --target\n` +
        `  existed; a campaign file never inherits a default, because the default is the\n` +
        `  database that must not be reached by accident.\n` +
        `  The one command:\n` +
        `    pnpm db:apply migrations/${CAMPAIGN_DIRNAME}/<file>.sql --source ${CAMPAIGN_SOURCE} ` +
        `--target branch --lane <lane>\n` +
        `  …and, once that rehearsal is ledgered on the branch and the lane holds its lock,\n` +
        `  the same command with --target production.`,
    );
    return 1;
  }

  // `--target branch` (space form) leaves "branch" in argv as a bare word; it is
  // the flag's VALUE, never the migration file. Same for --source and --lane.
  const valueIdxs = new Set<number>();
  for (const flag of ["--target", "--source", "--lane", "--statement-timeout", "--branch-ref"]) {
    const i = argv.indexOf(flag);
    if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--")) valueIdxs.add(i + 1);
  }
  // `--confirm-chair-step <file.sql>` (repeatable, or `=` form): the basenames this command
  // NAMES. A chair step runs only when its own basename is among them — scripts/lib/chair-step.ts.
  const confirmedChairSteps: string[] = [];
  argv.forEach((tok, i) => {
    if (tok === "--confirm-chair-step" && argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
      valueIdxs.add(i + 1);
      confirmedChairSteps.push(basename(argv[i + 1]!.trim()));
    } else if (tok.startsWith("--confirm-chair-step=")) {
      confirmedChairSteps.push(basename(tok.slice("--confirm-chair-step=".length).trim()));
    }
  });
  // `--pair <file.sql>` (repeatable, or `=` form): the sibling file(s) of THIS apply.
  // The ONLY thing it can do is satisfy the D249 kernel-rerecord pairing above — it
  // never changes what executes, and the named file is read from disk and judged.
  const pairedWith: string[] = [];
  argv.forEach((tok, i) => {
    if (tok === "--pair" && argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
      valueIdxs.add(i + 1);
      pairedWith.push(argv[i + 1]!.trim());
    } else if (tok.startsWith("--pair=")) {
      pairedWith.push(tok.slice("--pair=".length).trim());
    }
  });
  const positional = argv.filter((a, i) => !a.startsWith("--") && !valueIdxs.has(i));

  if (positional.length !== 1) {
    usage();
    return 1;
  }

  const given = resolve(process.cwd(), positional[0]!);
  const alt = resolve(MIGRATIONS_DIR, positional[0]!);
  const path = existsSync(given) ? given : existsSync(alt) ? alt : null;
  if (!path) {
    console.error(`${TAG.fail}No such file: ${positional[0]}`);
    return 1;
  }
  return applyFile(path, {
    dryRun,
    reapply,
    statementTimeout,
    target,
    campaignSource,
    lane,
    branchRefPath: branchRefOverride(argv),
    confirmedChairSteps,
    pairedWith,
  });
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}db:apply — unexpected error:${C.reset}`, err);
    process.exit(2);
  },
);

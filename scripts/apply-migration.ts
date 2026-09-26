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
 *   pnpm db:apply --policy-only-self-test       prove the POLICY-LOCK policy-only rule RED then GREEN
 *   pnpm db:apply --window-class-self-test      prove the TRIGGER-LOCK window-class rule RED then GREEN
 *   pnpm db:apply --ground-gate-self-test       prove the inverse ground gate RED then GREEN
 *                                               (no database, no file written)
 *   pnpm db:apply --self-test                   prove RED then GREEN in a throwaway
 *                                               schema ON THE NIGHTLY DEV CLONE
 *                                               (`--target production` must be spelled
 *                                               out AND fall in the 1–4 AM Pacific
 *                                               window; see selfTest below)
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
 *   - 🚨 a `-- draft: <owner> <reason>` file at `--target production` (D351, 2026-09-26: a lane
 *     committed an unfinished migration and the release sweep shipped it). Every new migration
 *     starts with this line; remedy: remove the -- draft: line when it's ready. `--dry-run`
 *     does not soften it; `--target clone` allows it. aidream's sweep HOLDS the same file.
 *     Proof: `pnpm db:apply --draft-self-test`. Spec: migrations/JUDGMENT.md §1c.
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
  aliasBranchTargetToClone,
  branchIsRetired,
  readHeader,
  REHEARSAL_DIRNAME,
  CAMPAIGN_DIRNAME,
  CAMPAIGN_SOURCE,
  JUDGMENT_CORPUS_DIRNAME,
  TARGETS,
  basedOnFunctionNames,
  branchRefOverride,
  cloneRefOverride,
  loadCloneRef,
  loadCloneDbEnv,
  projectRefOf,
  type CloneRef,
  TargetRefusal,
  type Target,
  policyOnlyVerdict,
  windowClassVerdict,
  windowClassDeclaration,
  WINDOW_CLASS_GRANDFATHERED,
  DDL_LOCK_FOOTPRINT,
  policyDdlOneTableVerdict,
  policyDdlOneTableDeclared,
  POLICY_DDL_ONE_TABLE_MAX_MS,
  sha256OfBytes,
  ddlSitesIn,
  ddlFootprintOf,
  loadDdlFootprint,
  WINDOW_CLASS_OPEN_HHMM,
  WINDOW_CLASS_CLOSE_HHMM,
  pacificHHMM,
  isInsideWindow,
  POLICY_MIXED_GRANDFATHERED,
} from "./lib/migration-target";
import { confirmChairStep } from "./lib/chair-step";
import {
  attributionColumnsPresent,
  attributionJson,
  attributionUpsertParts,
  collectAttribution,
  notRecordedSentence,
  outsideWindowSentence,
  stripLedgerShapeStatements,
} from "./lib/ledger-attribution";
import {
  isIdempotent,
  isLockClash,
  measureRoundTrip,
  roundTripHolds,
  stagedBytesPath,
  type ObjectDeltaRecord,
  type RoundTripMeasurement,
  LEDGER_REBASE_LANE,
  loadRebaseProof,
  measureIdempotency,
  proofHashOf,
  proofRefusal,
  rebaseProofPath,
  rebaseSentence,
  RECEIPT_COLUMN,
  shrinkGrandfathered,
  writeRebaseProof,
  type IdempotencyMeasurement,
  type RebaseProof,
  type RebaseReceipt,
} from "./lib/ledger-rebase";
import { clonePairSelfTest, clonePairVerdict, type CloneLedgerFact } from "./lib/campaign-authorisation";
import {
  rebaseTrailerLine,
  recordAppliedRow,
  receiptPath,
  trailerLine,
  SNAPSHOT_REL as LEDGER_SNAPSHOT_REL,
} from "./lib/ledger-snapshot.mjs";
import { basedOnCheck, findReplaceOccurrences, type Query } from "./migration-based-on";
import { RevokeOrderRefusal, revokeOrderFindings } from "./migration-revoke-order";
import {
  IDLE_IN_TRANSACTION_CEILING,
  LOCK_RETRY_ATTEMPTS,
  TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM,
  backoffSeconds,
  isLockTimeout,
  overrideSentence,
  parseDurationMs,
  timeoutOverrideFindings,
} from "./lib/migration-lock-policy";
import { judgedAsOfRefusal, parseAppliedAt, ranUnderOlderRules, ruleDatesSelfTest } from "./lib/migration-rule-dates";
import { judgeTexts as judgeKernelPairing } from "./check-kernel-rerecord-pairing";
import { judgeOneInverse } from "./check-inverses-leave-the-ground-standing";

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
    // The runner's own ledger SHAPE (the seven attribution columns, one ADD/DROP COLUMN per
    // statement) is the one closed door through this refusal — lib/ledger-attribution.ts.
    selfLedger: SELF_LEDGER_RE.test(stripLedgerShapeStatements(s)),
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

/**
 * 🚨 `-- draft: <owner> <reason>` — WORK IN PROGRESS (FOUND_DEFECTS D351, 2026-09-26). A lane
 * committed an UNFINISHED migration into migrations/ and the release sweep shipped it. Every new
 * migration is written with this line first; it is removed only when the file is done. At
 * `--target production` this runner refuses a draft (dry-run included) and aidream's sweep holds
 * it ("held: draft by <owner>"). The clone takes drafts. The rehearsal copy stays information
 * only (Arman, 2026-09-18, migrations/JUDGMENT.md §6a). Mirror: aidream `_draft_marker`.
 */
export const DRAFT_REMEDY = "remove the -- draft: line when it's ready";
const DRAFT_MARKER = /^\s*--\s*draft\s*:\s*(.*?)\s*$/i;
export function draftMarker(sql: string): { owner: string; reason: string } | null {
  for (const line of sql.split("\n", 25)) {
    const m = line.match(DRAFT_MARKER);
    if (m) {
      const body = m[1] ?? "";
      const sp = body.indexOf(" ");
      const owner = (sp < 0 ? body : body.slice(0, sp)) || "(owner not named)";
      return { owner, reason: sp < 0 ? "" : body.slice(sp + 1).trim() };
    }
  }
  return null;
}

/** No ledger-only path may write a row for draft bytes (D351). Null = not a draft. */
function draftLedgerRefusal(path: string): string | null {
  const d = existsSync(path) ? draftMarker(readFileSync(path, "utf8")) : null;
  return d
    ? `${basename(path)} is a DRAFT by ${d.owner} — no path may ledger it (a row for draft bytes ` +
        `hides the finished file from every apply); ${DRAFT_REMEDY}.`
    : null;
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
): Promise<{ checksum: string; applied_at: string; chair_step: string | null; duration_ms: number | null } | null> {
  const out = await client.query<{ checksum: string; applied_at: string; chair_step: string | null; duration_ms: number | null }>(
    `select checksum, applied_at::text as applied_at,
            (to_jsonb(m) ->> 'chair_step') as chair_step, duration_ms
       from public._schema_migrations m
       where source = $1 and filename = $2`,
    [SOURCE, filename],
  );
  return out.rows[0] ?? null;
}


/**
 * A CAMPAIGN FILE'S PRODUCTION AUTHORISATION — NO BRANCH (lane DB-TOOLS-NO-BRANCH, 2026-09-25 PT).
 *
 * Until today this opened a connection to the REHEARSAL BRANCH to read a
 * `campaign_watch.build_lock` row held by `--lane`. The branch was deleted 2026-09-26 00:30Z, so
 * `loadBranchDbEnv` refused and every campaign file was refused at production; three lanes ran
 * the legs by hand. What the authorisation is now (scripts/lib/campaign-authorisation.ts):
 *
 *   · an explicit `--lane` — refused without one, before the header is read (applyFile);
 *   · the `-- based-on:` hashes recomputed against PRODUCTION immediately before the file runs
 *     (DD-220) — unchanged, it never read the branch;
 *   · the PAIR on the dev clone — the up and its inverse, each ledgered there with the checksum
 *     of the bytes on disk — READ AND PRINTED. Information, never a refusal: JUDGMENT.md §6a
 *     (Arman, 2026-09-18) stands, and a rehearsal gate was tried and reverted 2026-09-26 (D351).
 *     Work in progress is held off production by `-- draft:` (JUDGMENT §1c).
 *
 * It runs on `--dry-run` too — it is read-only — so a dry-run shows exactly what the real apply
 * would print. It opens and closes its own clone connection, inside `begin read only`.
 */
async function reportCampaignClonePair(
  filename: string,
  sql: string,
  cloneRef: CloneRef | null,
): Promise<string> {
  const inverseName = `${filename.replace(/\.sql$/, "")}_down.sql`;
  const inversePath = resolve(MIGRATIONS_DIR, INVERSE_DIRNAME, inverseName);
  const inverseSql = existsSync(inversePath) ? readFileSync(inversePath, "utf8") : null;
  const facts = {
    upName: filename,
    upSql: sql,
    inverseName: inverseSql === null ? null : inverseName,
    inverseSql,
    upOnClone: null as CloneLedgerFact | null,
    inverseOnClone: null as CloneLedgerFact | null,
    cloneUnreadable: null as string | null,
  };
  if (!cloneRef) {
    facts.cloneUnreadable = "CLONE-REF could not be read";
  } else {
    let client: pg.Client | null = null;
    try {
      const env = loadCloneDbEnv(ROOT, cloneRef);
      client = new pg.Client({
        host: env.host,
        port: env.port,
        user: env.user,
        password: env.password,
        database: env.database,
        ssl: { rejectUnauthorized: false },
        application_name: "db:apply (campaign clone-pair read, read only)",
      });
      await client.connect();
      await client.query("begin read only");
      const rows = await client.query<{ filename: string; checksum: string; applied_at: string }>(
        `select filename, checksum, applied_at::text as applied_at from public._schema_migrations
           where source = $1 and filename = any($2::text[])`,
        [SOURCE, [filename, inverseName]],
      );
      await client.query("rollback");
      for (const r of rows.rows) {
        if (r.filename === filename) facts.upOnClone = r;
        else if (r.filename === inverseName) facts.inverseOnClone = r;
      }
    } catch (err) {
      facts.cloneUnreadable = err instanceof Error ? err.message.split("\n")[0]! : String(err);
    } finally {
      await client?.end().catch(() => undefined);
    }
  }
  return clonePairVerdict(facts).note;
}

function usage(): void {
  console.log(
    `${C.bold}pnpm db:apply <migrations/file.sql> [--target branch|clone|production] [--dry-run] [--reapply] [--statement-timeout=10min] [--confirm-chair-step <file.sql>]${C.reset}\n` +
      `  pnpm db:apply migrations/${CAMPAIGN_DIRNAME}/<file>.sql --source ${CAMPAIGN_SOURCE} --target clone|production --lane <lane>\n` +
      `                                     the ONLY route into migrations/${CAMPAIGN_DIRNAME}/, which no\n` +
      `                                     release path, sweep, CI job or scheduled job scans\n` +
      `  pnpm db:apply --self-test          prove RED/GREEN on the NIGHTLY DEV CLONE (the default);\n` +
      `                                     --target production must be spelled out AND fall inside\n` +
      `                                     the 1-4 AM Pacific window\n` +
      `  pnpm db:apply --campaign-auth-self-test   prove a campaign file's production authorisation\n` +
      `                                     needs no branch (RED/GREEN; production dry-run only)\n` +
      `  pnpm db:apply --clone-self-test    prove the CLONE refusal RED/GREEN (production presented as\n` +
      `                                     the clone, and the clone presented as production)\n` +
      `  pnpm db:rehearse <file> --target clone   up -> inverse -> up on the dev clone, timed, with\n` +
      `                                     pg_locks sampled per statement\n` +
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
  /** `--clone-ref=<path>` / MATRX_CLONE_REF — the same override for the dev clone's identity. */
  cloneRefPath?: string;
  /** `--confirm-chair-step <file>` — the basenames this command NAMED. A chair step at
   *  `--target production` runs only when its own basename is here (scripts/lib/chair-step.ts). */
  confirmedChairSteps?: readonly string[];
  /** `--pair <file.sql>` — sibling file(s) of THIS apply whose bytes carry the D249
   *  re-record. Judged together with the file being applied; see the kernel pairing
   *  refusal in applyFile. */
  pairedWith?: readonly string[];
  /** `--judged-as-of <production applied_at>` (clone only) — the nightly catch-up's grandfathering:
   *  a refusing rule introduced AFTER this moment prints "ran under older rules" instead
   *  (scripts/lib/migration-rule-dates.ts; chair ruling 2026-09-26, rule 2). */
  judgedAsOf?: Date | null;
}

/** Apply ONE file. The whole of db:apply lives here so --self-test exercises
 *  exactly the code an agent runs, not a paraphrase of it. */
async function applyFile(path: string, opts: ApplyOpts): Promise<number> {
  const { dryRun, reapply, statementTimeout, target, campaignSource, lane } = opts;
  const branchRefPath = opts.branchRefPath;
  const cloneRefPath = opts.cloneRefPath;
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
        `    pnpm db:rehearse ${relative(ROOT, path)} --target clone --source ${CAMPAIGN_SOURCE} --lane <lane>\n` +
        `  and then the same file with pnpm db:apply … --target production. A rehearsal on the\n` +
        `  clone is a convenience, never a precondition (JUDGMENT §6a).\n` +
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
        `  Every campaign apply is attributable to ONE lane: the lane id goes into the ledger\n` +
        `  row (applied_by_lane) and is part of the production authorisation. Pass --lane <lane id>.`,
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

  const draft = draftMarker(sql);
  if (draft && target === "production") {
    console.error(
      `${TAG.fail}${filename} is a DRAFT by ${draft.owner}${draft.reason ? ` (${draft.reason})` : ""} ` +
        `and does not go to production — ${DRAFT_REMEDY}.`,
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
  // ── THE GROUND-STANDING RATCHET, READ AT APPLY TIME ────────────────────────
  //
  // GATES-2, 2026-09-22, on VERIFIER-12's finding. `check:inverses-leave-the-ground-standing`
  // has a ZERO baseline, so the class is closed the moment a lane re-runs it — and inverses are
  // being written faster than any lane re-runs anything. The red population turned over
  // COMPLETELY three times in about twelve hours: FIX-11B closed VERIFIER-11's pair and reported
  // 0/0/0/0; the next sweep was red on FIX-10B's `table_archive` inverse and STORE-TAILS-2's
  // `field_words` one; those were closed, and within the hour it was red again on CHOICE-VAL's
  // `choice_synonyms`, ENRICH's `pin_agent_cells` and WRITE-PERF-4's `memo_k_get`/`memo_k_put`.
  // Every one of them had been ledgered before anybody looked. A ratchet only read at release
  // time is a ratchet the writer never meets.
  //
  // So it is read HERE, on the file about to run, before a connection exists — the same place
  // and the same rules as the kernel-pairing judgement above: at every target, not softened by
  // --dry-run or --reapply. It fires on a file under `migrations/inverse/`, and on an up-file
  // that SHIPS one (a sibling `<stem>_down.sql`), because that is the moment its author is
  // holding both halves. The judgement is not re-implemented: `judgeOneInverse` builds the same
  // applied tree and the same family graph the release arm builds and narrows the findings to
  // this file. Its own RED-then-GREEN proof is `pnpm check:migration-ground-gate:self-test`.
  {
    const inverseDirPath = resolve(MIGRATIONS_DIR, INVERSE_DIRNAME);
    const isInverse = !relative(inverseDirPath, path).startsWith("..");
    const stem = filename.replace(/\.sql$/, "");
    const sibling = resolve(inverseDirPath, `${stem}_down.sql`);
    const judged: Array<{ base: string; raw: string | undefined }> = isInverse
      ? [{ base: filename, raw: sql }]
      : existsSync(sibling)
        ? [{ base: `${stem}_down.sql`, raw: undefined }]
        : [];

    for (const { base, raw } of judged) {
      let findings;
      try {
        findings = judgeOneInverse(base, raw);
      } catch (err) {
        console.error(
          `${TAG.fail}the inverse ground gate could not answer for ${base}: ` +
            `${err instanceof Error ? err.message : String(err)}. An unmeasured ratchet is not a pass.`,
        );
        return 1;
      }
      if (findings.length > 0) {
        console.error(
          `${TAG.fail}${base} ${C.bold}takes the ground out from under the platform${C.reset} — ` +
            `${findings.length} finding(s). Nothing was applied and no ledger row was written.`,
        );
        for (const f of findings) console.error(`  (${f.clause}) ${f.what}`);
        console.error(
          `  ${C.dim}An inverse puts a DEFECT back; it may not break the platform doing it. ` +
            `(a) detach the trigger before you drop the body it runs; (b) restore the callee or ` +
            `say which sibling is meant to run; (c) point the file at the body a live trigger ` +
            `actually calls; (d) leave the object standing and neuter the behaviour instead. ` +
            `A file that has looked at a clause and handled it says so in its own bytes: ` +
            `\`-- ground-standing-ok: <clauses>\`. Refused at every target; --dry-run and ` +
            `--reapply do not soften it.${C.reset}`,
        );
        return 1;
      }
    }
  }

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

  // ── POLICY-LOCK (2026-09-22): A POLICY CHANGE NEVER RIDES INSIDE A LONG FILE ──────────────
  //
  // Every CREATE/ALTER/DROP POLICY run as `postgres` takes ACCESS EXCLUSIVE on 23 `auth.*`,
  // `storage.*` and `realtime.*` relations (Supabase's own `supautils.policy_grants` hook — not
  // ours, not switchable, `sighup` from their configuration file) and PostgreSQL holds them
  // until COMMIT. Nobody signs in, refreshes a token, reads a file or receives a realtime
  // message for the duration. This runner owns the transaction and runs ONE FILE INSIDE IT, so
  // THE LENGTH OF THE FILE IS THE LENGTH OF THE OUTAGE.
  //
  // So a campaign file that carries policy DDL carries nothing else: policy statements, the
  // grants and comments that belong with them, and `set local`. A table creation, a backfill or
  // a function replace goes in a second file. Refused here, on the bytes, before a connection
  // exists, at every target — not softened by --dry-run or --reapply, because a dry run that
  // passes a file the real run would refuse is how the rule gets discovered at 2 a.m.
  if (inCampaign) {
    const verdict = policyOnlyVerdict(sql);
    if (verdict.policy.length > 0 && verdict.strangers.length > 0) {
      if (POLICY_MIXED_GRANDFATHERED.includes(filename)) {
        console.error(
          `${TAG.warn}${filename} mixes policy DDL with other DDL and is on the POLICY-LOCK ` +
            `grandfather list (written before the rule, bytes frozen). It is NOT a precedent: ` +
            `a new file is split.`,
        );
      } else {
        console.error(
          `${TAG.fail}${filename} ${C.bold}changes a policy AND does other work in the same ` +
            `transaction${C.reset}, and a policy change freezes sign-in, file reads and realtime ` +
            `for as long as that transaction lasts.\n` +
            `  The policy statement(s):\n` +
            verdict.policy.map((p) => `    ${p.why}: ${p.stmt.slice(0, 110)}`).join("\n") +
            `\n  May not ride with them (${verdict.strangers.length}):\n` +
            verdict.strangers.map((t) => `    ${t.slice(0, 110)}`).join("\n") +
            `\n  ${C.dim}Split it: one POLICY-ONLY file (policy/grant/comment/set local) and one ` +
            `for the rest. Nothing was applied and no ledger row was written. Measured on the dev ` +
            `clone 2026-09-22: one CREATE POLICY takes ACCESS EXCLUSIVE on 23 auth/storage/realtime ` +
            `relations and holds them to COMMIT.${C.reset}`,
        );
        return 1;
      }
    }
  }

  // ── WINDOW-CLASS (2026-09-22): TRIGGER DDL ON A PARTITIONED PARENT RUNS AT NIGHT ─────────
  //
  // Measured on the dev clone by lane TRIGGER-LOCK, statement by statement (the table is in
  // `scripts/night/README.md`):
  //   · `drop trigger` on `custom.record`  — ACCESS EXCLUSIVE on 40 relations: the parent, all
  //     16 partitions, and the same 23 auth/storage/realtime relations a policy change freezes.
  //     Nobody signs in, refreshes a token, reads a file or gets a realtime message until it
  //     commits. (~810 ms, lane OLD-TABLES-1.)
  //   · `create trigger` and `alter table … enable/disable trigger` — SHARE ROW EXCLUSIVE on
  //     the parent and all 16 partitions, nothing from the supautils set: readers and sign-in
  //     are fine, every WRITE to the record store is blocked for the transaction.
  // The fan-out is PostgreSQL's own — a scratch hash-partitioned table behaves identically — so
  // it scales with the partition count, and `history.row_versions` has 29.
  //
  // So a file carrying that DDL is WINDOW-CLASS: it declares itself in its own header, and at
  // `--target production` it runs in the 1-4 AM Pacific maintenance window and nowhere else.
  // Refused on the bytes and on the clock, before a connection exists. The declaration is
  // required at EVERY target, because its point is that the operator reading the file at 3 a.m.
  // — and the abort checklist running its inverse — sees the freeze coming without measuring it
  // again.
  if (inCampaign || inInverse) {
    const sites = windowClassVerdict(sql);
    if (sites.length > 0 && !WINDOW_CLASS_GRANDFATHERED.includes(filename)) {
      const tables = [
        ...new Set(sites.map((x) => (x.partitions > 0 ? `${x.table} (+${x.partitions} partitions)` : x.table))),
      ];
      const worst =
        sites.find((x) => x.mode === "ACCESS EXCLUSIVE")?.mode ?? sites[0]!.mode;
      const consequence = sites.some((x) => x.freezesSignIn)
        ? `nobody able to sign in, refresh a token, read a file or receive a realtime message ` +
          `until it commits — this statement class drags in the 23 auth/storage/realtime ` +
          `relations Supabase's supautils.policy_grants hook declares (measured, ` +
          `scripts/lib/ddl-lock-footprint.json)`
        : sites.some((x) => x.mode === "ACCESS EXCLUSIVE")
          ? `every READER and every WRITER of the partitioned store blocked for the length of ` +
            `the transaction (sign-in is untouched by this kind)`
          : `every WRITER to the partitioned store blocked for the length of the transaction ` +
            `(readers and sign-in are untouched by this kind)`;
      const declared = windowClassDeclaration(sql);
      if (!declared) {
        console.error(
          `${TAG.fail}${filename} ${C.bold}carries DDL whose MEASURED lock footprint freezes the ` +
            `estate, and does not declare itself window-class${C.reset}.\n` +
            `  The statement(s), with what each one actually takes ` +
            `${C.dim}(measured ${DDL_LOCK_FOOTPRINT.measuredOn})${C.reset}:\n` +
            sites
              .map(
                (x) =>
                  `    ${x.why} on ${x.table} — ${x.mode}${x.freezesSignIn ? " + the 23-relation supautils set" : ""}\n` +
                  `      ${x.because}\n` +
                  `      ${x.stmt.slice(0, 100)}`,
              )
              .join("\n") +
            `\n  Worst of them is ${worst} across ${tables.join(", ")}: ${consequence}.\n` +
            `  Add a header line saying why, e.g.\n` +
            `      -- window-class: drop+recreate of the record write trigger; 40 relations frozen\n` +
            `  and apply it between ${String(WINDOW_CLASS_OPEN_HHMM).padStart(4, "0")} and ` +
            `${String(WINDOW_CLASS_CLOSE_HHMM).padStart(4, "0")} Pacific. Nothing was applied and ` +
            `no ledger row was written.`,
        );
        return 1;
      }
      // THE ONE VERIFIED EXEMPTION (chair ruling 2026-09-22). A single table's policy
      // regeneration, measured under 200 ms on the clone for THESE EXACT BYTES, may run at
      // midday. The runner proves both halves itself; the header alone proves nothing.
      const oneTable = policyDdlOneTableVerdict(sql, path, sites);
      if (target === "production" && !isInsideWindow() && oneTable.refusal) {
        console.error(
          `${TAG.fail}${filename} claims the ${C.bold}\`-- policy-ddl: one-table\`${C.reset} ` +
            `exemption and does not have it:\n  ${oneTable.refusal}\n` +
            `  ${C.dim}Nothing was applied and no ledger row was written. The exemption is ` +
            `VERIFIED, never asserted — that is the whole difference between it and a force ` +
            `flag.${C.reset}`,
        );
        return 1;
      }
      if (target === "production" && !isInsideWindow() && oneTable.exempt) {
        console.log(
          `${TAG.ok}policy-ddl: one-table ${C.dim}— ${oneTable.table}, measured ` +
            `${oneTable.measuredMs} ms first policy statement → end of transaction on the clone ` +
            `(ceiling ${POLICY_DDL_ONE_TABLE_MAX_MS} ms). Window waived, on the measurement.${C.reset}`,
        );
      } else if (target === "production" && !isInsideWindow()) {
        const now = String(pacificHHMM()).padStart(4, "0");
        console.error(
          `${TAG.fail}${filename} is ${C.bold}window-class${C.reset} — "${declared}" — and local ` +
            `Pacific time is ${now}, outside ${String(WINDOW_CLASS_OPEN_HHMM).padStart(4, "0")}-` +
            `${String(WINDOW_CLASS_CLOSE_HHMM).padStart(4, "0")}.\n` +
            `  Applying it now would take ${worst} on ${tables.join(", ")} in the middle of the ` +
            `day: ${consequence}.\n` +
            `  ${C.dim}Run it in the window. Nothing was applied and no ledger row was written. ` +
            `There is no flag that removes the window — that switch was itself the defect on ` +
            `2026-09-21 (scripts/night/lib-night.sh).${C.reset}`,
        );
        return 1;
      }
      console.log(
        `${TAG.ok}window-class ${C.dim}— "${declared}" · ${sites.length} measured statement(s), ` +
          `worst ${worst}, on ${tables.join(", ")}${C.reset}`,
      );
    }
  }

  // ── --target: WHICH database, refused BEFORE a connection exists ──────────
  // The environment SELECTS a connection; it has never AUTHORISED one. Both
  // databases are named `postgres` and both connect as `postgres`, so until this
  // existed nothing in this runner could tell the rehearsal branch from
  // production. See scripts/lib/migration-target.ts.
  let branchRef: BranchRef;
  /**
   * CLONE-REF, the nightly dev clone's identity. Loaded for EVERY apply, not only
   * `--target clone`: the production half needs it to refuse a connection that IS the
   * clone, and that refusal is the only one there can be — the clone is a physical
   * restore and answers `pg_control_system()` with production's own number.
   *
   * At `--target clone` an unreadable CLONE-REF is a REFUSAL (below). At every other
   * target it is a LOUD degradation, not a silent one: the cross-check is announced as
   * unavailable and the server-side quarantine check still stands on its own.
   */
  let cloneRef: CloneRef | null = null;
  let cloneRefWhyNot: string | null = null;
  let guard: { feature: string; key: string } | null = null;
  /** Set when `--reapply --target branch` passed the header rule only on the branch-ledger
   *  amnesty; the ledger read must then prove the branch holds these exact bytes. */
  let branchLedgeredReapply: string | null = null;
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
    try {
      cloneRef = loadCloneRef(ROOT, cloneRefPath);
    } catch (err) {
      if (target === "clone") throw err;
      cloneRef = null;
      cloneRefWhyNot = err instanceof Error ? err.message.split("\n")[0]! : String(err);
    }
    try {
      ({ guard, revokeExemption, chairStep, customDataInserts } = assertHeaderAgreesWithFlag({
        basedOnNames: basedOnFunctionNames(sql),
        filename,
        flagTarget: target,
        header,
        strippedSql: stripped,
      }));
    } catch (headerErr) {
      // 🚨 BODY DRIFT ON THE BRANCH (lane BRANCH-REFRESH-4, 2026-09-24). The branch carries
      // production's LEDGER (the refresh copies it), so a production-only file can sit in the
      // branch's ledger as applied while the branch holds an OLDER body: `platform.knob_archive`
      // kept its pre-knobguard2 body there while the ledger listed knobguard2. The header rule
      // above then refused the one repair that re-runs the ledgered bytes. So `--reapply` at
      // `--target branch` admits a header-less or non-branch file ONLY when the branch's own
      // ledger already holds THIS filename with THIS checksum — re-executing bytes the branch
      // says it ran, never a new file. Proven after the ledger read below; nothing else in the
      // verdict is skipped, and no other target is touched.
      if (
        target === "branch" &&
        reapply &&
        headerErr instanceof TargetRefusal &&
        (headerErr.code === "branch-needs-target-header" || headerErr.code === "header-flag-disagree")
      ) {
        branchLedgeredReapply = headerErr.message;
        ({ guard, revokeExemption, chairStep, customDataInserts } = assertHeaderAgreesWithFlag({
          basedOnNames: basedOnFunctionNames(sql),
          filename,
          flagTarget: target,
          header,
          strippedSql: stripped,
          branchLedgeredReapply: true,
        }));
      } else {
        throw headerErr;
      }
    }
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
  // The campaign's production authorisation (no branch — see reportCampaignClonePair). `--lane`
  // was required above; the `-- based-on:` hashes are recomputed against production right before
  // the file executes; the clone pair is read and printed, on --dry-run too, and never refuses.
  if (inCampaign && target === "production") {
    const note = await reportCampaignClonePair(filename, sql, cloneRef);
    console.log(
      `${TAG.ok}campaign authorisation ${C.dim}— lane ${lane}; no branch read (deleted 2026-09-26); ` +
        `based-on recomputed on production before execution; clone pair: ${note}${C.reset}`,
    );
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
  } else if (target === "clone") {
    // 🚨 THE CLONE'S OWN CONNECTION VARIABLES, AND NOTHING ELSE. CLONE_DATABASE_URL (the
    // whole DSN), or CLONE-REF's checked-in identities plus the password file it names.
    // There is NO fallback to the five SUPABASE_MATRIX_* — they point at production, and
    // production and the clone are indistinguishable by everything except the project
    // ref in the connection.
    try {
      const c = loadCloneDbEnv(ROOT, cloneRef!);
      env = { ...c };
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
    if (target === "production" && !cloneRef) {
      console.warn(
        `${TAG.warn}CLONE-REF could not be read, so the "is this connection actually the dev ` +
          `clone?" cross-check is UNAVAILABLE for this production apply — ${cloneRefWhyNot}\n` +
          `  The server-side quarantine check still runs. Say so in any report; this is a ` +
          `degraded run, not a clean one.`,
      );
    }
    try {
      assertConfiguredHostMatchesTarget(env, target, branchRef, cloneRef);
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
        cloneRef,
      );
      const connRef = projectRefOf(env.user, env.host);
      console.log(
        `${TAG.ok}target ${C.bold}${target}${C.reset} ${C.dim}(server system_identifier ${sysid}, ` +
          `project ref ${connRef || "(none)"}, from ` +
          `${target === "clone" && cloneRef ? cloneRef.path : branchRef.path})${C.reset}`,
      );
      if (target === "clone") {
        console.log(
          `${TAG.ok}quarantine ${C.bold}confirmed${C.reset} ${C.dim}— pg_net absent and no active ` +
            `pg_cron job, which is never true of production. A data clone reports its PARENT's ` +
            `system_identifier, so this and the project ref are the identity.${C.reset}`,
        );
      }
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
    if ((target === "production" || target === "clone") && headerNamesProduction && !guard) {
      console.log(
        `${TAG.ok}guard ${C.bold}-- seeds-guards: yes${C.reset} ${C.dim}— this file seeds the ` +
          `knob register itself and touches nothing else${C.reset}`,
      );
    }
    // The clone carries production's knob register (it is a physical copy of it), so a
    // guarded file rehearses here under exactly the condition it will land on production
    // under: its knob exists and resolves OFF. A rehearsal that skipped this would not be
    // a rehearsal of the production apply.
    if (guard && (target === "production" || target === "clone")) {
      try {
        const verdict = await assertGuardResolvesOff(
          (text) => client.query(text) as Promise<{ rows: Array<Record<string, unknown>> }>,
          guard,
          filename,
        );
        // TWO VERDICTS, TWO SENTENCES. Printing "resolves false — the old path is untouched"
        // over a knob the owner has turned ON would be a screen telling a lie (STORE-ON,
        // 2026-09-23), directly under the banner that just said the opposite.
        console.log(
          verdict === "off"
            ? `${TAG.ok}guard ${C.bold}${guard.feature}/${guard.key}${C.reset} ` +
                `${C.dim}resolves false — the old path is untouched by this apply${C.reset}`
            : `${TAG.ok}guard ${C.bold}${guard.feature}/${guard.key}${C.reset} ` +
                `${C.dim}resolves TRUE — the owner turned it on, so this apply is LIVE (see above)${C.reset}`,
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

    if (branchLedgeredReapply !== null) {
      if (!existing || existing.checksum !== checksum) {
        console.error(
          `${TAG.fail}${branchLedgeredReapply}\n` +
            `  --reapply at --target branch admits this file only when the BRANCH's own ledger already\n` +
            `  holds ${filename} with checksum ${checksum.slice(0, 12)} — levelling a body the branch says\n` +
            `  it ran. The branch ledger holds ${existing ? existing.checksum.slice(0, 12) : "no row for it"}. Refusing.`,
        );
        return 1;
      }
      console.log(
        `${TAG.warn}--reapply on the branch: ${filename} carries no branch header, and the branch's ledger ` +
          `already holds these exact bytes (applied ${existing.applied_at}) — re-executing them to level a ` +
          `body that drifted under a standing ledger row (scripts/night/body-drift.sh).`,
      );
    }

    // THE LEDGER HOLDS ONE OF TWO HASHES OF THE SAME BYTES (CS-30): this runner writes
    // sha256(sql); aidream's writes sha256(sql.rstrip()). Comparing against only the first made
    // this runner say "the file on disk is not the bytes that ran" about every file the release
    // sweep applied with a trailing newline — rca5d_c on 2026-09-26 (8abf1a83 IS these bytes).
    const ledgerHoldsTheseBytes =
      existing !== null &&
      (existing.checksum === checksum || existing.checksum === sha256(sql.replace(/\s+$/, "")));
    if (existing) {
      if (ledgerHoldsTheseBytes && !reapply) {
        console.log(
          `${TAG.ok}Already applied, byte-identical (ledgered ${existing.applied_at}). Nothing to do.`,
        );
        return 0;
      }
      if (ledgerHoldsTheseBytes) {
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
        // 🚨 A ROW FOR DRAFT BYTES IS NOT A RECORD OF A RUN (D351, 2026-09-26). aidream's
        // detect_applied ledgered rca5d_j's DRAFT at 22:44 PT without executing it (its function
        // names already existed); once the draft line came off, this refusal told the lane
        // "the file on disk is not the bytes that ran" — as if the finished fix had been
        // superseded — and the fix would silently never have run. Say what the row really is.
        const was = ledgeredBytesFromGit(relative(ROOT, path), existing.checksum);
        const wasDraft = was ? draftMarker(was.bytes) : null;
        if (wasDraft || existing.duration_ms === 0) {
          console.error(
            `${TAG.fail}${filename} is ledgered (${existing.applied_at}) for ` +
              (wasDraft
                ? `a DRAFT of this file by ${wasDraft.owner} (commit ${was!.commit.slice(0, 10)})`
                : `other bytes, by a LEDGER-ONLY path (duration 0 ms: detect_applied / --mark-applied)`) +
              ` — that row records nothing that executed.\n` +
              `  These finished bytes have NEVER run on this database. Execute them:\n` +
              `    pnpm db:apply ${relative(ROOT, path)} --target ${target} --reapply\n` +
              `  (--reapply runs the whole file in one transaction and re-points the row at what ran.)`,
          );
          return 1;
        }
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
      // 🚨 GRANDFATHERING (chair ruling 2026-09-26, rule 2). A finding raised by a rule younger than
      // the moment production ran this file is history production was never held to: announced,
      // not refused. Only ever at --target clone (the flag is refused elsewhere, in main()).
      const olderRules = based.findings
        .map((f) => ({ f, why: f.rule ? ranUnderOlderRules(f.rule, opts.judgedAsOf ?? null) : null }))
        .filter((x) => x.why !== null);
      for (const { f, why } of olderRules)
        console.log(`${TAG.warn}${filename}: ${f.signature} — ${why}`);
      const standing = based.findings.filter((f) => !olderRules.some((x) => x.f === f));
      based = { ...based, findings: standing };
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

    // 🚨 A FILE MAY NOT RAISE ITS OWN LOCK WAIT (lane LOCK-QUEUE, 2026-09-25). Its own
    // `set lock_timeout = '30s'` beats the 2s below, and while that DDL waits for its lock every
    // later reader of the table waits behind it — auth.users at 06:50 UTC, iam.permissions at
    // 13:26 UTC that day. Refused before a byte runs, by file and line.
    // See scripts/lib/migration-lock-policy.ts.
    const statementCeilingMs = parseDurationMs(statementTimeout) || Number.POSITIVE_INFINITY;
    let overrides = timeoutOverrideFindings(sql, statementCeilingMs);
    const lockOlder = overrides.length ? ranUnderOlderRules("lock-timeout-ceiling", opts.judgedAsOf ?? null) : null;
    if (lockOlder) {
      for (const f of overrides) console.log(`${TAG.warn}${overrideSentence(filename, f)} — ${lockOlder}`);
      overrides = [];
    }
    if (overrides.length) {
      console.error(
        `${TAG.fail}${filename} raises its own lock wait or statement ceiling past this runner's. ` +
          `While a DDL waits for a lock, every later reader of that table waits behind it (the lock ` +
          `queue is FIFO). Nothing was applied, no ledger row was written.`,
      );
      for (const f of overrides) console.error(`  ${C.red}- ${overrideSentence(filename, f)}${C.reset}`);
      return 1;
    }
    // THE TRANSACTION CEILING: on Postgres 17+ the whole transaction — and so every lock the
    // file holds — is bounded at the statement ceiling. Older servers do not know the setting.
    const serverVersionNum = Number(
      (await client.query<{ v: string }>(`select current_setting('server_version_num') as v`)).rows[0]?.v ?? 0,
    );
    const transactionCeiling =
      serverVersionNum >= TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM &&
      statementCeilingMs !== Number.POSITIVE_INFINITY
        ? `set local transaction_timeout = '${statementTimeout}';\n`
        : ``;

    // The prologue and the ledger upsert are their own statements so the FILE is
    // a payload of exactly its own bytes — which is what makes a Postgres error
    // `position` point at a line in the file.
    const prologue =
      `set local lock_timeout = '${LOCK_TIMEOUT}';\n` +
      `set local statement_timeout = '${statementTimeout}';\n` +
      `set local idle_in_transaction_session_timeout = '${IDLE_IN_TRANSACTION_CEILING}';\n` +
      transactionCeiling +
      `select set_config('matrx.db_apply_t0', clock_timestamp()::text, true);`;
    // A CONFIRMED CHAIR STEP IS LOGGED TO THE LEDGER (ATTACK-6 finding 4). The
    // column is added idempotently on the one path that writes it, so the record of
    // who waived the additive rule and why outlives the command that named it.
    // Nullable, no default, no live reader — every other insert names its columns.
    const chairStepLog = chairStepConfirmed
      ? `alter table public._schema_migrations add column if not exists chair_step text;\n`
      : ``;
    // 🚨 THE CLONE'S LEDGER IS PRODUCTION'S LEDGER PLUS REHEARSAL ROWS, AND THE
    // REHEARSAL ROWS SAY SO.
    //
    // The clone is a physical restore, so it arrives carrying production's whole
    // `public._schema_migrations` — every row production had at the moment of the
    // snapshot. A rehearsal then writes rows into that copy. Two things follow, and
    // both are why the mark exists rather than being nice-to-have:
    //   · a row written here is NOT evidence that anything landed on production, and
    //     anybody reading this table on the clone has to be able to tell the two apart
    //     without knowing which day the snapshot was taken;
    //   · the next nightly refresh THROWS THESE ROWS AWAY, because it restores
    //     production again. That overwrite is expected, and a marked row says so in
    //     the row itself instead of in a document nobody opens at 3 a.m.
    // Added idempotently on the one path that writes it, exactly as `chair_step` is:
    // nullable, no default, no live reader, and production never gets the column.
    const rehearsalMark =
      target === "clone" && cloneRef
        ? `rehearsal on the dev clone ${cloneRef.cloneRef} (${cloneRef.cloneName}) by ` +
          `${process.env.USER ?? "unknown"} — NOT a production apply; the next nightly clone ` +
          `refresh restores production over this row, which is expected`
        : null;
    // 🚨 THE COLUMN IS ADDED OUTSIDE THE TRANSACTION, AND ONLY WHEN IT IS ACTUALLY
    // ABSENT. `alter table … add column if not exists` is not free even when the column
    // is already there: it still takes ACCESS EXCLUSIVE on `public._schema_migrations`,
    // so carrying it inside every clone apply's transaction means every clone apply
    // queues behind anything holding a share lock on the ledger — measured 2026-09-22,
    // where the nightly schema dump's open transaction made the whole apply die with
    // `55P03 canceling statement due to lock timeout` before it executed one byte of the
    // migration. A migration must not fail because of the bookkeeping around it.
    if (rehearsalMark) {
      const has = await client.query<{ n: string }>(
        `select count(*)::text as n from information_schema.columns
          where table_schema = 'public' and table_name = '_schema_migrations'
            and column_name = 'rehearsal_on'`,
      );
      if (has.rows[0]?.n === "0") {
        // 🚨 AND IT WAITS, BECAUSE THE THING IT WAITS FOR IS ROUTINE. The clone is where
        // the nightly schema dump runs, and pg_dump holds ACCESS SHARE on every table for
        // its whole run — measured 2026-09-22, a dump transaction open for 5m40s made this
        // one-statement catalog change die instantly at the runner's 2s lock_timeout. A
        // rehearsal must not fail because a scheduled dump happened to be running, and the
        // column is gone again after every nightly refresh, so this is not a one-off setup
        // step somebody can do by hand. Four attempts at 15s, each announced by name.
        const ATTEMPTS = 4;
        let added = false;
        let lastErr: unknown = null;
        for (let attempt = 1; attempt <= ATTEMPTS && !added; attempt += 1) {
          try {
            await client.query(`set lock_timeout = '15s'`);
            await client.query(
              `alter table public._schema_migrations add column if not exists rehearsal_on text`,
            );
            added = true;
          } catch (err) {
            lastErr = err;
            const blocker = await client
              .query<{ who: string }>(
                `select coalesce(string_agg(distinct
                          'pid ' || pid || ' (' || coalesce(nullif(application_name, ''), 'unnamed') ||
                          ', ' || state || ', open ' || date_trunc('second', now() - xact_start) || ')', '; '),
                        '(nothing visible)') as who
                   from pg_stat_activity
                  where xact_start is not null and pid <> pg_backend_pid()
                    and state = 'idle in transaction'`,
              )
              .then((r) => r.rows[0]?.who ?? "(unreadable)")
              .catch(() => "(unreadable)");
            if (attempt < ATTEMPTS) {
              console.warn(
                `${TAG.warn}waiting for ACCESS EXCLUSIVE on public._schema_migrations to add ` +
                  `rehearsal_on (attempt ${attempt}/${ATTEMPTS}) — held open by ${blocker}`,
              );
            } else {
              console.error(
                `${TAG.fail}could not add public._schema_migrations.rehearsal_on on the clone after ` +
                  `${ATTEMPTS} attempts — ${formatPgError(lastErr)}\n` +
                  `  Holding a transaction open right now: ${blocker}\n` +
                  `  Without that column a rehearsal row here is indistinguishable from the production ` +
                  `rows this ledger is a physical copy of, so this runner refuses rather than writing ` +
                  `an unmarked one. Nothing was applied, no ledger row was written.\n` +
                  `  Remedy: re-run once the nightly schema dump has finished — it holds ACCESS SHARE ` +
                  `on every table for its whole run, and nothing here should force it off.`,
              );
              await client.query(`set lock_timeout = '${LOCK_TIMEOUT}'`).catch(() => undefined);
              return 1;
            }
          }
        }
        await client.query(`set lock_timeout = '${LOCK_TIMEOUT}'`).catch(() => undefined);
        console.log(
          `${TAG.ok}added public._schema_migrations.rehearsal_on on the clone ` +
            `${C.dim}(nullable, no default, no live reader — the mark a rehearsal row carries; it is ` +
            `gone again after every nightly refresh, which is why the runner adds it)${C.reset}`,
        );
      }
    }
    // 🚨 WHO APPLIED THIS ROW (lane LEDGER-LANE, 2026-09-23). Two production applies landed
    // outside the window on 2026-09-23 and the ledger could not say whose they were. Every row
    // this runner writes now carries the lane, the OS user, the host, the agent session, the
    // process chain and the HEAD of the checkout the file came from; the database computes
    // `applied_in_window` in the same transaction. A ledger that lacks the columns (production
    // until the chair applies ledgerlane_a_ledger_row_names_who_applied_it.sql) gets the row
    // WITHOUT them, and this says so — never a refusal, never silence.
    // The columns are read AGAIN inside the transaction, after the file ran and immediately
    // before the ledger insert: the file itself may be the one that adds them (the up) or drops
    // them (its inverse), and an insert naming a column that is not there fails the whole apply.
    const attribution = collectAttribution(path, lane);
    const attrQ = (text: string) => client.query(text) as Promise<{ rows: Array<Record<string, unknown>> }>;
    const attrParts = attributionUpsertParts(attribution, lit);
    let attrMissing: string[] = [];
    const buildLedgerUpsert = (attr: typeof attrParts | null) =>
      chairStepLog +
      `insert into public._schema_migrations (source, filename, checksum, duration_ms` +
      (chairStepConfirmed ? `, chair_step` : ``) +
      (rehearsalMark ? `, rehearsal_on` : ``) +
      (attr ? `, ${attr.cols.join(", ")}` : ``) +
      `)\n` +
      `values (${lit(SOURCE)}, ${lit(filename)}, ${lit(checksum)},\n` +
      `        greatest(1, (extract(epoch from clock_timestamp()\n` +
      `                     - current_setting('matrx.db_apply_t0')::timestamptz) * 1000)::int)` +
      (chairStepConfirmed
        ? `,\n        ${lit(`${chairStepConfirmed} — named with --confirm-chair-step by ${process.env.USER ?? "unknown"}`)}`
        : ``) +
      (rehearsalMark ? `,\n        ${lit(rehearsalMark)}` : ``) +
      (attr ? `,\n        ${attr.values.join(",\n        ")}` : ``) +
      `)\n` +
      `on conflict (source, filename) do update set\n` +
      `  checksum = excluded.checksum, applied_at = now(), duration_ms = excluded.duration_ms` +
      (chairStepConfirmed ? `, chair_step = excluded.chair_step` : ``) +
      // A row COPIED FROM PRODUCTION that a rehearsal overwrites must stop looking like
      // production's row the moment it is overwritten. That is the whole conflict case.
      (rehearsalMark ? `, rehearsal_on = excluded.rehearsal_on` : ``) +
      // A --reapply EXECUTES again, so the row is re-attributed to whoever executed it this time.
      (attr ? `,\n  ${attr.sets.join(", ")}` : ``) +
      `;`;

    let ledgerUpsert = buildLedgerUpsert(
      (await attributionColumnsPresent(attrQ)).present ? attrParts : null,
    );
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
      // LOCK TIMEOUT → BOUNDED, JITTERED RETRY (lane LOCK-QUEUE, 2026-09-25). Each attempt waits at
      // most LOCK_TIMEOUT for any lock, so readers queued behind it wait seconds, and the gap between
      // attempts lets that queue drain. Always safe here: this runner refuses a file carrying its own
      // transaction control, so a lock timeout rolls the WHOLE attempt back.
      for (let attempt = 1; ; attempt += 1) {
        try {
          await beginClean(client);
          await client.query(prologue);
          await client.query(sql);
          // CLOSE THE ROW FIRST, THEN REVOKE (STORE-TXN-3's class, lane ARGS-RULED-2). Read the END
          // state of every door this file revokes, inside the transaction, before anything commits:
          // a REVOKE that platform.reopen_declared_doors undid, or one that left grant and register
          // disagreeing, rolls the whole file back. See scripts/migration-revoke-order.ts.
          const revokeFindings = await revokeOrderFindings(
            async (text, params) =>
              (await client.query(text, (params ?? []) as never[])).rows as Record<string, unknown>[],
            sql,
          );
          if (revokeFindings.length) throw new RevokeOrderRefusal(filename, revokeFindings);
          const attrNow = await attributionColumnsPresent(attrQ);
          attrMissing = attrNow.missing;
          ledgerUpsert = buildLedgerUpsert(attrNow.present ? attrParts : null);
          await client.query(ledgerUpsert);
          await client.query("commit");
          break;
        } catch (err) {
          if (!isLockTimeout(err) || attempt >= LOCK_RETRY_ATTEMPTS) throw err;
          await client.query("rollback").catch(() => undefined);
          const wait = backoffSeconds(attempt);
          console.warn(
            `${TAG.warn}${filename}: a lock wait hit ${LOCK_TIMEOUT} (attempt ${attempt}/${LOCK_RETRY_ATTEMPTS}, ` +
              `rolled back whole) — retrying in ${wait.toFixed(1)}s so queued readers drain`,
          );
          await new Promise((r) => setTimeout(r, wait * 1000));
        }
      }
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
    if (attrMissing.length) console.warn(`${TAG.warn}${notRecordedSentence(target, attrMissing)}`);
    else {
      const who = await client
        .query<{ lane: string | null; os_user: string | null; host: string | null; in_window: boolean | null }>(
          `select applied_by_lane as lane, applied_by_os_user as os_user, applied_by_host as host,
                  applied_in_window as in_window
             from public._schema_migrations where source = $1 and filename = $2`,
          [SOURCE, filename],
        )
        .then((r) => r.rows[0] ?? null)
        .catch(() => null);
      if (!who || who.os_user === null) {
        console.error(
          `${TAG.fail}${filename} committed, but its ledger row carries NO attribution although the ` +
            `columns exist. Something else wrote this row after the runner did. Investigate.`,
        );
        return 1;
      }
      console.log(
        `${TAG.ok}attributed — lane ${who.lane ?? "(none named)"}, ${who.os_user}@${who.host}, ` +
          `${who.in_window ? "inside" : "outside"} the 1–4 AM Pacific window ` +
          `${C.dim}(pnpm ledger:who ${filename})${C.reset}`,
      );
    }
    // Allowed, never refused (a function-body chair step may run outside the window on the
    // chair's word) — the point is that the apply is NAMED, out loud, at the moment it happens.
    if (target === "production" && !isInsideWindow()) {
      console.warn(`${TAG.warn}${outsideWindowSentence(filename, attribution)}`);
    }

    // THE CHECKED-IN SNAPSHOT IS WRITTEN BY THE RUNNER, HERE, ON THE ONE PATH THAT CAN
    // KNOW (lane LEDGER-LOCK, 2026-09-22). `migrations/LEDGER.json` is what the pre-commit
    // hook and the `check:ledgered-files-unedited` release gate judge a staged migration
    // against, so it must never be older than the last apply made from this machine — a
    // guard reading a stale snapshot would wave through an edit to a file production ran
    // ten minutes ago. Production applies only: a rehearsal row is not evidence that
    // anything landed, and the next nightly refresh throws it away.
    if (target === "production" && !rehearsalMark) {
      try {
        const recorded = recordAppliedRow({
          relPath: relative(ROOT, path),
          source: SOURCE,
          filename,
          checksum,
          appliedAt: after.applied_at,
        });
        if (recorded) {
          console.log(
            `${TAG.info}${LEDGER_SNAPSHOT_REL} updated for ${recorded} ` +
              `${C.dim}(commit it with the file — the pre-commit hook and ` +
              `check:ledgered-files-unedited read it)${C.reset}`,
          );
        }
      } catch (err) {
        // NEVER silent, and never fatal: the database is already correct and the ledger row
        // is committed. A snapshot this runner could not write is a snapshot the nightly
        // catch-up will rebuild — but the operator hears about it now, with the remedy.
        console.error(
          `${TAG.warn}Applied and ledgered, but ${LEDGER_SNAPSHOT_REL} could not be updated ` +
            `(${(err as Error)?.message ?? String(err)}). Run ${C.white}pnpm refresh:ledger-snapshot` +
            `${C.reset} before committing, or the commit guard will judge these bytes against a ` +
            `stale snapshot.`,
        );
      }
    }
    if (rehearsalMark) {
      console.log(
        `${TAG.info}This ledger row is MARKED \`rehearsal_on\` — it records a rehearsal on the dev ` +
          `clone ${cloneRef!.cloneRef}, not a production apply, and the next nightly clone refresh ` +
          `restores production over it. That overwrite is expected.`,
      );
    }
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
 * `pnpm db:apply --self-test` — the forcing test for this applier, run against a
 * REAL database with a throwaway schema, and SINCE 2026-09-22 THAT DATABASE IS THE
 * NIGHTLY DEV CLONE UNLESS THE COMMAND SPELLS PRODUCTION OUT.
 *
 * 🚨 WHY IT MOVED. This arm CREATES a schema, a table, a function and five ledger
 * rows, sleeps ten seconds inside a transaction, and drops it all again — on
 * whatever database `SUPABASE_MATRIX_*` selects, which is the MAIN one. Lanes run it
 * by reflex, as a "does the runner still work" reflex, several times a night
 * (REHEARSE-STRIP did on 2026-09-22), and the campaign preamble has had to carry a
 * shouted NEVER RUN THIS line since 2026-09-17. A proof that has to be fenced off
 * with a warning in a document is a proof pointed at the wrong database: the clone
 * IS production's cluster, physically restored, so every property below — one
 * transaction, the ledger checksum, the 10-second statement the deleted PostgREST
 * door could not carry, the live `pg_get_functiondef` hash — is proven there exactly
 * as it was proven here, on real catalogues, with nothing at stake.
 *
 * So the target is chosen, never inherited:
 *   · NO `--target`, or `--target clone` → THE CLONE. The default is the safe one.
 *   · `--target production` → allowed, but only when the 1–4 AM Pacific maintenance
 *     window says so (`maintenance-window-and-locks`, Arman 2026-09-21: big routine
 *     jobs run 1–4 AM PT and never hold long locks on the live database). Outside it
 *     the refusal names the clone command.
 *   · `--target branch` → refused: the branch is a thin schema-only rehearsal branch
 *     and `--target-self-test` is the arm that belongs to it.
 *
 * It proves its properties by making them FAIL first:
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
/** PROGRESS-S2: the same rule applied to a DROP FUNCTION this same file recreates. */
const SELFTEST_DROP_FILE = "zz_db_apply_selftest_dd220_drop.sql";
/** `-- retired:` arm: a file the live database has moved past, proven unrunnable. */
const SELFTEST_RETIRED_FILE = "zz_db_apply_selftest_retired.sql";

/**
 * The hour in Pacific time, as the system clock answers it. One reader, so the window
 * and the sentence that names it can never disagree.
 */
export function pacificHour(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}

/** 01:00–03:59 Pacific — the maintenance window (Arman, 2026-09-21). */
export function insideMaintenanceWindow(now: Date = new Date()): boolean {
  const h = pacificHour(now);
  return h >= 1 && h < 4;
}

function pacificClockLine(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(now);
}

/**
 * The target the COMMAND actually named, or null when it named none. `parseTargetFlag`
 * DEFAULTS to production on purpose — every migration written before `--target` existed
 * behaves as it did — and that default is precisely what must not decide where a
 * destructive self-test runs. So this asks the narrower question: did a human type it?
 */
function spelledOutTarget(argv: readonly string[]): Target | null {
  const named = argv.some((a) => a === "--target" || a.startsWith("--target="));
  return named ? parseTargetFlag(argv) : null;
}

async function selfTest(statementTimeout: string, argv: readonly string[]): Promise<number> {
  // ── WHICH DATABASE, decided before a socket exists ────────────────────────
  const asked = spelledOutTarget(argv);
  if (asked === "branch") {
    console.error(
      `${TAG.fail}db:apply --self-test does not run on the rehearsal branch.\n` +
        `  The branch's own proof is \`pnpm db:apply --target-self-test\`, which is what proves the\n` +
        `  --target refusal there. This arm needs production's real catalogues, so it runs on the\n` +
        `  nightly dev clone: \`pnpm db:apply --self-test\` (or --self-test --target clone).`,
    );
    return 1;
  }
  const target: Target = asked === "production" ? "production" : "clone";
  if (target === "production" && !insideMaintenanceWindow()) {
    console.error(
      `${TAG.fail}db:apply --self-test --target production is outside the 1–4 AM Pacific window ` +
        `(it is ${pacificClockLine()} now).\n` +
        `  This arm CREATES schema ${SELFTEST_SCHEMA}, a table, a function and five ledger rows on ` +
        `the database it runs against,\n` +
        `  holds a transaction open for more than ten seconds, and drops it all again. On the MAIN ` +
        `database that is a routine job,\n` +
        `  and routine jobs run 1–4 AM Pacific and nowhere else (Arman, 2026-09-21).\n` +
        `  Run it on the nightly dev clone instead — production's own cluster, physically restored, ` +
        `so every property it proves is the same:\n` +
        `    pnpm db:apply --self-test            ${C.dim}(the clone is the default)${C.reset}\n` +
        `    pnpm db:apply --self-test --target clone\n` +
        `  Nothing was created and nothing was connected to.`,
    );
    return 1;
  }

  let cloneRef: CloneRef | null = null;
  let env: DbEnv | { missing: string[]; looked: string[] };
  if (target === "clone") {
    try {
      cloneRef = loadCloneRef(ROOT, cloneRefOverride(argv));
      env = { ...loadCloneDbEnv(ROOT, cloneRef) };
    } catch (err) {
      console.error(
        `${TAG.fail}db:apply --self-test runs on the dev clone by default and its identity could ` +
          `not be read, so it refuses rather than falling back to production:\n` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return 2;
    }
    console.log(
      `${TAG.ok}self-test target ${C.bold}clone${C.reset} ${C.dim}— ${cloneRef.cloneRef} ` +
        `(${cloneRef.cloneName}), connection from ${(env as DbEnv).from}. Production is reached only ` +
        `by spelling out --target production inside the 1–4 AM Pacific window.${C.reset}`,
    );
  } else {
    env = loadDbEnv();
    console.warn(
      `${TAG.warn}self-test target ${C.bold}PRODUCTION${C.reset} — spelled out, inside the 1–4 AM ` +
        `Pacific window (${pacificClockLine()}). It will create and drop schema ${SELFTEST_SCHEMA} ` +
        `on the MAIN database.`,
    );
  }
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
  const dropRecreatePath = resolve(MIGRATIONS_DIR, SELFTEST_DROP_FILE);
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
    // WHERE the proof runs — the clone unless the command spelled production out inside
    // the maintenance window. `cloneRefPath` rides along so the override a throwaway
    // checkout needs (--clone-ref / MATRX_CLONE_REF) reaches applyFile too.
    target,
    cloneRefPath: cloneRefOverride(argv),
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

    // ── PROGRESS-S2: a DROP FUNCTION that this file recreates ────────────────
    // Lane S3's file DROPped `record_aggregate`/`agg_sql` and re-created them with
    // `CREATE FUNCTION` — no `OR REPLACE`, because the DROP already removed the
    // object — from a stale dump. Proofs 1-5 above scan only for `CREATE OR REPLACE`,
    // so that shape was INVISIBLE to them: the file put an older body back over a
    // peer's change, twice, with no warning (common-docs/projects/data-doctrine-
    // adoption/v5/handoff-2026-09-20/PROGRESS-S2.md). A DROP is also on the deny-list
    // for a header-less file ("a DROP"), so this arm needs a confirmed `-- chair-step:`
    // to get past THAT gate before it can prove the based-on gate underneath it.
    console.log(
      `${C.bold}self-test PROGRESS-S2${C.reset} ${C.dim}(a DROP this file recreates declares the ` +
        `body it destroyed)${C.reset}`,
    );
    const dropHash = String(
      (
        await client.query<{ h: string }>(
          `select encode(sha256(convert_to(pg_get_functiondef(
             to_regprocedure('${SELFTEST_SCHEMA}.probe(text)')), 'utf8')), 'hex') as h`,
        )
      ).rows[0]?.h ?? "",
    );
    if (!/^[0-9a-f]{64}$/.test(dropHash))
      fail(`could not read the live body hash of ${SELFTEST_SCHEMA}.probe(text) before the drop arm`);
    const dropRecreateBody = (note: string) =>
      `-- chair-step: prove the based-on gate under a DROP FUNCTION this file recreates\n` +
      `drop function if exists ${SELFTEST_SCHEMA}.probe(text);\n` +
      `create function ${SELFTEST_SCHEMA}.probe(p_in text)\n` +
      `returns text language sql immutable as $fn$ select ${lit(note)} || p_in $fn$;\n`;
    const dropOpts: ApplyOpts = { ...opts, confirmedChairSteps: [SELFTEST_DROP_FILE] };

    writeFileSync(dropRecreatePath, dropRecreateBody("dropped:"), "utf8");
    const dropNoHeader = await applyFile(dropRecreatePath, dropOpts);
    if (dropNoHeader !== 1)
      fail(`a DROP+recreate with no based-on line exited ${dropNoHeader}, expected 1`);

    const dropStale = sha256("a body this database has never held (drop arm)");
    writeFileSync(
      dropRecreatePath,
      `-- based-on: ${SELFTEST_SCHEMA}.probe(text) ${dropStale}\n${dropRecreateBody("dropped:")}`,
      "utf8",
    );
    const dropStaleCode = await applyFile(dropRecreatePath, dropOpts);
    if (dropStaleCode !== 1)
      fail(`a DROP+recreate with a STALE based-on hash exited ${dropStaleCode}, expected 1`);

    writeFileSync(
      dropRecreatePath,
      `-- based-on: ${SELFTEST_SCHEMA}.probe(text) ${dropHash}\n${dropRecreateBody("dropped:")}`,
      "utf8",
    );
    const dropGoodCode = await applyFile(dropRecreatePath, dropOpts);
    if (dropGoodCode !== 0)
      fail(`a DROP+recreate with the CORRECT based-on hash exited ${dropGoodCode}, expected 0`);
    const dropSays = (
      await client.query<{ v: string }>(`select ${SELFTEST_SCHEMA}.probe('x') as v`)
    ).rows[0]?.v;
    if (dropSays !== "dropped:x")
      fail(`the declared DROP+recreate did not land — probe('x') returned ${JSON.stringify(dropSays)}`);

    if (failures === 0)
      console.log(
        `${TAG.ok}PROGRESS-S2 proven: a DROP FUNCTION this file recreates is REFUSED with no ` +
          `based-on line and REFUSED on a stale hash; the declared hash applies and lands`,
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
                             ${lit(SELFTEST_DROP_FILE)}, ${lit(SELFTEST_RETIRED_FILE)});`,
      )
      .catch((err: unknown) =>
        console.error(
          `${TAG.fail}self-test cleanup FAILED — remove schema ${SELFTEST_SCHEMA} and the ` +
            `${SELFTEST_FILE} ledger row by hand: ${formatPgError(err)}`,
        ),
      );
    await client.end().catch(() => undefined);
    for (const p of [path, fnPath, replacePath, dynamicPath, dropRecreatePath, retiredPath])
      if (existsSync(p)) unlinkSync(p);
  }

  if (failures) {
    console.error(`${TAG.fail}db:apply --self-test FAILED (${failures} assertion(s))`);
    return 1;
  }
  console.log(
    `${TAG.ok}db:apply --self-test passed against ` +
      (target === "clone"
        ? `the dev clone ${cloneRef!.cloneRef} (${cloneRef!.cloneName}) — production's own cluster, ` +
          `physically restored, so the catalogues these proofs read are production's`
        : `the MAIN database`),
  );
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
const TARGET_SELFTEST_SCRATCH_RE =
  /^zz_db_apply_(?:target|clone)_selftest_[0-9a-f]{12}\.sql$/;

/**
 * `pnpm db:apply --policy-only-self-test` — the RED-then-GREEN proof for the POLICY-LOCK rule.
 *
 * IT TOUCHES NO DATABASE AND WRITES NO FILE. It judges BYTES, three bodies:
 *   RED    a `create policy` riding beside a `create table` and a backfill — refused, and the
 *          strangers named, because that transaction's whole length is an outage.
 *   RED-2  a `do $$ … perform iam.apply_rls(…) … $$` beside a function replace — the same
 *          refusal for the regenerator call, which is what actually takes the locks.
 *   GREEN  a policy-only body: drops, creates, a grant, a comment and a `set local` — clean.
 *   GREEN-2 a file with NO policy DDL at all, doing plenty else — the rule does not fire, and
 *          a rule that fired on every migration would simply be turned off.
 */
/**
 * `pnpm db:apply --draft-self-test` — the `-- draft:` marker RED then GREEN. The real runner,
 * spawned at --target production --dry-run on a scratch file, refuses the draft before it
 * connects; the same bytes without the line pass the draft check and end in the --dry-run
 * print (it reads the ledger and sends nothing). Nothing is ever applied.
 */
function draftSelfTest(): number {
  let failures = 0;
  const ok = (label: string, pass: boolean) => {
    if (!pass) failures += 1;
    console.log(`${pass ? TAG.ok : TAG.fail}${label}`);
  };
  const body = "create schema if not exists zz_draft_probe;\n";
  ok("RED marker read with owner + reason", JSON.stringify(draftMarker(`-- draft: lane-x still writing the inverse\n${body}`)) === JSON.stringify({ owner: "lane-x", reason: "still writing the inverse" }));
  ok("RED bare marker is still a draft", draftMarker(`-- DRAFT:\n${body}`)?.owner === "(owner not named)");
  ok("GREEN no marker, no draft", draftMarker(body) === null);
  ok("GREEN a marker past the 25-line header is body text, not a header", draftMarker(`${"select 1;\n".repeat(30)}-- draft: x y\n`) === null);

  const dir = mkdtempSync(join(tmpdir(), "draft-selftest-"));
  const file = join(dir, `zz_db_apply_target_selftest_${randomBytes(6).toString("hex")}.sql`);
  try {
    const run = () =>
      spawnSyncNode([resolve(ROOT, "scripts", "apply-migration.ts"), file, "--target", "production", "--dry-run"]);
    writeFileSync(file, `-- draft: self-test probe not finished\n${body}`);
    const red = run();
    ok(
      `RED named production apply of a draft exits 1 with the remedy (exit ${red.status})`,
      red.status === 1 && red.out.includes("is a DRAFT by self-test") && red.out.includes(DRAFT_REMEDY),
    );
    // No ledger-only path may write a row for draft bytes (rca5d_j, 22:44 PT 2026-09-26).
    for (const mode of ["--ledger-rebase", "--amend-idempotent"]) {
      const r = spawnSyncNode([resolve(ROOT, "scripts", "apply-migration.ts"), mode, file, "--target", "clone"]);
      ok(`RED ${mode} of a draft is refused before it reads any database (exit ${r.status})`, r.status === 1 && r.out.includes("no path may ledger it"));
    }
    writeFileSync(file, body);
    const green = run();
    ok(
      `GREEN the same bytes without the line pass the draft check (exit ${green.status})`,
      !green.out.includes("is a DRAFT"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(failures ? `${TAG.fail}draft self-test: ${failures} failure(s)` : `${TAG.ok}draft self-test: RED then GREEN`);
  return failures ? 1 : 0;
}

/**
 * `pnpm db:apply --campaign-auth-self-test [migrations/campaign/<file>.sql]` — the campaign
 * production authorisation WITHOUT THE BRANCH (lane DB-TOOLS-NO-BRANCH), RED then GREEN.
 *
 *   PURE   the clone-pair verdict: rehearsed / aidream's rstrip hash / edited after rehearsal /
 *          never rehearsed / no inverse / clone unreadable — and in EVERY case no refusal
 *          (JUDGMENT §6a: the copy is information, never a gate).
 *   RED    a retired BRANCH-REF (the real one since 2026-09-26) makes the old authorisation's
 *          first call — loadBranchDbEnv — refuse; that call is what refused every campaign file.
 *   GREEN  the real runner, spawned at `--target production --dry-run --source campaign --lane`,
 *          prints the authorisation line (no branch read, the clone pair) and exits 0. A dry-run
 *          sends nothing; the production connection only reads.
 */
function campaignAuthSelfTest(argv: readonly string[]): number {
  let failures = 0;
  const ok = (label: string, pass: boolean, detail = "") => {
    if (!pass) failures += 1;
    console.log(`${pass ? TAG.ok : TAG.fail}${label}${detail ? ` ${C.dim}${detail}${C.reset}` : ""}`);
  };
  const pure = clonePairSelfTest();
  ok(`PURE the clone-pair verdict, 6 cases, never a refusal`, pure.length === 0, pure.join("; "));

  let redMessage = "";
  try {
    loadBranchDbEnv(ROOT, loadBranchRef(ROOT));
  } catch (err) {
    redMessage = err instanceof Error ? err.message.split("\n")[0]! : String(err);
  }
  ok(`RED the retired BRANCH-REF refuses the branch connection the old authorisation opened`, redMessage.includes("names no rehearsal branch"), redMessage);

  const given = argv.find((a) => a.endsWith(".sql"));
  const file = given
    ? resolve(process.cwd(), given)
    : resolve(MIGRATIONS_DIR, CAMPAIGN_DIRNAME, "doorspeed_a_page_is_sorted_searched_and_counted_and_a_batch_is_one_transaction.sql");
  if (!existsSync(file)) {
    ok(`GREEN needs a campaign file: ${relative(ROOT, file)} is not there (pass one)`, false);
  } else {
    const run = spawnSyncNode([
      resolve(ROOT, "scripts", "apply-migration.ts"), file,
      "--source", CAMPAIGN_SOURCE, "--target", "production", "--lane", "db-apply-campaign-auth-self-test", "--dry-run",
    ]);
    const line = run.out.split("\n").find((l) => l.includes("campaign authorisation")) ?? "";
    ok(
      `GREEN ${basename(file)} at --target production --dry-run: authorisation printed, no branch read, exit ${run.status}`,
      run.status === 0 && line.includes("no branch read") && line.includes("clone pair:") && !run.out.includes("names no rehearsal branch"),
      line.replace(/\x1b\[[0-9;]*m/g, "").trim() || run.out.split("\n").filter((l) => /FAIL/.test(l)).join(" | "),
    );
  }
  console.log(failures ? `${TAG.fail}campaign-auth self-test: ${failures} failure(s)` : `${TAG.ok}campaign-auth self-test: RED then GREEN`);
  return failures ? 1 : 0;
}

function spawnSyncNode(args: string[]): { status: number; out: string } {
  try {
    const out = execFileSync("npx", ["tsx", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 2, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function policyOnlySelfTest(): number {
  const red = `
    set local lock_timeout = '2s';
    create table demo.widget (id uuid primary key);
    insert into demo.widget (id) values (gen_random_uuid());
    drop policy std_select on demo.widget;
    create policy std_select on demo.widget for select to authenticated using (true);
  `;
  const redVerdict = policyOnlyVerdict(red);
  if (redVerdict.policy.length === 0 || redVerdict.strangers.length !== 2) {
    console.error(
      `${TAG.fail}--policy-only-self-test RED HALF FAILED: a create policy beside a create table ` +
        `and an insert was judged ${redVerdict.policy.length} policy statement(s) and ` +
        `${redVerdict.strangers.length} stranger(s); expected 2 policy statements and 2 strangers.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}policy-only RED${C.reset} ${C.dim}— ${redVerdict.strangers.length} statement(s) refused ` +
      `beside ${redVerdict.policy.length} policy statement(s)${C.reset}`,
  );

  const red2 = `
    create or replace function demo.f() returns void language sql as $$ select 1 $$;
    do $$ begin perform iam.apply_rls('demo','widget','widget'); end $$;
  `;
  const red2Verdict = policyOnlyVerdict(red2);
  if (red2Verdict.policy.length !== 1 || red2Verdict.strangers.length !== 1) {
    console.error(
      `${TAG.fail}--policy-only-self-test RED-2 FAILED: a DO block calling iam.apply_rls beside a ` +
        `function replace was judged ${red2Verdict.policy.length} policy statement(s) / ` +
        `${red2Verdict.strangers.length} stranger(s); expected 1 and 1.`,
    );
    return 1;
  }
  console.log(`${C.bold}policy-only RED-2${C.reset} ${C.dim}— a regenerator CALL counts as policy DDL${C.reset}`);

  const green = `
    set local lock_timeout = '2s';
    drop policy std_select on demo.widget;
    create policy std_select on demo.widget for select to authenticated using (created_by = auth.uid());
    grant select on demo.widget to authenticated;
    comment on table demo.widget is 'the widget';
  `;
  const greenVerdict = policyOnlyVerdict(green);
  if (greenVerdict.policy.length === 0 || greenVerdict.strangers.length > 0) {
    console.error(
      `${TAG.fail}--policy-only-self-test GREEN HALF FAILED: a policy-only body was judged to carry ` +
        `${greenVerdict.strangers.length} stranger(s): ${greenVerdict.strangers.join(" | ")}`,
    );
    return 1;
  }
  console.log(`${C.bold}policy-only GREEN${C.reset} ${C.dim}— policy/grant/comment/set local is clean${C.reset}`);

  const green2 = `
    create table demo.gadget (id uuid primary key);
    create index gadget_id_idx on demo.gadget (id);
    create or replace function demo.g() returns void language sql as $$ select 1 $$;
  `;
  const green2Verdict = policyOnlyVerdict(green2);
  if (green2Verdict.policy.length > 0 || green2Verdict.strangers.length > 0) {
    console.error(
      `${TAG.fail}--policy-only-self-test GREEN-2 FAILED: a file with no policy DDL was judged by ` +
        `the rule at all (${green2Verdict.policy.length} policy / ${green2Verdict.strangers.length} strangers).`,
    );
    return 1;
  }
  console.log(`${C.bold}policy-only GREEN-2${C.reset} ${C.dim}— the rule does not fire on an ordinary file${C.reset}`);
  console.log(
    `${TAG.ok}a campaign file that changes a policy carries nothing else, and the rule is silent ` +
      `on every file that changes none.`,
  );
  return 0;
}


/**
 * `pnpm db:apply --window-class-self-test` — the RED-then-GREEN proof for the TRIGGER-LOCK rule.
 *
 * IT TOUCHES NO DATABASE AND WRITES NO FILE. It judges BYTES:
 *   RED    a `drop trigger` + `create trigger` on `custom.record` — two window-class sites, and
 *          the file carries no `-- window-class:` line, which is the refusal.
 *   RED-2  the same body WITH the declaration — still window-class, and still refused at
 *          production outside 01:00-04:00 Pacific (asserted against a fixed midday clock, so
 *          this half does not change its verdict depending on when the suite runs).
 *   RED-3  `alter table history.row_versions disable trigger` — the other partitioned parent,
 *          the other statement kind, the unqualified-name arm included.
 *   GREEN  the declared body inside the window (a fixed 02:30 Pacific clock).
 *   GREEN-2 trigger DDL on a table that is NOT partitioned, and a `create or replace function`
 *          whose BODY contains `create trigger` — neither takes the fan-out, so the rule stays
 *          silent. A rule that fired on every trigger in the estate would be turned off.
 */
function windowClassSelfTest(): number {
  const red = `
    drop trigger record_write_guard on custom.record;
    create trigger record_write_guard before insert on custom.record
      for each row execute function custom.record_write_guard();
  `;
  const redSites = windowClassVerdict(red);
  const redDrop = redSites.find((x) => x.why === "DROP TRIGGER");
  const redCreate = redSites.find((x) => x.why === "CREATE TRIGGER");
  if (
    redSites.length !== 2 ||
    windowClassDeclaration(red) !== null ||
    redDrop?.mode !== "ACCESS EXCLUSIVE" ||
    redDrop?.freezesSignIn !== true ||
    redCreate?.mode !== "SHARE ROW EXCLUSIVE" ||
    redCreate?.freezesSignIn !== false
  ) {
    console.error(
      `${TAG.fail}--window-class-self-test RED FAILED: a drop+create trigger on custom.record was ` +
        `judged ${redSites.length} window-class site(s) (expected 2) and the undeclared body was ` +
        `${windowClassDeclaration(red) === null ? "correctly" : "NOT"} seen as undeclared.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}window-class RED${C.reset} ${C.dim}— ${redSites.length} site(s) on ` +
      `${redSites[0]!.table} (+${redSites[0]!.partitions} partitions), no declaration; the DROP ` +
      `is ACCESS EXCLUSIVE and freezes sign-in, the CREATE is SHARE ROW EXCLUSIVE and does ` +
      `not${C.reset}`,
  );

  const midday = new Date("2026-09-22T19:00:00Z"); // 12:00 Pacific
  const inWindow = new Date("2026-09-22T09:30:00Z"); // 02:30 Pacific
  const red2 = `-- window-class: the record write trigger is replaced; 41 relations freeze\n${red}`;
  if (windowClassDeclaration(red2) === null || isInsideWindow(midday)) {
    console.error(
      `${TAG.fail}--window-class-self-test RED-2 FAILED: the declared body was ` +
        `${windowClassDeclaration(red2) === null ? "not read as declared" : "read as declared"} and ` +
        `12:00 Pacific was judged ${isInsideWindow(midday) ? "INSIDE" : "outside"} the window.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}window-class RED-2${C.reset} ${C.dim}— declared, but 12:00 Pacific ` +
      `(${pacificHHMM(midday)}) is outside ${WINDOW_CLASS_OPEN_HHMM}-${WINDOW_CLASS_CLOSE_HHMM}${C.reset}`,
  );

  const red3 = `alter table only history.row_versions disable trigger row_versions_stamp;`;
  const red3Sites = windowClassVerdict(red3);
  if (
    red3Sites.length !== 1 ||
    red3Sites[0]!.table !== "history.row_versions" ||
    red3Sites[0]!.partitions !== 29 ||
    red3Sites[0]!.mode !== "SHARE ROW EXCLUSIVE"
  ) {
    console.error(
      `${TAG.fail}--window-class-self-test RED-3 FAILED: an \`alter table … disable trigger\` on ` +
        `history.row_versions was judged ${red3Sites.length} site(s) ` +
        `(${red3Sites.map((x) => `${x.table}/+${x.partitions}`).join(", ")}); expected 1 on ` +
        `history.row_versions with 29 partitions.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}window-class RED-3${C.reset} ${C.dim}— enable/disable counts (SHARE ROW EXCLUSIVE ` +
      `across 29 partitions), and the second parent is known${C.reset}`,
  );

  if (!isInsideWindow(inWindow) || windowClassVerdict(red2).length !== 2) {
    console.error(
      `${TAG.fail}--window-class-self-test GREEN FAILED: 02:30 Pacific was judged ` +
        `${isInsideWindow(inWindow) ? "inside" : "OUTSIDE"} the window.`,
    );
    return 1;
  }
  console.log(`${C.bold}window-class GREEN${C.reset} ${C.dim}— declared, 02:30 Pacific, it runs${C.reset}`);

  const green2 = `
    create trigger plain_stamp before insert on iam.api_keys
      for each row execute function iam.stamp();
    create or replace function custom.install() returns void language plpgsql as $fn$
    begin
      execute 'create trigger t before insert on custom.record for each row execute function custom.f()';
    end $fn$;
  `;
  const green2Sites = windowClassVerdict(green2);
  if (green2Sites.length !== 0) {
    console.error(
      `${TAG.fail}--window-class-self-test GREEN-2 FAILED: a trigger on a non-partitioned table ` +
        `and a function BODY containing trigger DDL were judged ${green2Sites.length} ` +
        `window-class site(s): ${green2Sites.map((x) => x.stmt.slice(0, 60)).join(" | ")}`,
    );
    return 1;
  }
  console.log(
    `${C.bold}window-class GREEN-2${C.reset} ${C.dim}— an unpartitioned table and a function body ` +
      `do not fire the rule${C.reset}`,
  );
  // ── DDL-LOCK-CENSUS, 2026-09-22: the verdict is the MEASUREMENT, not the name ─────────────
  // RED-4  ACCESS EXCLUSIVE on a partitioned parent with NO trigger word anywhere — the old
  //        name-based rule was blind to it and would have applied it at noon.
  const red4 = `
    alter table custom.record add column note text;
    alter table history.row_versions alter column recorded_at type timestamptz;
    truncate custom.record;
  `;
  const red4Sites = windowClassVerdict(red4);
  const red4Classes = red4Sites.map((x) => x.classId).sort();
  if (
    red4Sites.length !== 3 ||
    red4Classes.join(",") !== "add_column,alter_column_type,truncate" ||
    red4Sites.some((x) => x.mode !== "ACCESS EXCLUSIVE") ||
    red4Sites.some((x) => x.freezesSignIn) ||
    red4Sites.some((x) => x.shape !== "partitionedParent")
  ) {
    console.error(
      `${TAG.fail}--window-class-self-test RED-4 FAILED: add column / alter column type / ` +
        `truncate on a partitioned parent were judged ${red4Sites.length} site(s) ` +
        `[${red4Classes.join(", ")}]; expected 3, all ACCESS EXCLUSIVE on the parent, none ` +
        `freezing sign-in. The measured footprint is not reaching the verdict.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}window-class RED-4${C.reset} ${C.dim}— no trigger word in sight: add column, ` +
      `alter column type and truncate on a partitioned parent are window-class on the ` +
      `measurement alone${C.reset}`,
  );

  // RED-5  the hook set: policy DDL on an ORDINARY table freezes sign-in, so it is window-class
  //        with no partitions involved at all.
  const red5 = `drop policy api_keys_read on iam.api_keys;`;
  const red5Sites = windowClassVerdict(red5);
  if (
    red5Sites.length !== 1 ||
    red5Sites[0]!.classId !== "drop_policy" ||
    red5Sites[0]!.freezesSignIn !== true ||
    red5Sites[0]!.partitions !== 0 ||
    red5Sites[0]!.shape !== "plainTable"
  ) {
    console.error(
      `${TAG.fail}--window-class-self-test RED-5 FAILED: a drop policy on an unpartitioned table ` +
        `was judged ${red5Sites.length} site(s) ` +
        `(${red5Sites.map((x) => `${x.classId}/freezes=${x.freezesSignIn}`).join(", ")}); ` +
        `expected 1 drop_policy that freezes sign-in.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}window-class RED-5${C.reset} ${C.dim}— the hook set makes policy DDL window-class ` +
      `on any table, partitions or not${C.reset}`,
  );

  // GREEN-3  the classes the census measured as harmless stay harmless, ON the parent: create
  //          index (SHARE), grant/revoke (ACCESS SHARE), add foreign key (SHARE ROW EXCLUSIVE),
  //          rename index and comment on (SHARE UPDATE EXCLUSIVE), create table (nothing).
  const green3 = `
    create index record_note_idx on custom.record (organization_id);
    grant select on custom.record to authenticated;
    revoke select on custom.record from anon;
    alter table custom.record add constraint record_org_fk foreign key (organization_id) references iam.organizations(id);
    alter index custom.record_pkey rename to record_pk;
    comment on table custom.record is 'the record store';
    create table custom.record_scratch (id uuid primary key);
  `;
  const green3Sites = windowClassVerdict(green3);
  if (green3Sites.length !== 0) {
    console.error(
      `${TAG.fail}--window-class-self-test GREEN-3 FAILED: statements the census measured as ` +
        `taking no ACCESS EXCLUSIVE and no hook relations were judged ` +
        `${green3Sites.length} window-class site(s): ` +
        `${green3Sites.map((x) => x.classId).join(", ")}. A rule that fires on every statement ` +
        `is a rule that gets switched off.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}window-class GREEN-3${C.reset} ${C.dim}— create index, grant, revoke, add foreign ` +
      `key, rename index, comment on and create table stay midday work, on the parent itself${C.reset}`,
  );

  // GREEN-4  THE LOAD-BEARING PROOF: the JSON decides. Feed the same verdict function a
  //          footprint in which `grant` was measured as firing the hook, and `grant` must become
  //          window-class — without one character of the runner changing. If this arm can be
  //          deleted and the suite still passes, the rule is back to judging by name.
  const mutated = JSON.parse(JSON.stringify(loadDdlFootprint())) as typeof DDL_LOCK_FOOTPRINT;
  const grantClass = mutated.classes.find((x) => x.id === "grant") as {
    plainTable: { hookRelations: number; windowClass: boolean; because: string };
  };
  grantClass.plainTable.hookRelations = 23;
  grantClass.plainTable.windowClass = true;
  grantClass.plainTable.because = "mutated for the self-test";
  const beforeMutation = windowClassVerdict(`grant select on iam.api_keys to authenticated;`);
  const afterMutation = windowClassVerdict(`grant select on iam.api_keys to authenticated;`, mutated);
  if (beforeMutation.length !== 0 || afterMutation.length !== 1 || afterMutation[0]!.classId !== "grant") {
    console.error(
      `${TAG.fail}--window-class-self-test GREEN-4 FAILED: with the real census a GRANT was ` +
        `${beforeMutation.length} site(s) (expected 0) and with a census that measures it as ` +
        `firing the hook it was ${afterMutation.length} site(s) (expected 1). The verdict is NOT ` +
        `reading the checked-in measurement — it is judging by name again.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}window-class GREEN-4${C.reset} ${C.dim}— the measurement is load-bearing: change ` +
      `what the JSON says GRANT locks and the verdict changes with it${C.reset}`,
  );

  // GREEN-5  an unreadable census is a REFUSAL, never a fallback to judging by name.
  let refused = false;
  try {
    loadDdlFootprint("/nonexistent/ddl-lock-footprint.json");
  } catch {
    refused = true;
  }
  if (!refused) {
    console.error(
      `${TAG.fail}--window-class-self-test GREEN-5 FAILED: a missing ddl-lock-footprint.json did ` +
        `not refuse. An unmeasured footprint must never read as "nothing is window-class".`,
    );
    return 1;
  }
  console.log(
    `${C.bold}window-class GREEN-5${C.reset} ${C.dim}— a missing census refuses; it never ` +
      `degrades into silence${C.reset}`,
  );

  // ── THE ONE VERIFIED EXEMPTION: `-- policy-ddl: one-table` (chair ruling 2026-09-22) ──────
  // POLICY-LOCK's midday allowance survives the census — as an exemption the runner PROVES, not
  // a switch a file asserts. Every arm below is a way of claiming it without having it.
  const oneTableFile = "migrations/campaign/exemption_probe.sql";
  const oneTableBody = `-- policy-ddl: one-table
-- window-class: one table's policies are regenerated; the supautils set freezes for the transaction
set local statement_timeout = '30s';
drop policy if exists api_keys_read on iam.api_keys;
create policy api_keys_read on iam.api_keys for select using (true);
`;
  const noMeasurement = () => null;
  const measurementOf = (ms: number) => () => ({
    file: "exemption_probe.sql",
    sha256: sha256OfBytes(oneTableBody),
    target: "clone",
    firstPolicyDdlToEndMs: ms,
    tables: ["iam.api_keys"],
    measuredAt: "2026-09-22T16:00:00.000Z",
  });
  const sitesOf = (body: string) => windowClassVerdict(body);

  // RED-6  declared, one table, policy-only — and NO measurement of these bytes.
  const red6 = policyDdlOneTableVerdict(oneTableBody, oneTableFile, sitesOf(oneTableBody), noMeasurement);
  if (red6.exempt || !red6.refusal || !/NO measurement for these exact/.test(red6.refusal)) {
    console.error(
      `${TAG.fail}--window-class-self-test RED-6 FAILED: a file claiming the exemption with no ` +
        `measurement was ${red6.exempt ? "EXEMPTED" : `refused with "${red6.refusal}"`}; expected a ` +
        `refusal naming the missing measurement.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}policy-ddl RED-6${C.reset} ${C.dim}— declared, but no measurement of these exact ` +
      `bytes: refused, and the refusal names what is missing${C.reset}`,
  );

  // RED-7  declared, measured fast — but it touches TWO tables. Counted, not trusted.
  const twoTables = oneTableBody + `create policy orgs_read on iam.organizations for select using (true);\n`;
  const red7 = policyDdlOneTableVerdict(twoTables, oneTableFile, sitesOf(twoTables), measurementOf(89));
  if (red7.exempt || !red7.refusal || !/names 2:/.test(red7.refusal)) {
    console.error(
      `${TAG.fail}--window-class-self-test RED-7 FAILED: a file declaring one table and naming two ` +
        `was ${red7.exempt ? "EXEMPTED" : `refused with "${red7.refusal}"`}; expected a refusal ` +
        `counting the tables.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}policy-ddl RED-7${C.reset} ${C.dim}— declared "one-table" and names two: refused by ` +
      `counting${C.reset}`,
  );

  // RED-8  declared, one table, policy-only, measured — at 4,418 ms, POLICY-LOCK's own
  //        before-number. A measurement is not a pass; the NUMBER is the pass.
  const red8 = policyDdlOneTableVerdict(oneTableBody, oneTableFile, sitesOf(oneTableBody), measurementOf(4418));
  if (red8.exempt || !red8.refusal || !/4418 ms/.test(red8.refusal)) {
    console.error(
      `${TAG.fail}--window-class-self-test RED-8 FAILED: a 4,418 ms measured freeze was ` +
        `${red8.exempt ? "EXEMPTED" : `refused with "${red8.refusal}"`}; expected a refusal naming ` +
        `the measured milliseconds.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}policy-ddl RED-8${C.reset} ${C.dim}— measured 4,418 ms (POLICY-LOCK's before-number): ` +
      `refused, ceiling ${POLICY_DDL_ONE_TABLE_MAX_MS} ms${C.reset}`,
  );

  // RED-9  declared, but the window-class DDL is not all policy DDL — a drop trigger rides along.
  const red9Body = oneTableBody + `drop trigger record_stamp on custom.record;\n`;
  const red9 = policyDdlOneTableVerdict(red9Body, oneTableFile, sitesOf(red9Body), measurementOf(89));
  if (red9.exempt || !red9.refusal || !/not all\s+policy DDL/.test(red9.refusal)) {
    console.error(
      `${TAG.fail}--window-class-self-test RED-9 FAILED: a file mixing the exemption with a drop ` +
        `trigger on custom.record was ${red9.exempt ? "EXEMPTED" : `refused with "${red9.refusal}"`}.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}policy-ddl RED-9${C.reset} ${C.dim}— the exemption does not carry a drop trigger with ` +
      `it${C.reset}`,
  );

  // GREEN-6  all four halves proved: declared, policy-only, one table, measured 89 ms.
  const green6 = policyDdlOneTableVerdict(oneTableBody, oneTableFile, sitesOf(oneTableBody), measurementOf(89));
  const undeclared = policyDdlOneTableVerdict(
    oneTableBody.replace("-- policy-ddl: one-table\n", ""),
    oneTableFile,
    sitesOf(oneTableBody),
    measurementOf(89),
  );
  if (!green6.exempt || green6.table !== "iam.api_keys" || undeclared.exempt || undeclared.refusal !== null) {
    console.error(
      `${TAG.fail}--window-class-self-test GREEN-6 FAILED: the fully proved file was ` +
        `${green6.exempt ? "exempt" : `REFUSED ("${green6.refusal}")`} on ${green6.table}, and a ` +
        `file that never claims the exemption was ${undeclared.exempt ? "EXEMPTED" : "not exempted"} ` +
        `with refusal ${JSON.stringify(undeclared.refusal)} (expected null — it simply waits for ` +
        `the window).`,
    );
    return 1;
  }
  console.log(
    `${C.bold}policy-ddl GREEN-6${C.reset} ${C.dim}— declared + policy-only + one table + 89 ms ` +
      `measured on these exact bytes: the window is waived, and a file that never claims it just ` +
      `waits${C.reset}`,
  );

  console.log(
    `${TAG.ok}window-class is decided by the measured footprint ` +
      `(${DDL_LOCK_FOOTPRINT.classes.length} classes, ${DDL_LOCK_FOOTPRINT.measuredOn}), with the ` +
      `trigger name rule kept underneath as the floor.`,
  );
  return 0;
}

/**
 * `pnpm db:apply --ground-gate-self-test` — the RED-then-GREEN proof for the ground-standing
 * ratchet this runner now reads before it ledgers anything under `migrations/inverse/`.
 *
 * IT TOUCHES NO DATABASE AND WRITES NO FILE. It judges BYTES: a real inverse from the tree,
 * first with a `drop function` line for a body a live `custom.record` trigger reaches spliced
 * into it — which must be REFUSED — and then exactly as it stands on disk, which must be clean.
 * The bytes never reach the shared checkout, which is deliberate: a self-test that drops a file
 * into `migrations/inverse/` on a checkout a dozen sessions are committing from is one sweep
 * away from shipping its own fixture.
 */
async function groundGateSelfTest(): Promise<number> {
  const victim = "writeperf4_a_fact_about_the_table_is_read_once_down.sql";
  const path = resolve(MIGRATIONS_DIR, INVERSE_DIRNAME, victim);
  if (!existsSync(path)) {
    console.error(
      `${TAG.fail}--ground-gate-self-test: ${victim} is not in the tree any more. Point this at ` +
        `another inverse that leaves a custom.record store-door trigger attached, or the proof is gone.`,
    );
    return 1;
  }
  const clean = readFileSync(path, "utf8");

  // THE RED HALF. `platform.memo_k_get` is reached by three triggers this file leaves attached
  // to custom.record; dropping it is exactly the (a) instance GATES-2 removed from these bytes.
  const poisoned = `${clean}\ndrop function if exists platform.memo_k_get(text);\n`;
  const red = judgeOneInverse(victim, poisoned);
  if (red.length === 0) {
    console.error(
      `${TAG.fail}--ground-gate-self-test RED HALF FAILED: a \`drop function\` on a body three live ` +
        `custom.record triggers reach was judged clean. The runner would ledger it. The gate is blind.`,
    );
    return 1;
  }
  console.log(
    `${C.bold}ground gate RED${C.reset} ${C.dim}— ${red.length} finding(s) on the poisoned bytes: ` +
      `${red.map((f) => `(${f.clause})`).join(" ")}${C.reset}`,
  );

  // THE GREEN HALF — the same file, as it actually stands.
  const green = judgeOneInverse(victim, clean);
  if (green.length > 0) {
    console.error(
      `${TAG.fail}--ground-gate-self-test GREEN HALF FAILED: ${victim} as it stands is judged ` +
        `${green.length} finding(s) — ${green.map((f) => `(${f.clause}) ${f.what}`).join("; ")}`,
    );
    return 1;
  }
  console.log(`${C.bold}ground gate GREEN${C.reset} ${C.dim}— the same file, as it stands, is clean${C.reset}`);
  console.log(
    `${TAG.ok}the inverse ground gate refuses a defective inverse BEFORE it is ledgered, and ` +
      `passes the file it was spliced from.`,
  );
  return 0;
}

// ════════════════════════════════════════════════════════════════════════════
// --clone-self-test — the CLONE refusal, RED then GREEN, in both directions
// ════════════════════════════════════════════════════════════════════════════
//
// 🚨 WHY THIS IS ITS OWN PROOF AND NOT A LINE IN --target-self-test. Every other
// `--target` refusal ultimately rests on `pg_control_system().system_identifier`
// differing between the two databases. THE CLONE'S DOES NOT DIFFER: it is a physical
// restore of production's cluster and answers with production's own
// 7642734024280108049. So the proofs below are the only ones in this runner that
// exercise the two checks that CAN tell them apart — the project ref carried by the
// connection, and the quarantine the nightly job leaves on the server.
//
// Five proofs, each by SPAWNING THIS SCRIPT, so what is proven is what an agent runs:
//
//   C1 RED   `--target clone` pointed at a PRODUCTION-shaped DSN -> refused before a
//            socket is opened, with a FAKE password in the process. Production
//            presented as the clone, caught by the ref.
//   C2 RED   `--target production` while the five SUPABASE_MATRIX_* carry the CLONE's
//            identities -> refused before a socket is opened, again with a fake
//            password. The clone presented as production, caught by the same ref.
//   C3 RED   a `-- target: branch` file with `--target clone` -> header/flag
//            disagreement, with no connection at all.
//   C4 RED   `--target clone` against a CLONE-REF that NAMES PRODUCTION, with
//            production's own credentials and `--dry-run`: the pre-connection check
//            now agrees (the ref matches the file), and the refusal has to come from
//            THE SERVER — production is not quarantined. This is the deepest one: it
//            is the exact shape a stale or hand-edited CLONE-REF produces, and the
//            only thing standing between a rehearsal and the live database.
//   C5 GREEN a `-- target: clone` file APPLIES to the clone, leaves a real object, and
//            ledgers there with `rehearsal_on` SET — the mark that says the next
//            nightly refresh overwriting this row is expected.
//
// C1-C3 need no credential of any kind and always run. C4 needs production's five
// variables and never applies anything (`--dry-run` and, if the refusal ever failed,
// a body that creates nothing). C5 needs the clone's own DSN. A proof that cannot run
// says SKIPPED and names exactly what it lacked; a skip is never counted as a pass.
async function cloneSelfTest(statementTimeout: string): Promise<number> {
  const { spawnSync } = await import("node:child_process");
  let failures = 0;
  let skipped = 0;
  const fail = (what: string) => {
    failures += 1;
    console.error(`${TAG.fail}clone-self-test: ${what}`);
  };
  const pass = (what: string) => console.log(`${TAG.ok}clone-self-test: ${what}`);
  const skip = (what: string) => {
    skipped += 1;
    console.warn(`${TAG.warn}clone-self-test SKIPPED: ${what}`);
  };

  let ref;
  try {
    ref = loadCloneRef(ROOT, cloneRefOverride(process.argv.slice(2)));
  } catch (err) {
    console.error(
      `${TAG.fail}clone-self-test cannot run: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 2;
  }
  console.log(
    `${C.bold}clone-self-test${C.reset} ${C.dim}— clone ${ref.cloneRef} (${ref.cloneName}), parent ` +
      `${ref.parentRef}; both report system_identifier ${ref.systemIdentifier}${C.reset}`,
  );
  if (ref.systemIdentifier !== ref.parentSystemIdentifier) {
    console.warn(
      `${TAG.warn}CLONE-REF records DIFFERENT system_identifiers for the clone and its parent ` +
        `(${ref.systemIdentifier} vs ${ref.parentSystemIdentifier}). That is not the trap this ` +
        `target was built for; the ref and quarantine checks below still bind.`,
    );
  }

  const runId = randomBytes(6).toString("hex");
  const selftestFile = `zz_db_apply_clone_selftest_${runId}.sql`;
  const selftestSchema = `zz_clone_selftest_${runId}`;
  const scratchDir = mkdtempSync(join(tmpdir(), "db-apply-clone-selftest-"));
  const path = join(scratchDir, selftestFile);
  const self = resolve(ROOT, "scripts", "apply-migration.ts");
  const run = (args: string[], env: Record<string, string>) =>
    spawnSync("npx", ["tsx", self, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, ...env } as NodeJS.ProcessEnv,
      timeout: 180_000,
    });
  const out = (r: ReturnType<typeof run>) => `${r.stdout ?? ""}${r.stderr ?? ""}`;

  const cloneBody =
    `-- target: clone\n` +
    `create schema if not exists ${selftestSchema};\n` +
    `create table if not exists ${selftestSchema}.landed (id int primary key);\n` +
    `insert into ${selftestSchema}.landed (id) values (1) on conflict do nothing;\n`;

  try {
    // ── C1. production presented as the clone, before any socket ────────────
    writeFileSync(path, cloneBody, "utf8");
    const r1 = run([path, "--target", "clone"], {
      [ref.passwordEnvVar]: `postgresql://postgres.${ref.parentRef}:not-a-real-password@${ref.poolerHost}:${ref.poolerPort}/${ref.database}`,
    });
    const o1 = out(r1);
    if (r1.status !== 1)
      fail(`--target clone against a PRODUCTION-shaped DSN exited ${r1.status}, expected 1`);
    // The refusal lands even EARLIER than the host check: `loadCloneDbEnv` compares the
    // DSN to CLONE-REF before the connection is built at all, and it is the one that
    // prints the project ref on both sides. Assert on what actually fires, not on the
    // check we happened to write first.
    else if (!new RegExp(`project ref in the DSN: ${ref.parentRef}`).test(o1))
      fail(`the pre-connection refusal did not name production's project ref:\n${o1.slice(0, 900)}`);
    else if (!new RegExp(`expected ${ref.cloneRef}`).test(o1))
      fail(`the refusal did not name the clone it expected:\n${o1.slice(0, 900)}`);
    else
      pass(
        "--target clone against a production-shaped DSN is refused with nothing opened, by the " +
          "project ref — the system_identifier could not have caught it",
      );

    // ── C2. the clone presented as production, before any socket ────────────
    writeFileSync(path, `drop table if exists ${selftestSchema}.no_such_table;\n`, "utf8");
    const r2 = run([path, "--target", "production"], {
      SUPABASE_MATRIX_USER: ref.poolerUser,
      SUPABASE_MATRIX_PASSWORD: "not-a-real-password",
      SUPABASE_MATRIX_HOST: ref.poolerHost,
      SUPABASE_MATRIX_PORT: String(ref.poolerPort),
      SUPABASE_MATRIX_DATABASE_NAME: ref.database,
    });
    const o2 = out(r2);
    if (r2.status !== 1)
      fail(`--target production against the CLONE's connection exited ${r2.status}, expected 1`);
    else if (!new RegExp(`the configured connection IS the dev clone ${ref.cloneRef}`).test(o2))
      fail(`the pre-connection refusal did not name the clone:\n${o2.slice(0, 900)}`);
    else
      pass(
        "--target production against the clone's own connection is refused with nothing opened " +
          "— the server-side check CANNOT catch this one and the message says so",
      );

    // ── C3. header vs flag, no connection ───────────────────────────────────
    writeFileSync(path, `-- target: branch\ncreate schema if not exists ${selftestSchema};\n`, "utf8");
    const r3 = run([path, "--target", "clone"], {
      [ref.passwordEnvVar]: `postgresql://${ref.poolerUser}:not-a-real-password@${ref.poolerHost}:${ref.poolerPort}/${ref.database}`,
    });
    const o3 = out(r3);
    if (r3.status !== 1) fail(`a branch-headed file with --target clone exited ${r3.status}, expected 1`);
    else if (!/file header: branch/.test(o3) || !/command flag: clone/.test(o3))
      fail(`the header/flag refusal did not print both identities:\n${o3.slice(0, 900)}`);
    else pass("a `-- target: branch` file is refused by --target clone, before any connection");

    // ── C4. THE DEEP ONE: a CLONE-REF that names production, production's own
    //        credentials, --dry-run. Only the SERVER can refuse this. ─────────
    const prodEnv = loadDbEnv();
    if ("missing" in prodEnv) {
      skip(
        `C4 (a CLONE-REF that names production, refused by the server's own lack of quarantine) ` +
          `needs ${DB_VARS.join(", ")} and they are not set. The refusal it proves is the last one ` +
          `between a rehearsal and the live database — run this where those five are available.`,
      );
    } else {
      const fakeRefPath = join(scratchDir, "CLONE-REF-naming-production");
      writeFileSync(
        fakeRefPath,
        [
          `# clone-self-test C4 fixture: a CLONE-REF that NAMES PRODUCTION. Never checked in.`,
          `clone_ref                = ${ref.parentRef}`,
          `clone_name               = not-really-a-clone`,
          `parent_ref               = ${ref.parentRef}`,
          `pooler_host              = ${prodEnv.host}`,
          `pooler_port              = ${prodEnv.port}`,
          `pooler_user              = ${prodEnv.user}`,
          `database                 = ${prodEnv.database}`,
          `system_identifier        = ${ref.parentSystemIdentifier}`,
          `parent_system_identifier = ${ref.parentSystemIdentifier}`,
          `password_env_var         = ${ref.passwordEnvVar}`,
          `password_file            = ${join(scratchDir, "no-such-password-file")}`,
          ``,
        ].join("\n"),
        "utf8",
      );
      // The body creates NOTHING even if every refusal above it failed, and --dry-run
      // stops before a single byte would execute. A self-test may not be one bug away
      // from writing to the live database.
      writeFileSync(path, `-- target: clone\nselect 1;\n`, "utf8");
      const r4 = run([path, "--target", "clone", `--clone-ref=${fakeRefPath}`, "--dry-run"], {
        [ref.passwordEnvVar]: `postgresql://${encodeURIComponent(prodEnv.user)}:${encodeURIComponent(prodEnv.password)}@${prodEnv.host}:${prodEnv.port}/${prodEnv.database}`,
      });
      const o4 = out(r4);
      if (r4.status !== 1)
        fail(
          `--target clone against PRODUCTION with a CLONE-REF that names production exited ` +
            `${r4.status}, expected 1. The connection check agreed with the file; only the server ` +
            `could refuse this, and it did not:\n${o4.slice(0, 1200)}`,
        );
      else if (!/is NOT QUARANTINED/.test(o4))
        fail(`the refusal did not come from the quarantine facts:\n${o4.slice(0, 1200)}`);
      else if (!/nothing applied, no ledger row/i.test(o4))
        fail(`the refusal did not say nothing was applied:\n${o4.slice(0, 1200)}`);
      else
        pass(
          "PRODUCTION presented as the clone by a CLONE-REF that names it is refused BY THE SERVER " +
            "— pg_net installed and active pg_cron jobs, which the nightly clone never has",
        );
    }

    // ── C5. GREEN — a real migration lands on the clone and is MARKED ───────
    let cloneEnv;
    try {
      cloneEnv = loadCloneDbEnv(ROOT, ref);
    } catch (err) {
      cloneEnv = null;
      skip(
        `C5 (a real apply to the clone, ledgered and marked) — ` +
          `${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
      );
    }
    if (cloneEnv) {
      writeFileSync(path, cloneBody, "utf8");
      const r5 = run([path, "--target", "clone", `--statement-timeout=${statementTimeout}`], {});
      const o5 = out(r5);
      if (r5.status !== 0) {
        fail(`the GREEN clone apply exited ${r5.status}, expected 0:\n${o5.slice(0, 1200)}`);
      } else if (!/quarantine .*confirmed/.test(o5)) {
        fail(`the GREEN apply did not announce the quarantine check:\n${o5.slice(0, 1200)}`);
      } else {
        const c = await connectDirect({ ...cloneEnv }, "matrx-frontend db:apply --clone-self-test");
        try {
          const back = await c.query<{ n: string; ledger: string; mark: string | null }>(
            `select (select count(*)::text from ${selftestSchema}.landed) as n,
                    (select count(*)::text from public._schema_migrations
                       where source = ${lit(SOURCE)} and filename = ${lit(selftestFile)}) as ledger,
                    (select to_jsonb(m) ->> 'rehearsal_on' from public._schema_migrations m
                       where source = ${lit(SOURCE)} and filename = ${lit(selftestFile)}) as mark`,
          );
          const row = back.rows[0];
          if (row?.n !== "1") fail(`the clone object did not read back (rows: ${row?.n})`);
          else if (row?.ledger !== "1") fail(`the clone ledger row is missing (rows: ${row?.ledger})`);
          else if (!row?.mark || !new RegExp(ref.cloneRef).test(row.mark))
            fail(
              `the clone ledger row is NOT MARKED as a rehearsal (rehearsal_on = ${row?.mark ?? "null"}) ` +
                `— an unmarked row is indistinguishable from the production rows this ledger is a copy of`,
            );
          else
            pass(
              "a `-- target: clone` file applied to the clone, read back, and ledgered there with " +
                `rehearsal_on naming ${ref.cloneRef} — the next refresh overwriting it is expected`,
            );
        } finally {
          await c.end();
        }
      }
      // Cleanup, asserted, on every path through C5.
      try {
        const c = await connectDirect({ ...cloneEnv }, "matrx-frontend db:apply --clone-self-test cleanup");
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
              `cleanup left something behind on the clone (schema rows ${left.rows[0]?.schemas}, ` +
                `ledger rows ${left.rows[0]?.ledger})`,
            );
          else pass(`cleanup verified on the clone — ${selftestSchema} gone, ledger row gone`);
        } finally {
          await c.end();
        }
      } catch (err) {
        fail(
          `cleanup could not be VERIFIED on the clone — remove schema ${selftestSchema} and the ` +
            `${selftestFile} ledger row by hand: ${formatPgError(err)}`,
        );
      }
    }
  } finally {
    if (existsSync(path)) unlinkSync(path);
    rmSync(scratchDir, { recursive: true, force: true });
  }

  if (failures) {
    console.error(`${TAG.fail}db:apply --clone-self-test FAILED (${failures} assertion(s))`);
    return 1;
  }
  console.log(
    `${TAG.ok}db:apply --clone-self-test passed — production presented as the clone and the clone ` +
      `presented as production are both refused, and the clone apply is real and marked` +
      (skipped ? ` (${skipped} proof(s) SKIPPED by name above — not passes)` : ``),
  );
  return 0;
}

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
  if (branchIsRetired(ref)) {
    console.log(
      `${TAG.warn}target-self-test: the branch proofs are RETIRED — BRANCH-REF names no branch ` +
        `(deleted 2026-09-26); --target branch is an alias of --target clone. Running the clone's proofs.`,
    );
    return cloneSelfTest(statementTimeout);
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
  // The clone's own proofs, run from here too, so ONE command still covers every target
  // this runner knows. They are a separate function because the thing they prove is
  // different in kind: the clone's system_identifier is production's.
  return cloneSelfTest(statementTimeout);
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
    if (sha256(bytes) === wantChecksum || sha256(bytes.replace(/\s+$/, "")) === wantChecksum) {
      return { bytes, commit: sha };
    }
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
  {
    const draftRefusal = draftLedgerRefusal(path);
    if (draftRefusal) {
      console.error(`${TAG.fail}${draftRefusal}`);
      return 1;
    }
  }
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
  {
    const draftRefusal = draftLedgerRefusal(path);
    if (draftRefusal) {
      console.error(`${TAG.fail}${draftRefusal}`);
      return 1;
    }
  }
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

    // THE AMEND IS THE ONE LEGAL EDIT TO A LEDGERED FILE, SO IT IS THE ONE THING THAT MAY
    // OPEN THE COMMIT GUARD (lane LEDGER-LOCK, 2026-09-22). Two writes, both the runner's:
    //   · the snapshot moves onto the new bytes, exactly as production's ledger just did —
    //     which is by itself enough for the hook and the release gate; and
    //   · a RECEIPT in the git dir, which `prepare-commit-msg` turns into the commit's
    //     `amend-idempotent:` trailer and then consumes. The trailer is what makes the
    //     exemption auditable in history and impossible for a lane to type for itself: it
    //     names this exact path AND this exact SHA-256, and a receipt is good for ONE commit.
    if (target === "production") {
      try {
        recordAppliedRow({
          relPath: rel,
          source: SOURCE,
          filename,
          checksum: newChecksum,
          appliedAt: row.applied_at,
        });
      } catch (err) {
        console.error(
          `${TAG.warn}${LEDGER_SNAPSHOT_REL} could not be updated ` +
            `(${(err as Error)?.message ?? String(err)}); run pnpm refresh:ledger-snapshot.`,
        );
      }
    }
    try {
      const gitDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
        cwd: ROOT,
        encoding: "utf8",
      }).trim();
      const receipt = receiptPath(resolve(ROOT, gitDir));
      const line = trailerLine(rel, newChecksum);
      const already = existsSync(receipt) ? readFileSync(receipt, "utf8") : "";
      if (!already.includes(line)) writeFileSync(receipt, `${already}${line}\n`, "utf8");
      console.log(
        `${TAG.info}Commit receipt written — the next commit in this checkout carries ` +
          `${C.white}${line}${C.reset}${C.dim} and is the only one this file's new bytes may ` +
          `enter.${C.reset}`,
      );
    } catch (err) {
      console.error(
        `${TAG.warn}Could not write the amend receipt ` +
          `(${(err as Error)?.message ?? String(err)}). The snapshot was still moved, so the ` +
          `commit guard will pass on the bytes alone.`,
      );
    }
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

/* ───────────────────────── --ledger-rebase ────────────────────────────────
 *
 * THE LEDGER ROW MOVES ONTO THE COMMITTED BYTES, AND ONLY ON A CLONE PROOF (lane LEDGER-REBASE,
 * chair ruling 2026-09-22). The rule, the proof and the receipt: `scripts/lib/ledger-rebase.ts`.
 *
 *   pnpm db:apply --ledger-rebase <file> --target clone
 *       runs the file's current bytes on the dev clone inside a ROLLED-BACK transaction and
 *       diffs the full object inventory + every row written. Zero and zero writes the proof
 *       (migrations/rebase-proofs/<sha256>.json) and moves the CLONE's ledger row, so the write
 *       path itself is rehearsed. Anything else prints the object diff and writes nothing.
 *   pnpm db:apply --ledger-rebase <file> --target production --lane <lane> \
 *       --reason "<why>" --confirm-chair-step <file>
 *       executes NOTHING: refuses without a live build-lock lease, the chair confirmation, a
 *       reason, or a fresh hash-bound proof taken against the checksum production holds now;
 *       then moves the row, appends the receipt, updates migrations/LEDGER.json and shrinks the
 *       grandfather list through its ratchet.
 *   pnpm db:apply --ledger-rebase --self-test
 *       RED then GREEN on the clone with planted scratch files (never in this checkout), plus the
 *       proof gate's refusals with no database at all.
 */

const GRANDFATHER_PATH = resolve(ROOT, "scripts", "lib", "ledger-lock-grandfathered.json");
const REBASE_RUNNER = "matrx-frontend db:apply --ledger-rebase";

function printMeasurement(m: IdempotencyMeasurement): void {
  console.log(
    `${TAG.info}clone measurement ${C.dim}— ${m.objectsInventoried} objects inventoried (functions, ` +
      `views, policies, indexes, ACLs, tables, columns, constraints, triggers), ${m.ms} ms, rolled back${C.reset}`,
  );
  if (m.error) console.log(`${TAG.fail}the file did not run on the clone: ${m.error}`);
  for (const d of m.deltas) {
    console.log(`${TAG.fail}${d.direction.toUpperCase()} ${d.kind} ${d.object}`);
    if (d.before) console.log(`         before: ${d.before}`);
    if (d.after) console.log(`         after:  ${d.after}`);
  }
  for (const r of m.rowsWritten) {
    console.log(`${TAG.fail}ROWS WRITTEN ${r.table}: ${r.tuples} tuple(s) — a statement that writes a row is not a no-op`);
  }
  if (m.concurrent.length) {
    console.log(
      `${TAG.warn}${m.concurrent.length} object(s) changed under this proof by ANOTHER session on the ` +
        `shared clone — not counted against the file, printed so nothing hides:`,
    );
    for (const d of m.concurrent) console.log(`         ${d.direction} ${d.kind} ${d.object}`);
  }
}

async function rebaseReceiptWrite(
  client: pg.Client,
  filename: string,
  expectChecksum: string,
  newChecksum: string,
  receipt: RebaseReceipt,
  filePath?: string,
): Promise<{ ok: true } | { ok: false; why: string }> {
  // A rebase EXECUTES NOTHING, so it never overwrites the apply's attribution columns: its own
  // attribution rides in the receipt it appends (lane LEDGER-LANE, 2026-09-23).
  if (filePath) {
    receipt = {
      ...receipt,
      attribution: attributionJson(collectAttribution(filePath, receipt.lane), isInsideWindow()),
    };
  }
  await beginClean(client);
  try {
    await client.query(`set local lock_timeout = '5s'`);
    await client.query(
      `alter table public._schema_migrations add column if not exists ${RECEIPT_COLUMN} jsonb`,
    );
    const cur = await client.query<{ checksum: string }>(
      `select checksum from public._schema_migrations where source = $1 and filename = $2 for update`,
      [SOURCE, filename],
    );
    if (!cur.rows[0]) {
      await client.query("rollback");
      return { ok: false, why: `${filename} has no ledger row any more.` };
    }
    if (cur.rows[0].checksum !== expectChecksum) {
      await client.query("rollback");
      return {
        ok: false,
        why: `the row moved under this command: it holds ${cur.rows[0].checksum.slice(0, 12)}…, expected ${expectChecksum.slice(0, 12)}….`,
      };
    }
    await client.query(
      `update public._schema_migrations
          set checksum = $1,
              ${RECEIPT_COLUMN} = coalesce(${RECEIPT_COLUMN}, '[]'::jsonb) || jsonb_build_array($2::jsonb)
        where source = $3 and filename = $4`,
      [newChecksum, JSON.stringify(receipt), SOURCE, filename],
    );
    await client.query("commit");
    return { ok: true };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    return { ok: false, why: err instanceof Error ? err.message : String(err) };
  }
}

/** Run a measurement in a transaction that is always ROLLED BACK, retrying another lane's lock. */
async function onCloneRolledBack<T>(client: pg.Client, run: (q: (s: string) => Promise<pg.QueryResult>) => Promise<T>): Promise<T> {
  const ATTEMPTS = 4;
  for (let attempt = 1; ; attempt++) {
    await beginClean(client);
    try {
      await client.query(`set local statement_timeout = '600s'`);
      await client.query(`set local lock_timeout = '30s'`);
      return await run((s) => client.query(s));
    } catch (err) {
      if (!isLockClash(err) || attempt === ATTEMPTS) throw err;
      console.warn(
        `${TAG.warn}attempt ${attempt}/${ATTEMPTS} hit another session's lock on the shared clone ` +
          `(${(err as { code?: string }).code}); rolled back, retrying.`,
      );
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    } finally {
      await client.query("rollback").catch(() => {});
    }
  }
}

async function measureOnClone(client: pg.Client, sql: string): Promise<IdempotencyMeasurement> {
  return onCloneRolledBack(client, (q) => measureIdempotency(q, sql));
}

function printRoundTrip(m: RoundTripMeasurement): void {
  console.log(
    `${TAG.info}clone round trip ${C.dim}— up → inverse → up over ${m.objectsInventoried} objects, ` +
      `${m.ms} ms, rolled back${C.reset}`,
  );
  if (m.error) console.log(`${TAG.fail}${m.error}`);
  console.log(`${TAG.info}the inverse leg changed ${m.inverseEffect.length} object(s):`);
  for (const d of m.inverseEffect) console.log(`         ${d.direction} ${d.kind} ${d.object}`);
  if (m.upOverLive.length) {
    console.log(`${TAG.info}re-running the up-file over live changed ${m.upOverLive.length} object(s) (a later owner's work; not counted):`);
    for (const d of m.upOverLive) console.log(`         ${d.direction} ${d.kind} ${d.object}`);
  }
  for (const d of m.deltas) {
    console.log(`${TAG.fail}NOT RESTORED ${d.direction.toUpperCase()} ${d.kind} ${d.object}`);
    if (d.before) console.log(`         after the first up:  ${d.before}`);
    if (d.after) console.log(`         after the second up: ${d.after}`);
  }
  for (const r of m.inverseRowsWritten) {
    console.log(`${TAG.fail}THE INVERSE WROTE ROWS ${r.table}: ${r.tuples} tuple(s) — an inverse never reaches anybody's rows`);
  }
  for (const r of m.inverseSideEffectRows) {
    console.log(`${TAG.info}the database's own guards wrote ${r.tuples} tuple(s) to ${r.table} while the inverse ran (a table it does not name; not counted)`);
  }
  if (m.concurrent.length) {
    console.log(`${TAG.warn}${m.concurrent.length} object(s) changed by ANOTHER session on the shared clone — not counted:`);
    for (const d of m.concurrent) console.log(`         ${d.direction} ${d.kind} ${d.object}`);
  }
}

/**
 * An inverse's up-file: `--up <path>`, or `<name without _down>.sql` in migrations/campaign/ then
 * migrations/. Null when neither exists.
 */
function upFileFor(inverseRel: string, argv: readonly string[], valueOf: (f: string) => string | null): string | null {
  const given = valueOf("--up");
  if (given) {
    const abs = resolve(ROOT, given);
    return existsSync(abs) ? relative(ROOT, abs).replace(/\\/g, "/") : null;
  }
  void argv;
  const stem = basename(inverseRel).replace(/_down\.sql$/, ".sql");
  for (const dir of ["migrations/campaign", "migrations"]) {
    if (existsSync(resolve(ROOT, dir, stem))) return `${dir}/${stem}`;
  }
  return null;
}

async function ledgerRebase(path: string, argv: readonly string[]): Promise<number> {
  {
    const draftRefusal = draftLedgerRefusal(path);
    if (draftRefusal) {
      console.error(`${TAG.fail}${draftRefusal}`);
      return 1;
    }
  }
  const valueOf = (flag: string): string | null => {
    const eq = argv.find((a) => a.startsWith(`${flag}=`));
    if (eq) return eq.slice(flag.length + 1).trim() || null;
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[i + 1]!.trim() : null;
  };
  const target = parseTargetFlag(argv);
  if (target === "branch") {
    console.error(
      `${TAG.fail}--ledger-rebase runs at --target clone (the proof) or --target production (the ` +
        `rebase). The branch is a schema-only transplant, not a copy of production, so running a ` +
        `file there proves nothing about what production holds.`,
    );
    return 1;
  }
  if (!existsSync(path)) {
    console.error(`${TAG.fail}${path} does not exist.`);
    return 1;
  }
  const rel = relative(ROOT, resolve(path)).replace(/\\/g, "/");
  if (rel.startsWith("..") || !rel.startsWith("migrations/")) {
    console.error(`${TAG.fail}${rel} is not a migration of this repository.`);
    return 1;
  }
  const filename = basename(path);
  const onDisk = readFileSync(path, "utf8");
  // `--with-bytes <file>`: the bytes being PROVEN and ledgered, when they are not the file's own —
  // a corrected inverse. They reach the file only at the production rebase, in the same step as
  // the ledger row, so the tree and the ledger never disagree in between.
  const withBytesArg = valueOf("--with-bytes");
  if (withBytesArg && !existsSync(resolve(ROOT, withBytesArg))) {
    console.error(`${TAG.fail}--with-bytes ${withBytesArg} does not exist.`);
    return 1;
  }
  const current = withBytesArg ? readFileSync(resolve(ROOT, withBytesArg), "utf8") : onDisk;
  const newChecksum = sha256(current);
  const trimmedChecksum = sha256(current.replace(/\s+$/, ""));
  const isInverse = rel.startsWith(`migrations/${INVERSE_DIRNAME}/`);
  if (withBytesArg && !isInverse) {
    console.error(
      `${TAG.fail}--with-bytes is for an INVERSE whose row is rebased onto corrected bytes (chair ruling ` +
        `2026-09-23). An up-file's bytes are frozen history: write a new migration.`,
    );
    return 1;
  }
  const upRel = isInverse ? upFileFor(rel, argv, valueOf) : null;
  if (isInverse && !upRel) {
    console.error(
      `${TAG.fail}${rel} is an inverse, and its proof is a round trip through its up-file — which ` +
        `could not be found. Name it: --up migrations/campaign/<file>.sql`,
    );
    return 1;
  }
  const upSql = upRel ? readFileSync(resolve(ROOT, upRel), "utf8") : null;
  const upSha = upSql !== null ? sha256(upSql) : null;
  const upForms = upSql !== null ? [sha256(upSql), sha256(upSql.replace(/\s+$/, ""))] : [];
  const branchRef = loadBranchRef(ROOT, branchRefOverride(argv));
  let cloneRef: CloneRef | null = null;
  try {
    cloneRef = loadCloneRef(ROOT, cloneRefOverride(argv));
  } catch (err) {
    if (target === "clone") {
      console.error(`${TAG.fail}${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }
  const lane = valueOf("--lane");
  const reason = valueOf("--reason");
  /** The up-file must be the bytes the target's ledger says ran — a round trip through other bytes is fiction. */
  const upRefusal = async (client: pg.Client): Promise<string | null> => {
    if (!upRel) return null;
    const upRow = await ledgerRow(client, basename(upRel));
    if (!upRow) return `the up-file ${upRel} has no ledger row here, so it never ran and cannot anchor a round trip.`;
    if (!upForms.includes(upRow.checksum)) {
      return (
        `the up-file ${upRel} is not the bytes the ledger says ran (ledger ${upRow.checksum.slice(0, 12)}…, ` +
        `file ${String(upSha).slice(0, 12)}…). Its own row must agree before it can prove its inverse.`
      );
    }
    return null;
  };

  // ── THE PROOF, on the clone ────────────────────────────────────────────────
  if (target === "clone") {
    let env: DbEnv;
    try {
      env = { ...loadCloneDbEnv(ROOT, cloneRef!) };
      assertConfiguredHostMatchesTarget(env, "clone", branchRef, cloneRef);
    } catch (err) {
      console.error(`${TAG.fail}${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
    const client = await connect(env);
    try {
      const sysid = await assertServerMatchesTarget((s) => client.query(s), "clone", branchRef, filename, cloneRef);
      const row = await client.query<{ checksum: string; applied_at: string; receipts: RebaseReceipt[] | null }>(
        `select checksum, applied_at::text as applied_at,
                (to_jsonb(m) -> '${RECEIPT_COLUMN}') as receipts
           from public._schema_migrations m where source = $1 and filename = $2`,
        [SOURCE, filename],
      );
      const r = row.rows[0];
      if (!r) {
        console.error(
          `${TAG.fail}${filename} has no ledger row on the clone (a copy of production's ledger), so ` +
            `production never ran it and there is nothing to rebase. Apply it normally.`,
        );
        return 1;
      }
      const up = await upRefusal(client);
      if (up) {
        console.error(`${TAG.fail}REFUSED — ${up}`);
        return 1;
      }
      // If this clone's row was already rebased by an earlier proof run, the checksum production
      // holds is the FIRST receipt's `was`, not the row's current value.
      const firstWas = Array.isArray(r.receipts) && r.receipts.length ? r.receipts[0]!.was : null;
      const ledgered = r.checksum === newChecksum && firstWas ? firstWas : r.checksum;
      if ([newChecksum, trimmedChecksum].includes(ledgered)) {
        console.log(`${TAG.ok}${filename}'s ledger row already names these bytes. There is nothing to rebase.`);
        return 0;
      }
      console.log(
        `${C.bold}ledger rebase proof${isInverse ? " (round trip)" : ""}${C.reset} ${C.white}${rel}${C.reset} ` +
          `${C.dim}(sha256 ${newChecksum}${withBytesArg ? `, from ${withBytesArg}` : ""}` +
          `${upRel ? `; up-file ${upRel} ${upSha}` : ""}); the ledger holds ${ledgered} from ${r.applied_at}; ` +
          `clone ${cloneRef!.cloneRef} (${cloneRef!.cloneName})${C.reset}`,
      );
      let concurrent: ObjectDeltaRecord[];
      let objects: number;
      let extra: Partial<RebaseProof> = {};
      if (isInverse) {
        const m = await onCloneRolledBack(client, (q) => measureRoundTrip(q, upSql!, current));
        printRoundTrip(m);
        if (!roundTripHolds(m)) {
          console.error(
            `${TAG.fail}THE ROUND TRIP DOES NOT HOLD — ${m.error ? "a leg did not run" : m.inverseEffect.length === 0
              ? "the inverse changed nothing, and a no-op inverse proves nothing"
              : `${m.deltas.length} object(s) are not what the up-file left, ${m.inverseRowsWritten.length} table(s) written by the inverse`}. ` +
              `No proof was written and no ledger row moved.`,
          );
          return 1;
        }
        concurrent = m.concurrent;
        objects = m.objectsInventoried;
        extra = {
          mode: "round-trip",
          up_file: upRel!,
          up_sha256: upSha!,
          inverse_effect: m.inverseEffect,
          up_over_live: m.upOverLive,
        };
      } else {
        const m = await measureOnClone(client, current);
        printMeasurement(m);
        if (!isIdempotent(m)) {
          console.error(
            `${TAG.fail}NOT IDEMPOTENT — ${filename}'s committed bytes CHANGE the live state ` +
              `(${m.deltas.length} object(s), ${m.rowsWritten.length} table(s) written${m.error ? ", or it did not run" : ""}). ` +
              `They do not describe what production holds, so its ledger row cannot be moved onto ` +
              `them. No proof was written and no ledger row moved. The remedy is a superseding ` +
              `migration that makes live match what this file says, or a chair ruling on the file.`,
          );
          return 1;
        }
        concurrent = m.concurrent;
        objects = m.objectsInventoried;
      }
      const measuredAt = new Date().toISOString();
      const body = {
        kind: "ledger-rebase-proof",
        version: 1,
        file: rel,
        sha256: newChecksum,
        target: "clone",
        clone_ref: cloneRef!.cloneRef,
        clone_name: cloneRef!.cloneName,
        system_identifier: sysid,
        ledgered_checksum: ledgered,
        ledger_applied_at: r.applied_at,
        measured_at: measuredAt,
        objects_inventoried: objects,
        deltas: [],
        rows_written: [],
        concurrent_noise: concurrent,
        verdict: isInverse ? "round-trip" : "idempotent",
        runner: REBASE_RUNNER,
        ...extra,
      } as Omit<RebaseProof, "proof_sha256">;
      const proof: RebaseProof = { ...body, proof_sha256: proofHashOf(body) };
      const proofPath = writeRebaseProof(MIGRATIONS_DIR, proof);
      if (withBytesArg) {
        const staged = stagedBytesPath(MIGRATIONS_DIR, newChecksum);
        if (resolve(ROOT, withBytesArg) !== staged) writeFileSync(staged, current, "utf8");
        console.log(`${TAG.info}the proven bytes are staged at ${relative(ROOT, staged)}; the production rebase writes them into ${rel}.`);
      }
      console.log(
        `${TAG.ok}${isInverse ? "ROUND TRIP HOLDS — the second up leaves exactly what the first did, and the inverse wrote no rows" : "IDEMPOTENT — 0 objects changed and 0 rows written"}. ` +
          `Proof written: ${relative(ROOT, proofPath)} ${C.dim}(proof sha256 ${proof.proof_sha256})${C.reset}`,
      );
      if (r.checksum !== newChecksum) {
        const receipt: RebaseReceipt = {
          kind: "ledger-rebase",
          was: r.checksum,
          now: newChecksum,
          reason: reason ?? "clone rehearsal of the ledger-rebase write path",
          chair_step_confirmed: null,
          lane,
          target: "clone",
          clone_proof: {
            path: relative(ROOT, proofPath),
            sha256: proof.proof_sha256,
            clone_ref: cloneRef!.cloneRef,
            measured_at: measuredAt,
          },
          runner: REBASE_RUNNER,
          rebased_at: measuredAt,
        };
        const w = await rebaseReceiptWrite(client, filename, r.checksum, newChecksum, receipt, path);
        if (!w.ok) {
          console.error(`${TAG.fail}the clone's ledger row could not be moved (the write path is NOT proven): ${w.why}`);
          return 1;
        }
        console.log(
          rebaseSentence({ filename, target: "clone", was: r.checksum, now: newChecksum, cloneRef: cloneRef!.cloneRef, measuredAt, roundTrip: isInverse }),
        );
      }
      return 0;
    } finally {
      await client.end().catch(() => {});
    }
  }

  // ── THE REBASE, on production — executes nothing ──────────────────────────
  const refuse = (why: string): number => {
    console.error(`${TAG.fail}REFUSED — ${why}\n       Nothing was executed and no ledger row moved.`);
    return 1;
  };
  if (!reason) return refuse(`--reason "<one sentence: why these bytes, not the lost ones>" is required; it is kept on the row forever.`);
  if (!lane) return refuse(`--lane <lane> is required: every production rebase is attributable to one lane.`);
  const chairRefusal = await confirmChairStep(
    filename,
    `ledger rebase of ${filename}: ${reason}`,
    argv.flatMap((a, i) =>
      a === "--confirm-chair-step" && argv[i + 1] ? [basename(argv[i + 1]!)] :
      a.startsWith("--confirm-chair-step=") ? [basename(a.slice("--confirm-chair-step=".length))] : [],
    ),
  );
  if (chairRefusal) return refuse(chairRefusal);
  if (current !== onDisk && !withBytesArg) return refuse(`internal: bytes differ from the file with no --with-bytes.`);
  const proof = loadRebaseProof(MIGRATIONS_DIR, newChecksum);
  if (!proof) {
    return refuse(proofRefusal(null, { file: rel, sha256: newChecksum, ledgeredChecksum: "", now: new Date() })!);
  }
  // No branch lock: the rehearsal branch that held campaign_watch.build_lock was deleted
  // 2026-09-26. What authorises a production rebase is the clone proof above and --lane.

  const env = loadDbEnv();
  if ("missing" in env) return refuse(`missing ${env.missing.join(", ")} — cannot reach the production ledger.`);
  try {
    assertConfiguredHostMatchesTarget(env, "production", branchRef, cloneRef);
  } catch (err) {
    return refuse(err instanceof Error ? err.message : String(err));
  }
  if (!isInsideWindow()) {
    console.warn(
      `${TAG.warn}outside the 1–4 AM Pacific window. This executes no migration, but it may add the ` +
        `${RECEIPT_COLUMN} column to public._schema_migrations (a brief ACCESS EXCLUSIVE on the ledger, ` +
        `lock_timeout 5s).`,
    );
  }
  const client = await connect(env);
  try {
    await assertServerMatchesTarget((s) => client.query(s), "production", branchRef, filename, cloneRef);
    const row = await ledgerRow(client, filename);
    if (!row) return refuse(`${filename} has no ledger row on production; there is nothing to rebase.`);
    if ([newChecksum, trimmedChecksum].includes(row.checksum)) {
      console.log(`${TAG.ok}${filename}'s production ledger row already names these bytes. There is nothing to rebase.`);
      return 0;
    }
    const up = await upRefusal(client);
    if (up) return refuse(up);
    const why = proofRefusal(proof, {
      file: rel,
      sha256: newChecksum,
      ledgeredChecksum: row.checksum,
      now: new Date(),
      ...(upRel ? { upFile: upRel, upSha256: upSha! } : {}),
    });
    if (why) return refuse(why);
    const rebasedAt = new Date().toISOString();
    const receipt: RebaseReceipt = {
      kind: "ledger-rebase",
      was: row.checksum,
      now: newChecksum,
      reason,
      chair_step_confirmed: filename,
      lane,
      target: "production",
      clone_proof: {
        path: relative(ROOT, rebaseProofPath(MIGRATIONS_DIR, newChecksum)),
        sha256: proof.proof_sha256,
        clone_ref: proof.clone_ref,
        measured_at: proof.measured_at,
      },
      runner: REBASE_RUNNER,
      rebased_at: rebasedAt,
    };
    const w = await rebaseReceiptWrite(client, filename, row.checksum, newChecksum, receipt, path);
    if (!w.ok) return refuse(w.why);
    // THE ONE EDIT OF A LEDGERED FILE THIS PRIMITIVE MAKES: a corrected inverse lands in its file
    // in the same step its row moves onto it, with a receipt the commit guard turns into a
    // `ledger-rebase:` trailer. Before this line the tree and the ledger agreed on the old bytes;
    // after it, on the new ones.
    if (current !== onDisk) {
      writeFileSync(path, current, "utf8");
      try {
        const gitDir = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: ROOT, encoding: "utf8" }).trim();
        const receiptFile = receiptPath(resolve(ROOT, gitDir));
        const line = rebaseTrailerLine(rel, newChecksum);
        const already = existsSync(receiptFile) ? readFileSync(receiptFile, "utf8") : "";
        if (!already.includes(line)) writeFileSync(receiptFile, `${already}${line}\n`, "utf8");
        console.log(`${TAG.info}${rel} now carries the proven bytes; the next commit carries ${line}.`);
      } catch (err) {
        console.error(`${TAG.warn}the commit receipt could not be written (${(err as Error)?.message ?? String(err)}); the snapshot still moved, so the guard passes on the bytes alone.`);
      }
    }
    try {
      recordAppliedRow({ relPath: rel, source: SOURCE, filename, checksum: newChecksum, appliedAt: row.applied_at });
    } catch (err) {
      console.error(
        `${TAG.warn}${LEDGER_SNAPSHOT_REL} could not be updated (${(err as Error)?.message ?? String(err)}); ` +
          `run pnpm refresh:ledger-snapshot.`,
      );
    }
    const shrunk = shrinkGrandfathered(GRANDFATHER_PATH, rel, {
      was: row.checksum,
      now: newChecksum,
      proofSha256: proof.proof_sha256,
      at: new Date(rebasedAt),
    });
    console.log(
      rebaseSentence({ filename, target: "production", was: row.checksum, now: newChecksum, cloneRef: proof.clone_ref, measuredAt: proof.measured_at, roundTrip: isInverse }),
    );
    console.log(
      `${TAG.info}${LEDGER_SNAPSHOT_REL} moved onto the new bytes` +
        (shrunk ? `, and ${relative(ROOT, GRANDFATHER_PATH)} shrank by this name through its ratchet (last_shrunk_by ${LEDGER_REBASE_LANE})` : ``) +
        `. Commit ${current !== onDisk ? `${rel} and ` : ""}those two files.`,
    );
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * RED then GREEN. Part one needs no database: the production proof gate refuses every way a
 * proof can be wrong. Part two runs PLANTED scratch files on the clone — written to a temp dir,
 * never into this checkout — and requires the non-idempotent ones to be refused.
 */
async function ledgerRebaseSelfTest(argv: readonly string[]): Promise<number> {
  let failed = 0;
  const ok = (s: string) => console.log(`${TAG.ok}self-test ${s}`);
  const bad = (s: string) => {
    console.error(`${TAG.fail}SELF-TEST FAILED — ${s}`);
    failed++;
  };

  // ── part one: the proof gate, no database ──
  const now = new Date();
  const sha = sha256("select 1;\n");
  const base: Omit<RebaseProof, "proof_sha256"> = {
    kind: "ledger-rebase-proof", version: 1, file: "migrations/campaign/x.sql", sha256: sha, target: "clone",
    clone_ref: "clone", clone_name: "clone", system_identifier: "1", ledgered_checksum: "a".repeat(64),
    ledger_applied_at: "2026-09-19", measured_at: now.toISOString(), objects_inventoried: 1, deltas: [],
    rows_written: [], concurrent_noise: [], verdict: "idempotent", runner: REBASE_RUNNER,
  };
  const sealed = (b: Omit<RebaseProof, "proof_sha256">): RebaseProof => ({ ...b, proof_sha256: proofHashOf(b) });
  const want = { file: base.file, sha256: sha, ledgeredChecksum: base.ledgered_checksum, now };
  const gate: Array<[string, RebaseProof | null, boolean]> = [
    ["a missing proof", null, false],
    ["a proof of other bytes", sealed({ ...base, sha256: sha256("select 2;\n") }), false],
    ["a stale proof (40 h old)", sealed({ ...base, measured_at: new Date(now.getTime() - 40 * 3_600_000).toISOString() }), false],
    ["a hand-edited proof", { ...sealed(base), objects_inventoried: 2 }, false],
    ["a proof taken on production", sealed({ ...base, target: "production" as "clone" }), false],
    ["a proof carrying a delta", sealed({ ...base, deltas: [{ direction: "added", kind: "function", object: "public.f()", before: null, after: "x" }] }), false],
    ["a proof taken against another ledger checksum", sealed({ ...base, ledgered_checksum: "b".repeat(64) }), false],
    ["a fresh, sealed, idempotent proof of these bytes", sealed(base), true],
    ["an idempotence proof offered for an inverse", sealed(base), false],
  ];
  const rtBase = {
    ...base,
    file: "migrations/inverse/x_down.sql",
    mode: "round-trip" as const,
    verdict: "round-trip" as const,
    up_file: "migrations/campaign/x.sql",
    up_sha256: sha256("create function x();\n"),
    inverse_effect: [{ direction: "removed" as const, kind: "function", object: "public.x()", before: "x", after: null }],
    up_over_live: [],
  };
  const rtWant = { ...want, file: rtBase.file, upFile: rtBase.up_file, upSha256: rtBase.up_sha256 };
  const rtGate: Array<[string, RebaseProof, boolean]> = [
    ["a round-trip proof through OTHER up-file bytes", sealed({ ...rtBase, up_sha256: sha256("other\n") }), false],
    ["a round-trip proof paired with another up-file", sealed({ ...rtBase, up_file: "migrations/campaign/y.sql" }), false],
    ["a round-trip proof whose inverse changed nothing", sealed({ ...rtBase, inverse_effect: [] }), false],
    ["a fresh, sealed round-trip proof of these two files", sealed(rtBase), true],
  ];
  for (const [name, p, accept] of rtGate) {
    const why = proofRefusal(p, rtWant);
    if ((why === null) === accept) ok(`${accept ? "GREEN" : "RED"} — the production gate ${accept ? "accepts" : "refuses"} ${name}.`);
    else bad(`the production gate ${accept ? "refused" : "ACCEPTED"} ${name}${why ? `: ${why}` : ""}.`);
  }
  for (const [name, p, accept] of gate) {
    const why = proofRefusal(p, name.includes("offered for an inverse") ? { ...rtWant, file: base.file } : want);
    if ((why === null) === accept) ok(`${accept ? "GREEN" : "RED"} — the production gate ${accept ? "accepts" : "refuses"} ${name}.`);
    else bad(`the production gate ${accept ? "refused" : "ACCEPTED"} ${name}${why ? `: ${why}` : ""}.`);
  }

  // ── part two: planted files on the clone ──
  if (argv.includes("--no-db")) {
    console.log(`${TAG.warn}--no-db: the clone half was NOT run, so the measurement is unproven.`);
    return failed ? 1 : 0;
  }
  const scratch = mkdtempSync(join(tmpdir(), "ledger-rebase-selftest-"));
  const tag = `zz_ledger_rebase_selftest_${process.pid}`;
  const planted: Array<[string, string, boolean]> = [
    [
      "a file that creates a function live does not have",
      `create or replace function public.${tag}() returns int language sql as $$ select 1 $$;\n`,
      false,
    ],
    [
      "a file that CHANGES a live object (its comment)",
      `comment on table public._schema_migrations is 'ledger-rebase self-test: a comment is state too';\n`,
      false,
    ],
    [
      "a file that writes a row, even the same value back",
      `update platform.feature_knob set label = label where feature = 'custom' and key = 'agent_schema_changes';\n`,
      false,
    ],
    ["a file that does not run at all", `select * from public.${tag}_no_such_table;\n`, false],
    ["a file whose every statement is a no-op against live", `create schema if not exists public;\nselect 1;\n`, true],
  ];
  const ref = loadCloneRef(ROOT, cloneRefOverride(argv));
  const env = { ...loadCloneDbEnv(ROOT, ref) };
  const branchRef = loadBranchRef(ROOT, branchRefOverride(argv));
  assertConfiguredHostMatchesTarget(env, "clone", branchRef, ref);
  const client = await connect(env);
  try {
    await assertServerMatchesTarget((s) => client.query(s), "clone", branchRef, "--ledger-rebase --self-test", ref);
    for (const [name, sql, idem] of planted) {
      const file = join(scratch, `${name.replace(/[^a-z]+/g, "_").slice(0, 40)}.sql`);
      writeFileSync(file, sql, "utf8");
      const m = await measureOnClone(client, readFileSync(file, "utf8"));
      const verdict = isIdempotent(m);
      const what = `${m.deltas.length} object delta(s), ${m.rowsWritten.length} table(s) written${m.error ? ", did not run" : ""}`;
      if (verdict === idem) ok(`${idem ? "GREEN" : "RED"} — ${name}: ${idem ? "proven idempotent" : "refused"} (${what}).`);
      else bad(`${name} was judged ${verdict ? "IDEMPOTENT" : "not idempotent"} (${what}).`);
    }
    // ROUND TRIP (chair ruling 2026-09-23): planted up/inverse pairs. `pre` runs first inside the
    // same rolled-back transaction, so to the proof it is LIVE state the up-file did not create.
    const rt = `zz_ledger_rebase_rt_${process.pid}`;
    const upPlant = `create or replace function public.${rt}_made() returns int language sql as $$ select 1 $$;\n`;
    const pairs: Array<[string, string, string, boolean]> = [
      [
        "an inverse that drops something its up-file did not create",
        `create function public.${rt}_pre() returns int language sql as $$ select 0 $$;\n`,
        `drop function public.${rt}_made();\ndrop function public.${rt}_pre();\n`,
        false,
      ],
      ["an inverse that changes nothing", "", `select 1;\n`, false],
      [
        "an inverse that writes a row",
        "",
        `drop function public.${rt}_made();\nupdate platform.feature_knob set label = label where feature = 'custom' and key = 'agent_schema_changes';\n`,
        false,
      ],
      ["an inverse that removes exactly what its up-file made", "", `drop function public.${rt}_made();\n`, true],
    ];
    for (const [name, pre, inv, holds] of pairs) {
      const upFile = join(scratch, `rt_up_${pairs.findIndex((x) => x[0] === name)}.sql`);
      const invFile = join(scratch, `rt_down_${pairs.findIndex((x) => x[0] === name)}.sql`);
      writeFileSync(upFile, upPlant, "utf8");
      writeFileSync(invFile, inv, "utf8");
      const m = await onCloneRolledBack(client, async (q) => {
        if (pre) await q(pre);
        return measureRoundTrip(q, readFileSync(upFile, "utf8"), readFileSync(invFile, "utf8"));
      });
      const verdict = roundTripHolds(m);
      const what =
        `${m.deltas.length} object(s) not restored, inverse changed ${m.inverseEffect.length}, ` +
        `inverse wrote ${m.inverseRowsWritten.map((r) => `${r.table}:${r.tuples}`).join(",") || "nothing it names"}${m.error ? `, ${m.error}` : ""}`;
      if (verdict === holds) ok(`${holds ? "GREEN" : "RED"} — round trip, ${name}: ${holds ? "holds" : "refused"} (${what}).`);
      else bad(`round trip, ${name}, was judged ${verdict ? "HOLDING" : "not holding"} (${what}).`);
    }
    const rtLeft = await client.query(`select count(*)::int as n from pg_proc where proname like $1`, [`${rt}%`]);
    if (Number(rtLeft.rows[0]?.n ?? 0) === 0) ok(`GREEN — no round-trip plant survived on the clone.`);
    else bad(`a round-trip plant (${rt}_*) SURVIVED on the clone.`);

    // Nothing planted may survive: the scratch function must not exist after the rollback.
    const left = await client.query(`select count(*)::int as n from pg_proc where proname = $1`, [tag]);
    if (Number(left.rows[0]?.n ?? 0) === 0) ok(`GREEN — nothing planted survived on the clone (${tag} is absent).`);
    else bad(`${tag} SURVIVED on the clone — the proof did not roll back.`);
  } finally {
    await client.end().catch(() => {});
  }
  console.log(`${TAG.info}planted files: ${scratch} (outside this checkout)`);
  if (failed) {
    console.error(`${TAG.fail}${failed} self-test arm(s) failed. --ledger-rebase is NOT safe to run.`);
    return 1;
  }
  console.log(`${TAG.ok}--ledger-rebase self-test: every arm held.`);
  return 0;
}

async function main(): Promise<number> {
  // The rehearsal branch was deleted 2026-09-26: `--target branch` is an announced alias of
  // `--target clone`, rewritten in process.argv itself so every reader below sees the clone.
  process.argv = [...process.argv.slice(0, 2), ...aliasBranchTargetToClone(process.argv.slice(2))];
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
  if (argv.includes("--ledger-rebase")) {
    if (argv.includes("--self-test")) return ledgerRebaseSelfTest(argv);
    const i = argv.indexOf("--ledger-rebase");
    const skip = new Set(["--target", "--lane", "--reason", "--confirm-chair-step", "--clone-ref", "--branch-ref", "--up", "--with-bytes"]);
    const given = argv.slice(i + 1).find((a, k, rest) => !a.startsWith("--") && !(k > 0 && skip.has(rest[k - 1]!)));
    if (!given) {
      console.error(
        `${TAG.fail}--ledger-rebase needs a file: pnpm db:apply --ledger-rebase ` +
          `migrations/campaign/<file>.sql --target clone|production`,
      );
      return 1;
    }
    return ledgerRebase(resolve(ROOT, given), argv);
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

  if (argv.includes("--draft-self-test")) return draftSelfTest();
  if (argv.includes("--rule-dates-self-test")) return ruleDatesSelfTest();
  if (argv.includes("--campaign-auth-self-test")) return campaignAuthSelfTest(argv);
  if (argv.includes("--policy-only-self-test")) return policyOnlySelfTest();
  if (argv.includes("--window-class-self-test")) return windowClassSelfTest();
  if (argv.includes("--ground-gate-self-test")) return groundGateSelfTest();
  if (argv.includes("--clone-self-test")) return cloneSelfTest(statementTimeout);
  if (argv.includes("--target-self-test")) return targetSelfTest(statementTimeout);
  if (argv.includes("--self-test")) return selfTest(statementTimeout, argv);

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
        `--target clone --lane <lane>\n` +
        `  …and the same command with --target production (the clone pair is printed, never required).`,
    );
    return 1;
  }

  // `--target branch` (space form) leaves "branch" in argv as a bare word; it is
  // the flag's VALUE, never the migration file. Same for --source and --lane.
  const valueIdxs = new Set<number>();
  for (const flag of ["--target", "--source", "--lane", "--statement-timeout", "--branch-ref", "--clone-ref", "--judged-as-of"]) {
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

  // `--judged-as-of <production applied_at>`: clone only, refused by name anywhere else.
  const judgedAsOfRaw = valueOf("--judged-as-of");
  const judgedRefused = judgedAsOfRefusal(target, judgedAsOfRaw);
  if (judgedRefused) {
    console.error(`${TAG.fail}${judgedRefused}`);
    return 1;
  }
  const judgedAsOf = judgedAsOfRaw === null ? null : parseAppliedAt(judgedAsOfRaw);

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
    cloneRefPath: cloneRefOverride(argv),
    confirmedChairSteps,
    pairedWith,
    judgedAsOf,
  });
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}db:apply — unexpected error:${C.reset}`, err);
    process.exit(2);
  },
);

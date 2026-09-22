/**
 * `pnpm db:rehearse <file.sql> --target clone` - RULE 27 IN ONE COMMAND, MEASURED.
 * ===========================================================================
 *
 * Rule 27 is: apply the up, run the inverse, apply the up again. Three legs, on a
 * rehearsal database, proving that the file lands, that its inverse really reverses
 * it, and that the file lands again on the state the inverse left behind.
 *
 * WHY THIS EXISTS. Lane W1-ORG-PREP had to prove exactly that for four chair steps
 * against production's real data, and `pnpm db:apply` had no clone target - so the
 * rehearsal ran through `psql --single-transaction` by hand, with NO judgement, NO
 * refusals and NO ledger row, and the lock measurements that found a platform-wide
 * freeze (one `CREATE POLICY` taking ACCESS EXCLUSIVE on twenty-four relations in
 * `auth`, `storage` and `realtime`) were assembled from a second terminal. The method
 * was right and the tooling was absent. This is the method, as a command.
 *
 * WHAT IT DOES, per leg:
 *
 *   1. A MEASURE PASS. The file's top-level statements are executed ONE AT A TIME
 *      inside a single explicit transaction, and after each statement a SECOND
 *      connection samples `pg_locks` for this transaction's backend. Then the
 *      transaction is ROLLED BACK. Nothing this pass does survives it; what survives
 *      is the per-statement millisecond count, the lock modes each statement took, and
 *      - the thing worth the whole exercise - every ACCESS EXCLUSIVE lock on a
 *      relation THE FILE DOES NOT NAME.
 *   2. THE REAL APPLY, by spawning `pnpm db:apply ... --target clone`. Not a
 *      reimplementation: the judgement, the refusals, the guard check, the inverse
 *      ground gate, the chair-step announcement and the marked ledger row are the
 *      runner's, and this harness never writes to the database itself outside the
 *      rolled-back measure pass.
 *
 * TWO DETAILS THAT COST W1-ORG-PREP A WHOLE MEASUREMENT, WRITTEN DOWN HERE SO NOBODY
 * PAYS THEM AGAIN:
 *
 *   - `SET LOCAL application_name` must be set INSIDE the transaction. The Supabase
 *     pooler runs in transaction mode on port 6543; a name set outside can be handed
 *     to a backend another client is using, and the sample fills with locks that are
 *     not yours. The first W1-ORG-PREP measurement was taken that way and was thrown
 *     out.
 *   - An explicit transaction is what pins ONE backend for the whole measure pass.
 *     Without it every statement may land on a different backend and the locks simply
 *     are not there to sample.
 *
 * It refuses any target but `clone`, by name: the measure pass executes DDL and rolls
 * it back, which is a thing you do to a disposable copy of production and to nothing
 * else.
 *
 * -- THE CLONE IS SHARED, SO THE REHEARSAL TAKES THE SAME ROWS AN APPLY WOULD ------------
 *
 * ADDED 2026-09-22 (RUNNER-SAFETY), after measure passes kept dying at the 5 s `lock_timeout`
 * with `55P03 canceling statement due to lock timeout` and no name attached to the cause. The
 * clone is ONE database that every lane rehearses on, and the measure pass takes real ACCESS
 * EXCLUSIVE locks on real objects for the length of its transaction. Two lanes rehearsing files
 * that touch `custom.record` at the same moment is not a rare race - it is the ordinary case on
 * a busy night - and the loser learns nothing except that something, somewhere, held something.
 *
 * 4.7 already says what to do about that, and says it for the APPLY: A LOCK IS A ROW, NOT AN
 * ETIQUETTE. `campaign_watch.build_lock` is a table, one row per object family
 * (`custom` | `platform` | `iam`), taken with `on conflict do nothing` so exactly one holder
 * wins and nobody waits on the database itself. The table is on the clone too - it arrives with
 * every restore of production. A rehearsal that measures lock behaviour on objects a lane is
 * mid-apply on is measuring that lane, not the file. So the rehearsal takes THE SAME ROWS THE
 * APPLY WOULD, ON THE CLONE, before the first measure pass:
 *
 *   - WHICH rows: the file's own `-- lock: custom,platform` header when it carries one;
 *     otherwise every family whose schema the up or the inverse NAMES. A file that names none
 *     takes none and says so.
 *   - WAITING is BOUNDED and NAMED: five attempts, 15 s apart, each printing who holds it and
 *     since when. After the bound it REFUSES - nothing measured, nothing applied - because an
 *     unbounded wait in an unattended run is a hang nobody sees.
 *   - RELEASING happens on EVERY exit path: lock acquisition AND the legs run inside one
 *     `finally`, and SIGINT/SIGTERM release before exiting. A lock leaked by a crashed rehearsal
 *     blocks every lane behind it until a human deletes the row, so the release is a trap, not a
 *     last line.
 *   - A row already held by THIS lane is not taken and is never released here: it belongs to the
 *     apply that took it, and stealing it back at the end of a rehearsal is how a lane loses a
 *     lock it still believes it holds.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { connectDirect } from "./lib/direct-db";
import { functionsTouched, openProductionReadOnly, parityDrift } from "./lib/clone-parity";
import { onceAsync, withBuildLockCleanup } from "./lib/build-lock-cleanup";
import {
  cloneRefOverride,
  loadCloneDbEnv,
  loadCloneRef,
  parseTargetFlag,
  readQuarantineFacts,
  stripCommentsQuoteAware,
  TargetRefusal,
  topLevelStatementsVerbatim,
  INVERSE_DIRNAME,
  CAMPAIGN_DIRNAME,
  CAMPAIGN_SOURCE,
  policyDdlMeasurementPath,
  policyDdlOneTableDeclared,
  policyStatementReasonOf,
  policyStatementTableOf,
  sha256OfBytes,
  topLevelStatements,
  POLICY_DDL_ONE_TABLE_MAX_MS,
} from "./lib/migration-target";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = resolve(ROOT, "migrations");

const ESC = String.fromCharCode(27);
const C = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  white: `${ESC}[37m`,
};
const TAG = {
  ok: `${C.green}[ OK ]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  info: `${C.dim}[ .. ]${C.reset} `,
};

function usage(): void {
  console.error(
    `${C.bold}pnpm db:rehearse <migrations/file.sql> --target clone [--inverse <file.sql>] ` +
      `[--source campaign --lane <lane>] [--statement-timeout=10min]${C.reset}\n` +
      `  Runs rule 27 - up, inverse, up again - on the nightly dev clone, in one command,\n` +
      `  timing every leg and sampling pg_locks after every statement of the up and of the\n` +
      `  inverse. Prints the lock mode each statement took and flags any ACCESS EXCLUSIVE on a\n` +
      `  relation the file does not name.\n` +
      `  --inverse defaults to migrations/inverse/<name>_down.sql, then <name>.inverse.sql.\n` +
      `  Every apply goes through \`pnpm db:apply --target clone\`, so the judgement, the\n` +
      `  refusals and the marked ledger row are the runner's and not this harness's.`,
  );
}

/** `--flag value` or `--flag=value`. */
function valueOf(argv: readonly string[], flag: string): string | null {
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1).trim() || null;
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[i + 1]!.trim() : null;
}

/**
 * Comments removed, so the statement splitter sees only code. THE ONE SHARED STRIPPER
 * (POLICY-LOCK, commit 4622586263) - quote-aware, dollar-quote-tag-aware, block-comment-aware.
 * This file used to carry its own naive dash-dash and block-comment regex strip that was not
 * single-quote aware, so `comment on function x is 'says -- something';` died as "unterminated
 * quoted string". Never a second copy of this logic.
 */
export function stripForStatements(sql: string): string {
  return stripCommentsQuoteAware(sql);
}

/**
 * Every `schema.relation` the file NAMES, as written. Deliberately crude and
 * deliberately GENEROUS - this set is used only to decide which sampled ACCESS
 * EXCLUSIVE locks are a SURPRISE, so over-collecting here can only ever hide a
 * surprise, never invent one.
 */
function relationsNamedBy(sql: string): Set<string> {
  const out = new Set<string>();
  for (const m of stripForStatements(sql).matchAll(
    /\b([a-z_][a-z0-9_$]*)\.([a-z_][a-z0-9_$]*)/gi,
  )) {
    out.add(`${m[1]!.toLowerCase()}.${m[2]!.toLowerCase()}`);
  }
  return out;
}

interface LockRow {
  mode: string;
  relation: string;
  granted: boolean;
}

interface StatementMeasurement {
  index: number;
  ms: number;
  statement: string;
  locks: LockRow[];
  error: string | null;
}

/**
 * THE MEASURE PASS. One explicit transaction, one statement at a time, `pg_locks`
 * sampled from a SECOND connection after each, then ROLLBACK. Returns what each
 * statement cost and what it locked.
 */
async function measure(
  env: ReturnType<typeof loadCloneDbEnv>,
  label: string,
  sql: string,
  statementTimeout: string,
): Promise<{ statements: StatementMeasurement[]; totalMs: number; failedAt: number | null }> {
  const appName = `db:rehearse ${label} ${createHash("sha256")
    .update(`${label}${Date.now()}${Math.random()}`)
    .digest("hex")
    .slice(0, 10)}`;
  const worker = await connectDirect({ ...env }, "db:rehearse (measure)");
  const sampler = await connectDirect({ ...env }, "db:rehearse (pg_locks sampler)");
  const statements = topLevelStatementsVerbatim(stripForStatements(sql));
  const out: StatementMeasurement[] = [];
  let failedAt: number | null = null;
  const t0 = Date.now();
  try {
    await worker.query("begin");
    // INSIDE the transaction. See the header - set outside, a transaction-mode pooler
    // can hand the name to somebody else's backend and the sample is not yours.
    await worker.query(`set local application_name = '${appName.replace(/'/g, "''")}'`);
    await worker.query(`set local lock_timeout = '5s'`);
    await worker.query(`set local statement_timeout = '${statementTimeout}'`);
    for (let i = 0; i < statements.length; i += 1) {
      const stmt = statements[i]!;
      const s0 = Date.now();
      let error: string | null = null;
      try {
        await worker.query(stmt);
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        failedAt = i;
      }
      const ms = Date.now() - s0;
      const locks = await sampler
        .query<LockRow>(
          // An index and a TOAST table are not separate things a file failed to name:
          // they belong to a base relation, and PostgreSQL locks them because it is
          // locking that relation. Reporting `campaign_watch.go_signal_capture_pkey` and
          // `pg_toast.pg_toast_4957060` as "relations this file does not name" is noise
          // that buries the signal - the signal being W1-ORG-PREP's `auth.users`, locked
          // by a file that never mentions auth. So every locked relation is resolved to
          // its BASE relation first: an index through pg_index.indrelid, a TOAST table
          // through the pg_class row that owns it, and a TOAST index through both.
          `with locked as (
             select l.mode, l.granted, l.relation, l.locktype
               from pg_locks l
               join pg_stat_activity a on a.pid = l.pid
              where a.application_name = $1
                and l.pid <> pg_backend_pid()
           ),
           step1 as (
             select k.*,
                    coalesce((select i.indrelid from pg_index i where i.indexrelid = k.relation),
                             k.relation) as rel1
               from locked k
           ),
           step2 as (
             select s.*,
                    coalesce((select o.oid from pg_class o where o.reltoastrelid = s.rel1),
                             s.rel1) as rel2
               from step1 s
           ),
           step3 as (
             select t.*,
                    coalesce((select i2.indrelid from pg_index i2 where i2.indexrelid = t.rel2),
                             t.rel2) as base
               from step2 t
           ),
           step4 as (
             select u.*,
                    coalesce((select o2.oid from pg_class o2 where o2.reltoastrelid = u.base),
                             u.base) as base2
               from step3 u
           )
           select mode,
                  coalesce(n.nspname || '.' || c.relname,
                           locktype || ':' || coalesce(base2::text, '?')) as relation,
                  granted
             from step4
             left join pg_class c on c.oid = base2
             left join pg_namespace n on n.oid = c.relnamespace
            order by mode, 2`,
          [appName],
        )
        .then((r) => r.rows)
        .catch(() => [] as LockRow[]);
      out.push({ index: i + 1, ms, statement: stmt, locks, error });
      if (error) break;
    }
  } finally {
    await worker.query("rollback").catch(() => undefined);
    await worker.end().catch(() => undefined);
    await sampler.end().catch(() => undefined);
  }
  return { statements: out, totalMs: Date.now() - t0, failedAt };
}

/**
 * THE HASH-BOUND MEASUREMENT behind the `-- policy-ddl: one-table` exemption (chair ruling
 * 2026-09-22). The span that matters is FIRST POLICY STATEMENT → END OF TRANSACTION, because
 * that is exactly how long the 23-relation supautils set is held and therefore how long nobody
 * can sign in. The measure pass already executes the file one statement at a time inside one
 * transaction and ends it — the end is a ROLLBACK rather than a COMMIT, and both release the
 * locks at the same moment, so the span is the same span.
 *
 * It is written keyed by the sha256 of THE FILE'S BYTES. Change one character and the record no
 * longer answers for the file, which is the point: the runner must never honour a measurement
 * of an earlier draft. A file that declares nothing still gets its record — a measurement is a
 * fact, not a favour — and the runner reads it only when the file claims the exemption.
 */
function recordPolicyDdlMeasurement(
  filePath: string,
  sql: string,
  m: Awaited<ReturnType<typeof measure>>,
): void {
  const stmts = topLevelStatements(stripCommentsQuoteAware(sql));
  const firstPolicy = stmts.findIndex((st) => policyStatementReasonOf(st) !== null);
  if (firstPolicy < 0) return;
  // The measure pass walks the same top-level statements in the same order.
  const tail = m.statements.filter((st) => st.index - 1 >= firstPolicy);
  if (tail.length === 0) return;
  const ms = tail.reduce((a, st) => a + st.ms, 0);
  const tables = [
    ...new Set(
      stmts
        .map((st) => (policyStatementReasonOf(st) ? policyStatementTableOf(st) : null))
        .filter((t): t is string => t !== null),
    ),
  ].sort();
  const sha = sha256OfBytes(sql);
  const out = policyDdlMeasurementPath(filePath, sha);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify(
      {
        file: basename(filePath),
        sha256: sha,
        target: "clone",
        firstPolicyDdlToEndMs: ms,
        tables,
        measuredAt: new Date().toISOString(),
        note:
          "First policy statement to the end of the measure-pass transaction, measured on the " +
          "dev clone by pnpm db:rehearse. That span is the sign-in freeze. Bound to the file's " +
          "sha256: edit the file and this record stops answering for it.",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  const verdict =
    ms < POLICY_DDL_ONE_TABLE_MAX_MS
      ? `under the ${POLICY_DDL_ONE_TABLE_MAX_MS} ms exemption ceiling`
      : `OVER the ${POLICY_DDL_ONE_TABLE_MAX_MS} ms ceiling — this one waits for the window`;
  console.log(
    `${TAG.ok}policy-DDL freeze measured ${C.bold}${ms} ms${C.reset} ` +
      `${C.dim}(${tables.join(", ") || "no table read from the bytes"}, ${verdict}); recorded at ` +
      `${relative(process.cwd(), out)}${policyDdlOneTableDeclared(sql) ? "" : " (the file claims no exemption)"}${C.reset}`,
  );
}

function printMeasurement(
  label: string,
  file: string,
  m: Awaited<ReturnType<typeof measure>>,
  named: Set<string>,
): { surprises: Array<{ statement: number; relation: string }> } {
  console.log(
    `\n${C.bold}${label}${C.reset} ${C.white}${basename(file)}${C.reset} ` +
      `${C.dim}- measure pass, rolled back (${m.statements.length} statement(s), ${m.totalMs} ms ` +
      `including connection setup)${C.reset}`,
  );
  const surprises: Array<{ statement: number; relation: string }> = [];
  for (const st of m.statements) {
    const head = st.statement.slice(0, 110) + (st.statement.length > 110 ? " ..." : "");
    console.log(`  ${String(st.index).padStart(3)} ${String(st.ms).padStart(6)} ms  ${head}`);
    const byMode = new Map<string, string[]>();
    for (const l of st.locks) {
      const key = `${l.mode}${l.granted ? "" : " (WAITING)"}`;
      if (!byMode.has(key)) byMode.set(key, []);
      byMode.get(key)!.push(l.relation);
    }
    for (const [mode, rels] of [...byMode.entries()].sort()) {
      const uniq = [...new Set(rels)].sort();
      console.log(
        `        ${C.dim}${mode.padEnd(28)}${C.reset} ${uniq.length} ${C.dim}${uniq
          .slice(0, 8)
          .join(", ")}${uniq.length > 8 ? ` ... +${uniq.length - 8}` : ""}${C.reset}`,
      );
      if (/AccessExclusiveLock/i.test(mode)) {
        for (const rel of uniq) {
          if (!named.has(rel) && rel.includes(".")) {
            surprises.push({ statement: st.index, relation: rel });
          }
        }
      }
    }
    if (st.error) {
      console.log(`        ${C.red}error: ${st.error.split("\n")[0]}${C.reset}`);
    }
  }
  if (surprises.length === 0) {
    console.log(`${TAG.ok}no ACCESS EXCLUSIVE lock on any relation this file does not name.`);
  } else {
    const rels = [...new Set(surprises.map((s) => s.relation))].sort();
    console.log(
      `${TAG.warn}ACCESS EXCLUSIVE on ${rels.length} relation(s) this file DOES NOT NAME - held to ` +
        `COMMIT, so nothing else can touch them for the whole transaction:`,
    );
    for (const rel of rels) {
      const at = surprises.filter((s) => s.relation === rel).map((s) => s.statement);
      console.log(
        `    ${C.yellow}${rel}${C.reset} ${C.dim}(first taken by statement ${at[0]})${C.reset}`,
      );
    }
    console.log(
      `${C.dim}    W1-ORG-PREP, 2026-09-22: one plain \`CREATE POLICY\` took ACCESS EXCLUSIVE on ` +
        `twenty-four relations across auth, storage and realtime - every sign-in, file read and ` +
        `realtime message frozen for the transaction's whole duration. If that is what you are ` +
        `looking at, the file belongs in the 1-4 AM window and nowhere else.${C.reset}`,
    );
  }
  return { surprises };
}

// ── campaign_watch.build_lock, on the clone ────────────────────────────────────────────

/**
 * The three object families §4.7 names, and the only values `lock_name` ever holds.
 * `custom` is the record store, `platform` the registry and associations, `iam` the access
 * kernel — the three things every campaign file lands in.
 */
const LOCK_FAMILIES = ["custom", "platform", "iam"] as const;
type LockFamily = (typeof LOCK_FAMILIES)[number];

/** `-- lock: custom,platform` in the file's head — the file saying which rows it needs. */
const LOCK_HEADER_RE = /^\s*--\s*lock\s*:\s*(.+?)\s*$/i;

/**
 * WHICH build_lock rows this rehearsal needs.
 *
 * The header wins when the file carries one, because a file's author knows something the
 * relation scan cannot: a body built with `format()` names its schema at run time. Failing a
 * header, the families are DERIVED from the schemas the up and the inverse name — the same
 * generous `schema.relation` scan `relationsNamedBy` already does, narrowed to the three
 * families. Over-collecting here costs a wait; under-collecting costs the measurement.
 *
 * A `-- lock:` header naming something that is not a family is a REFUSAL, not a shrug: the
 * author asked for a lock that does not exist and the rehearsal would silently take none.
 */
export function locksNeededBy(
  upSql: string,
  downSql: string,
): { families: LockFamily[]; from: string } {
  for (const line of upSql.split("\n", 40)) {
    const m = line.match(LOCK_HEADER_RE);
    if (!m) continue;
    const asked = m[1]!
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    const bad = asked.filter((a) => !(LOCK_FAMILIES as readonly string[]).includes(a));
    if (bad.length) {
      throw new TargetRefusal(
        `\`-- lock: ${m[1]}\` names something that is not a build_lock family: ${bad.join(", ")}.\n` +
          `  The rows are one per object family: ${LOCK_FAMILIES.join(" | ")} (4.7). Refusing rather\n` +
          `  than taking no lock at all because the header could not be read.`,
      );
    }
    return { families: [...new Set(asked)] as LockFamily[], from: `the file's \`-- lock:\` header` };
  }
  const named = new Set<string>();
  for (const rel of [...relationsNamedBy(upSql), ...relationsNamedBy(downSql)]) {
    named.add(rel.split(".")[0]!);
  }
  const families = LOCK_FAMILIES.filter((f) => named.has(f));
  return { families: [...families], from: `the schemas the up and the inverse name` };
}

interface HeldLock {
  lockName: string;
  heldBy: string;
  takenAt: string;
  note: string | null;
}

const LOCK_ATTEMPTS = 5;
const LOCK_WAIT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Take every family this rehearsal needs, in a FIXED order (the `LOCK_FAMILIES` order), so two
 * rehearsals that need the same two families can never take them in opposite orders and wait on
 * each other. Returns the families this process actually acquired — the only ones it may ever
 * release.
 *
 * Bounded: five attempts, 15 s apart, each naming the holder. A row already held by US is not
 * an obstacle and is not acquired: the apply that took it still owns it.
 */
async function takeBuildLocks(
  env: ReturnType<typeof loadCloneDbEnv>,
  families: readonly LockFamily[],
  heldBy: string,
  note: string,
  /**
   * The caller's live list, appended to AS EACH ROW IS TAKEN — never returned at the end.
   * Measured 2026-09-22: a Ctrl-C during the wait for the SECOND family killed the process
   * with the FIRST family's row already in the table and the caller still holding an empty
   * list, so the trap released nothing and the row was leaked. The trap is armed before the
   * first insert and reads this array, so there is no window where a row is held by a process
   * that does not know it holds it.
   */
  acquired: LockFamily[],
): Promise<{ refusal: string | null }> {
  const client = await connectDirect({ ...env }, "db:rehearse (build_lock)");
  try {
    for (const family of [...LOCK_FAMILIES].filter((f) => families.includes(f))) {
      let got = false;
      for (let attempt = 1; attempt <= LOCK_ATTEMPTS && !got; attempt += 1) {
        const ins = await client.query<HeldLock>(
          `insert into campaign_watch.build_lock (lock_name, held_by, note)
           values ($1, $2, $3)
           on conflict (lock_name) do nothing
           returning lock_name as "lockName", held_by as "heldBy", taken_at::text as "takenAt", note`,
          [family, heldBy, note],
        );
        if (ins.rows.length === 1) {
          got = true;
          acquired.push(family);
          console.log(
            `${TAG.ok}LOCK:${family} taken on the clone by ${C.bold}${heldBy}${C.reset} ` +
              `${C.dim}(attempt ${attempt})${C.reset}`,
          );
          break;
        }
        const cur = await client.query<HeldLock>(
          `select lock_name as "lockName", held_by as "heldBy", taken_at::text as "takenAt", note,
                  (now() - taken_at)::text as held_for
             from campaign_watch.build_lock where lock_name = $1`,
          [family],
        );
        const row = cur.rows[0] as (HeldLock & { held_for?: string }) | undefined;
        if (!row) continue; // released between the insert and the read — try again at once.
        if (row.heldBy === heldBy) {
          console.log(
            `${TAG.ok}LOCK:${family} is ALREADY held by ${C.bold}${heldBy}${C.reset} ` +
              `${C.dim}(since ${row.takenAt}) — this rehearsal did not take it and will not release ` +
              `it; it belongs to the apply that did.${C.reset}`,
          );
          got = true;
          break;
        }
        if (attempt === LOCK_ATTEMPTS) {
          return {
            refusal:
              `LOCK:${family} on the clone is held by ${C.bold}${row.heldBy}${C.reset} since ` +
              `${row.takenAt} (${row.held_for ?? "?"})${row.note ? ` — "${row.note}"` : ""}.\n` +
              `  Waited ${LOCK_ATTEMPTS} x ${formatDurationMs(LOCK_WAIT_MS, { style: "compact" })} and it is still held, so NOTHING was ` +
              `measured and nothing was applied.\n` +
              `  A measure pass that runs while ${row.heldBy} is mid-apply on ${family} measures ` +
              `${row.heldBy}, not this file — its statements would queue behind their locks and die at\n` +
              `  the 5s lock_timeout with no name attached. Re-run when the row is gone:\n` +
              `    select lock_name, held_by, taken_at, now() - taken_at as held_for\n` +
              `      from campaign_watch.build_lock;`,
          };
        }
        console.log(
          `${TAG.warn}LOCK:${family} is held by ${C.bold}${row.heldBy}${C.reset} since ` +
            `${row.takenAt}${row.note ? ` ("${row.note}")` : ""} — waiting ` +
            `${formatDurationMs(LOCK_WAIT_MS, { style: "compact" })} (attempt ${attempt} of ${LOCK_ATTEMPTS})`,
        );
        await sleep(LOCK_WAIT_MS);
      }
    }
    return { refusal: null };
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Release exactly what this process took, and say so. `held_by` is in the WHERE clause, so a row
 * somebody else now holds is never deleted; a row that returns nothing is announced LOUDLY with
 * the SQL to look at, because a lock this process believes it released and did not is the next
 * lane's mystery.
 */
async function releaseBuildLocks(
  env: ReturnType<typeof loadCloneDbEnv>,
  acquired: readonly LockFamily[],
  heldBy: string,
): Promise<void> {
  if (acquired.length === 0) return;
  let client;
  try {
    client = await connectDirect({ ...env }, "db:rehearse (build_lock release)");
  } catch (err) {
    console.error(
      `${TAG.fail}COULD NOT CONNECT TO RELEASE ${acquired.map((f) => `LOCK:${f}`).join(", ")} on the ` +
        `clone: ${err instanceof Error ? err.message : String(err)}\n` +
        `  Those rows are still there and every lane that needs them is now waiting. Delete them:\n` +
        `    delete from campaign_watch.build_lock where held_by = '${heldBy}';`,
    );
    return;
  }
  try {
    for (const family of acquired) {
      const out = await client
        .query<{ heldBy: string }>(
          `delete from campaign_watch.build_lock
            where lock_name = $1 and held_by = $2 returning held_by as "heldBy"`,
          [family, heldBy],
        )
        .catch((e: unknown) => ({ rows: [], err: e }) as { rows: never[]; err: unknown });
      if (out.rows.length === 1) {
        console.log(`${TAG.ok}LOCK:${family} released ${C.dim}(held_by ${heldBy})${C.reset}`);
      } else {
        console.error(
          `${TAG.fail}LOCK:${family} did NOT release — no row matched (lock_name = '${family}' and ` +
            `held_by = '${heldBy}').\n` +
            `  Either somebody deleted it already or somebody else now holds it. Look, do not guess:\n` +
            `    select * from campaign_watch.build_lock where lock_name = '${family}';`,
        );
      }
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

function guessInverse(upPath: string): string | null {
  const name = basename(upPath).replace(/\.sql$/i, "");
  const candidates = [
    resolve(MIGRATIONS_DIR, INVERSE_DIRNAME, `${name}_down.sql`),
    resolve(MIGRATIONS_DIR, INVERSE_DIRNAME, `${name}.inverse.sql`),
    resolve(MIGRATIONS_DIR, INVERSE_DIRNAME, `${name}_down.inverse.sql`),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function apply(args: string[]): Promise<{ code: number; ms: number }> {
  const { spawnSync } = await import("node:child_process");
  const t0 = Date.now();
  const r = spawnSync("npx", ["tsx", resolve(ROOT, "scripts", "apply-migration.ts"), ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
    timeout: 1_800_000,
  });
  return { code: r.status ?? 2, ms: Date.now() - t0 };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  let target;
  try {
    target = parseTargetFlag(argv);
  } catch (err) {
    console.error(`${TAG.fail}${err instanceof TargetRefusal ? err.message : String(err)}`);
    return 1;
  }
  if (target !== "clone") {
    console.error(
      `${TAG.fail}pnpm db:rehearse runs on the dev clone and nowhere else - you passed ` +
        `--target ${target}.\n` +
        `  Its measure pass EXECUTES the file's statements and rolls them back, which is a thing\n` +
        `  you do to a disposable physical copy of production and to nothing else. The clone is\n` +
        `  the only database where the lock behaviour it measures is production's lock behaviour.\n` +
        `  Refusing rather than measuring somewhere the numbers would not mean anything.`,
    );
    return 1;
  }

  const statementTimeout = valueOf(argv, "--statement-timeout") ?? "10min";
  const lane = valueOf(argv, "--lane");
  const source = valueOf(argv, "--source");
  const inverseArg = valueOf(argv, "--inverse");

  const valueIdxs = new Set<number>();
  for (const flag of [
    "--target",
    "--source",
    "--lane",
    "--statement-timeout",
    "--inverse",
    "--clone-ref",
  ]) {
    const i = argv.indexOf(flag);
    if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--")) valueIdxs.add(i + 1);
  }
  const positional = argv.filter((a, i) => !a.startsWith("--") && !valueIdxs.has(i));
  if (positional.length !== 1) {
    usage();
    return 1;
  }
  const given = resolve(process.cwd(), positional[0]!);
  const alt = resolve(MIGRATIONS_DIR, positional[0]!);
  const resolvedUp = existsSync(given) ? given : existsSync(alt) ? alt : null;
  if (!resolvedUp) {
    console.error(`${TAG.fail}No such file: ${positional[0]}`);
    return 1;
  }
  // Re-bound as a plain string: the legs below run inside a nested function so the release
  // trap can wrap them, and a null-narrowing does not follow a value into a closure.
  const upPath: string = resolvedUp;

  const measureOnly = argv.includes("--measure-only");
  const resolvedInverse = inverseArg
    ? existsSync(resolve(process.cwd(), inverseArg))
      ? resolve(process.cwd(), inverseArg)
      : resolve(MIGRATIONS_DIR, inverseArg)
    : guessInverse(upPath);
  if (!measureOnly && (!resolvedInverse || !existsSync(resolvedInverse))) {
    console.error(
      `${TAG.fail}${relative(ROOT, upPath)} has no inverse, and rule 27 IS the inverse.\n` +
        `  Looked for migrations/${INVERSE_DIRNAME}/<name>_down.sql and <name>.inverse.sql.\n` +
        `  4.13 requires every migration to carry its own down-migration in the same commit.\n` +
        `  Write it, or name it with --inverse <file.sql>. Refusing rather than rehearsing half\n` +
        `  of rule 27 and calling it rule 27.`,
    );
    return 1;
  }
  const inversePath: string = resolvedInverse ?? upPath;

  // The clone's identity and its own connection - never SUPABASE_MATRIX_*.
  // Typed explicitly: both are read from inside `runLegs` below, and an inferred `any`
  // there would silently un-type the measure pass and the lock helpers.
  let cloneRef: ReturnType<typeof loadCloneRef>;
  let env: ReturnType<typeof loadCloneDbEnv>;
  try {
    cloneRef = loadCloneRef(ROOT, cloneRefOverride(argv));
    env = loadCloneDbEnv(ROOT, cloneRef);
  } catch (err) {
    console.error(`${TAG.fail}${err instanceof TargetRefusal ? err.message : String(err)}`);
    return 1;
  }

  // The quarantine facts, before anything executes. `pnpm db:apply --target clone`
  // asserts them too; the measure pass runs DDL and must not be the one path that does
  // not.
  {
    const probe = await connectDirect({ ...env }, "db:rehearse (identity)");
    try {
      const sysid = await probe
        .query<{
          sysid: string;
        }>("select system_identifier::text as sysid from pg_control_system()")
        .then((r) => r.rows[0]?.sysid ?? "");
      const facts = await readQuarantineFacts((sql) => probe.query(sql));
      if (!facts.quarantined) {
        console.error(
          `${TAG.fail}the connected server is NOT QUARANTINED (pg_net ` +
            `${facts.pgNetInstalled ? "installed" : "absent"}, ${facts.activeCronJobs} active ` +
            `pg_cron job(s)), so it is not the dev clone - and it answers pg_control_system() ` +
            `with ${sysid}, which is production's own number, because a data clone is a physical ` +
            `restore.\n  Nothing was executed.`,
        );
        return 1;
      }
      console.log(
        `${TAG.ok}dev clone ${C.bold}${cloneRef.cloneRef}${C.reset} ${C.dim}(${cloneRef.cloneName}) - ` +
          `system_identifier ${sysid}, quarantined (pg_net absent, no active cron job), ` +
          `connection from ${env.from}${C.reset}`,
      );
    } finally {
      await probe.end().catch(() => undefined);
    }
  }

  const upSql = readFileSync(upPath, "utf8");
  const downSql = readFileSync(inversePath, "utf8");
  const upNamed = relationsNamedBy(upSql);
  const downNamed = relationsNamedBy(downSql);

  console.log(
    `\n${C.bold}db:rehearse${C.reset} ${C.white}${relative(ROOT, upPath)}${C.reset}\n` +
      `${TAG.info}inverse: ${relative(ROOT, inversePath)}\n` +
      `${TAG.info}rule 27 - up, inverse, up again, on the clone, every apply through pnpm db:apply`,
  );

  const common = ["--target", "clone", `--statement-timeout=${statementTimeout}`];
  const inCampaign = !relative(resolve(MIGRATIONS_DIR, CAMPAIGN_DIRNAME), upPath).startsWith("..");
  const campaignFlags =
    source === CAMPAIGN_SOURCE || inCampaign
      ? ["--source", CAMPAIGN_SOURCE, ...(lane ? ["--lane", lane] : [])]
      : [];
  if (campaignFlags.length && !lane) {
    console.error(
      `${TAG.fail}${relative(ROOT, upPath)} is a campaign migration and no --lane was named.\n` +
        `  Every campaign apply is attributable to ONE lane. Add --lane <lane>.`,
    );
    return 1;
  }

  // ── the build_lock rows, taken BEFORE the first measure pass ──────────────
  let families;
  let lockFrom: string;
  try {
    ({ families, from: lockFrom } = locksNeededBy(upSql, downSql));
  } catch (err) {
    console.error(`${TAG.fail}${err instanceof TargetRefusal ? err.message : String(err)}`);
    return 1;
  }
  // The holder id. A lane's own id when it named one, so a row its APPLY already holds is
  // recognised as its own rather than waited on; otherwise a name that says what this is and
  // carries the pid, so two rehearsals of the same file are two holders and not one.
  const upStem = basename(upPath).replace(/\.sql$/i, "");
  const heldBy = lane ?? `db:rehearse:${upStem}:${process.pid}`;
  // Appended to by takeBuildLocks as each row lands, and read by the trap below, which is
  // armed BEFORE the first insert: a row taken by a process that dies waiting for the next
  // one is still this process's row to release.
  const acquired: LockFamily[] = [];
  const releaseOnce = onceAsync(() => releaseBuildLocks(env, acquired, heldBy));
  const onSignal = (sig: NodeJS.Signals) => {
    void (async () => {
      console.error(
        `\n${TAG.warn}${sig} — releasing ${acquired.length} build_lock row(s) before exiting.`,
      );
      await releaseOnce();
      process.exit(130);
    })();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  return await withBuildLockCleanup(
    async () => {
      if (families.length === 0) {
        console.log(
          `${TAG.info}no build_lock family is named by either file (${lockFrom}) — nothing to take. ` +
            `A measure pass on objects outside custom/platform/iam serialises against nobody.`,
        );
      } else {
        console.log(
          `${TAG.info}build_lock families needed: ${families.map((f) => `LOCK:${f}`).join(", ")} ` +
            `${C.dim}(from ${lockFrom}) — taken on the clone as ${heldBy}, the same rows an apply ` +
            `would take, so this measure pass is measuring this file and not another lane${C.reset}`,
        );
        const taken = await takeBuildLocks(
          env,
          families,
          heldBy,
          `db:rehearse rule 27 on ${basename(upPath)}`,
          acquired,
        );
        if (taken.refusal) {
          console.error(`${TAG.fail}${taken.refusal}`);
          return 1;
        }
      }

      return await runLegs();
    },
    async () => {
      await releaseOnce();
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    },
  );

  // ── rule 27's three legs, so the release above wraps every one of their exits ──
  async function runLegs(): Promise<number> {
  // -- leg 1: the up ---------------------------------------------------------
  const m1 = await measure(env, "up", upSql, statementTimeout);
  const s1 = printMeasurement("MEASURE - up", upPath, m1, upNamed);
  if (m1.failedAt === null) recordPolicyDdlMeasurement(upPath, upSql, m1);
  // `--measure-only`: the MEASURE PASS and nothing else. It exists because the
  // `-- policy-ddl: one-table` exemption needs ONE NUMBER, and running rule 27's three apply
  // legs on the shared clone to get it is exactly the ceremony that was banned on 2026-09-18.
  // It applies nothing, ledgers nothing, and needs no inverse — so it is never a substitute for
  // rule 27, which every file still owes before it lands anywhere.
  if (measureOnly) {
    if (m1.failedAt !== null) return 1;
    console.log(
      `${TAG.ok}--measure-only: the measure pass ran and rolled back. ` +
        `${C.dim}Rule 27 was NOT run — this proves nothing about the file's inverse.${C.reset}`,
    );
    return 0;
  }
  if (m1.failedAt !== null) {
    console.error(
      `${TAG.fail}the up failed in the measure pass at statement ${m1.failedAt + 1} (rolled back, ` +
        `nothing applied). Fix it before rule 27 can mean anything.`,
    );
    return 1;
  }
  const a1 = await apply([upPath, ...common, ...campaignFlags]);
  if (a1.code !== 0) {
    console.error(`${TAG.fail}rule 27 leg 1 (up) exited ${a1.code}. Nothing further was attempted.`);
    return 1;
  }
  console.log(`${TAG.ok}leg 1 - up applied and ledgered on the clone ${C.dim}(${a1.ms} ms)${C.reset}`);

  // -- leg 2: the inverse ----------------------------------------------------
  const m2 = await measure(env, "inverse", downSql, statementTimeout);
  const s2 = printMeasurement("MEASURE - inverse", inversePath, m2, downNamed);
  if (m2.failedAt !== null) {
    console.error(
      `${TAG.fail}the INVERSE failed in the measure pass at statement ${m2.failedAt + 1} (rolled ` +
        `back). The up is applied on the clone and its inverse does not run - that is the ` +
        `finding, and it is the one rule 27 exists to produce.`,
    );
    return 1;
  }
  const a2 = await apply([inversePath, ...common]);
  if (a2.code !== 0) {
    console.error(
      `${TAG.fail}rule 27 leg 2 (inverse) exited ${a2.code}. The up is applied on the clone and ` +
        `the inverse did not land - say so, do not re-run the up over it.`,
    );
    return 1;
  }
  console.log(`${TAG.ok}leg 2 - inverse applied on the clone ${C.dim}(${a2.ms} ms)${C.reset}`);

  // -- leg 3: the up again, over the state the inverse left ------------------
  // --reapply because leg 1 ledgered these exact bytes: the ledger row matches and the
  // runner would otherwise answer "already applied, byte-identical".
  const a3 = await apply([upPath, ...common, ...campaignFlags, "--reapply"]);
  if (a3.code !== 0) {
    console.error(
      `${TAG.fail}rule 27 leg 3 (up again) exited ${a3.code}. The inverse did not leave the ` +
        `database in a state the up can land on - which means the inverse is wrong, not the up.`,
    );
    return 1;
  }
  console.log(`${TAG.ok}leg 3 - up re-applied on the clone ${C.dim}(${a3.ms} ms)${C.reset}`);

  // -- the exit gate: the clone is a MIRROR, so leg 3 must have put it back ---
  //
  // 🚨 CHAIR RULING 2026-09-22 (lane CLONE-CATCHUP). Lanes may rehearse on the clone ONLY
  // because rule 27's third leg returns it to production parity. A rehearsal that walks away
  // with a function body moved is the defect — and it is not a theoretical one: it is why the
  // nightly catch-up could not carry `doorsdecide3_two_doors_ask_the_wall_in_their_own_body.sql`
  // and `suitestidy2_a_refusal_names_the_door_the_person_called.sql` over on 2026-09-22, since
  // the runner's DD-220 check correctly refuses to write production's next body over a body
  // somebody else moved. So leg 3 is not the end: every function body this pair touches is
  // hashed on the clone AND on production (SELECT-only, the server proving it refuses a write),
  // and a difference is printed BY NAME and exits non-zero. There is no flag that skips it.
  {
    const names = [...new Set([...functionsTouched(upSql), ...functionsTouched(downSql)])].sort();
    if (names.length === 0) {
      console.log(
        `${TAG.info}parity: this pair replaces no function body, so there is nothing to compare.`,
      );
    } else {
      let prod;
      try {
        prod = await openProductionReadOnly(cloneRef.parentRef);
      } catch (err) {
        console.error(
          `${TAG.fail}parity check could not read production: ${(err as Error).message}\n` +
            `  A rehearsal that cannot prove it left the clone level with production is not a ` +
            `finished rehearsal. Refusing rather than passing unmeasured.`,
        );
        return 1;
      }
      const cloneClient = await connectDirect({ ...env }, "db:rehearse (parity, clone)");
      try {
        const drift = await parityDrift(
          async (sql, params) => (await cloneClient.query(sql, params as never)).rows,
          prod.q,
          names,
        );
        if (drift.length) {
          console.error(
            `${TAG.fail}${drift.length} function body/bodies are NOT level with production after ` +
              `leg 3. The clone is the MIRROR; a rehearsal that leaves it moved is the defect.`,
          );
          for (const d of drift) {
            console.error(
              `  ${C.red}- ${d.signature}: ${d.why}\n` +
                `    clone      ${d.onClone ?? "(absent)"}\n` +
                `    production ${d.onProduction ?? "(absent)"}${C.reset}`,
            );
          }
          console.error(
            `  Remedy: put the body back to production's — re-apply production's ledgered bytes ` +
              `of the file that owns it at ${C.bold}--target clone --reapply${C.reset} — then ` +
              `re-run this rehearsal. Do not leave the clone here.`,
          );
          return 1;
        }
        console.log(
          `${TAG.ok}parity: ${names.length} function name(s) hash identically on the clone and on ` +
            `production ${C.dim}(read-only, project ref ${cloneRef.parentRef})${C.reset}`,
        );
      } finally {
        await cloneClient.end().catch(() => undefined);
        await prod.client.end().catch(() => undefined);
      }
    }
  }

  console.log(
    `\n${TAG.ok}${C.bold}rule 27 complete on the dev clone ${cloneRef.cloneRef}${C.reset} - ` +
      `up ${a1.ms} ms, inverse ${a2.ms} ms, up again ${a3.ms} ms ` +
      `${C.dim}(wall time includes connection setup through the pooler)${C.reset}`,
  );
  const allSurprises = [
    ...new Set([...s1.surprises, ...s2.surprises].map((x) => x.relation)),
  ].sort();
  if (allSurprises.length) {
    console.log(
      `${TAG.warn}${allSurprises.length} relation(s) took ACCESS EXCLUSIVE that neither file names: ` +
        `${allSurprises.join(", ")}`,
    );
    console.log(
      `${TAG.warn}That is a lock on something else's table, held to COMMIT. Carry it into the ` +
        `chair step's notes with the seconds beside it.`,
    );
  }
  console.log(
    `${TAG.info}The ledger rows this wrote on the clone are MARKED \`rehearsal_on\` - they are ` +
      `rehearsal rows in a copy of production's ledger, and the next nightly clone refresh ` +
      `restores production over them. That overwrite is expected.`,
  );
  return 0;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}db:rehearse - unexpected error:${C.reset}`, err);
    process.exit(2);
  },
);

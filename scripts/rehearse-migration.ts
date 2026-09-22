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
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { connectDirect } from "./lib/direct-db";
import {
  cloneRefOverride,
  loadCloneDbEnv,
  loadCloneRef,
  parseTargetFlag,
  readQuarantineFacts,
  stripCommentsQuoteAware,
  TargetRefusal,
  topLevelStatements,
  INVERSE_DIRNAME,
  CAMPAIGN_DIRNAME,
  CAMPAIGN_SOURCE,
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
  const statements = topLevelStatements(stripForStatements(sql));
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
  const upPath = existsSync(given) ? given : existsSync(alt) ? alt : null;
  if (!upPath) {
    console.error(`${TAG.fail}No such file: ${positional[0]}`);
    return 1;
  }

  const inversePath = inverseArg
    ? existsSync(resolve(process.cwd(), inverseArg))
      ? resolve(process.cwd(), inverseArg)
      : resolve(MIGRATIONS_DIR, inverseArg)
    : guessInverse(upPath);
  if (!inversePath || !existsSync(inversePath)) {
    console.error(
      `${TAG.fail}${relative(ROOT, upPath)} has no inverse, and rule 27 IS the inverse.\n` +
        `  Looked for migrations/${INVERSE_DIRNAME}/<name>_down.sql and <name>.inverse.sql.\n` +
        `  4.13 requires every migration to carry its own down-migration in the same commit.\n` +
        `  Write it, or name it with --inverse <file.sql>. Refusing rather than rehearsing half\n` +
        `  of rule 27 and calling it rule 27.`,
    );
    return 1;
  }

  // The clone's identity and its own connection - never SUPABASE_MATRIX_*.
  let cloneRef;
  let env;
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

  // -- leg 1: the up ---------------------------------------------------------
  const m1 = await measure(env, "up", upSql, statementTimeout);
  const s1 = printMeasurement("MEASURE - up", upPath, m1, upNamed);
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

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}db:rehearse - unexpected error:${C.reset}`, err);
    process.exit(2);
  },
);

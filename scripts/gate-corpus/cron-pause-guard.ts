#!/usr/bin/env npx tsx
/**
 * `npx tsx scripts/gate-corpus/cron-pause-guard.ts` — PRODUCTION'S NIGHTLY
 * REACHABILITY REPAIR IS NOT LEFT SWITCHED OFF.
 *
 * THE DEFECT THIS CLOSES (ATTACK-4 finding 2, measured 2026-09-16)
 * ---------------------------------------------------------------
 * `cron.job` 21 `reachability-drift-selfheal` runs on production at 09:10 every
 * day and repairs `platform.reachability` when it disagrees with
 * `platform.associations`. The unified-data build book told SIX different cells
 * to pause it — `W0-CORPUS`'s exit, §4.15, §5.7, `V0`'s exit, `V2-ACCESS`'s
 * note and §9.5's register row — and exactly ONE cell (§11.1) to resume it, and
 * that one cell said it had never been paused. A lane following its brief
 * exactly disables production's standing repair at H+5 and nothing in the plan
 * turns it back on.
 *
 * The book is fixed in the same breath as this file: ONE lane (`W0-CORPUS`) may
 * pause it, that same lane's exit proves `active = true` again, and every other
 * cell points at that lane instead of commanding a pause of its own. This guard
 * is the half that does not depend on anyone reading the book.
 *
 * WHAT IT DOES
 * ------------
 *   · reads `cron.job` on the TARGET database — a SELECT, nothing else;
 *   · records what it saw in `campaign_watch.cron_pause` ON THE REHEARSAL
 *     BRANCH, never on production: this guard needs no production DDL and gets
 *     none. The branch is the campaign's own database and the campaign is the
 *     only thing this guard exists for;
 *   · FAILS when the job is ABSENT, and FAILS when it has been INACTIVE for
 *     longer than the ceiling (default 2 hours), naming the remedy verbatim.
 *
 * WHY AN OBSERVATION LEDGER AT ALL. `cron.job` records no timestamp for when
 * `active` last moved, and job 21 runs once a day, so `cron.job_run_details`
 * cannot tell a paused job from one that simply has not come round yet. The
 * elapsed time has to be observed. The ledger is (target system_identifier,
 * jobname) → first_seen_inactive / last_seen_active, and a run that finds the
 * job ACTIVE clears `first_seen_inactive` — so the clock only ever measures a
 * CONTINUOUS pause.
 *
 * THE FIRST SIGHTING of a pause cannot be older than itself: that run RECORDS
 * the pause, prints the deadline it has created, and exits 0. Every later run
 * inside the window prints the time remaining; the first one past it FAILS.
 * That is why the guard's CADENCE is part of the fix and not an afterthought —
 * a guard nobody runs proves nothing, and this file says so rather than
 * implying a schedule it does not own.
 *
 *   npx tsx scripts/gate-corpus/cron-pause-guard.ts                  production
 *   npx tsx scripts/gate-corpus/cron-pause-guard.ts --target branch  the branch
 *   npx tsx scripts/gate-corpus/cron-pause-guard.ts --self-test      prove it can fail
 *   ... --max-pause-hours=2   the ceiling (default 2)
 *   ... --job=<name>          the job (default reachability-drift-selfheal)
 *
 * NOTHING FAILS SILENTLY. A database it cannot reach, a `BRANCH-REF` it cannot
 * read, a `cron` schema it cannot see — each is UNMEASURED and each EXITS 1. A
 * guard that cannot run is never a guard that passed.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadDbEnv } from "../lib/direct-db";
import { loadBranchDbEnv, loadBranchRef, TargetRefusal } from "../lib/migration-target";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
} as const;
const OK = `${C.green}[ OK ]${C.reset}`;
const FAIL = `${C.red}[FAIL]${C.reset}`;
const WARN = `${C.yellow}[WARN]${C.reset}`;
const INFO = `${C.dim}[INFO]${C.reset}`;

/** The job the unified-data campaign is allowed to pause, and nothing else. */
export const WATCHED_JOB = "reachability-drift-selfheal";

/** Two hours. A pause longer than this is a production defect, not a rehearsal. */
export const DEFAULT_MAX_PAUSE_HOURS = 2;

export type VerdictCode =
  | "MISSING"
  | "ACTIVE"
  | "PAUSED_FIRST_SIGHTING"
  | "PAUSED_WITHIN_WINDOW"
  | "PAUSED_TOO_LONG";

export interface Verdict {
  readonly code: VerdictCode;
  /** 0 = the guard passes. 1 = it fails. Nothing in between. */
  readonly exit: 0 | 1;
  readonly message: string;
}

/**
 * THE WHOLE DECISION, as a pure function of what was observed — so it can be
 * proven RED over a table of cases without a paused production job existing.
 * `--self-test` runs that table; the live RED proof is in the commit message.
 */
export function decide(input: {
  readonly job: string;
  readonly found: boolean;
  readonly active: boolean;
  /** When this guard FIRST saw the job inactive, from the ledger. */
  readonly firstSeenInactive: Date | null;
  readonly now: Date;
  readonly maxPauseMs: number;
  readonly where: string;
}): Verdict {
  const { job, found, active, firstSeenInactive, now, maxPauseMs, where } = input;
  const hours = (maxPauseMs / 3_600_000).toFixed(2).replace(/\.00$/, "");
  if (!found) {
    return {
      code: "MISSING",
      exit: 1,
      message:
        `cron job \`${job}\` DOES NOT EXIST on ${where}. It is the standing repair for ` +
        `platform.reachability, and the unified-data campaign's every "the graph agrees with ` +
        `itself" proof assumes it runs nightly. Somebody unscheduled it.\n` +
        `  Remedy: re-create it — select cron.schedule('${job}', '10 9 * * *', $$select ` +
        `platform.reachability_selfheal()$$); — and find out who removed it before trusting any ` +
        `reachability measurement taken since.`,
    };
  }
  if (active) {
    return {
      code: "ACTIVE",
      exit: 0,
      message: `cron job \`${job}\` is ACTIVE on ${where} — production's nightly reachability repair is running.`,
    };
  }
  if (!firstSeenInactive) {
    return {
      code: "PAUSED_FIRST_SIGHTING",
      exit: 0,
      message:
        `cron job \`${job}\` is PAUSED on ${where}, and this is the first time this guard has seen ` +
        `it paused, so it cannot yet be older than now. Recorded. It must be ACTIVE again within ` +
        `${hours}h — ${new Date(now.getTime() + maxPauseMs).toISOString()} — or the next run of ` +
        `this guard FAILS.\n` +
        `  Only W0-CORPUS may pause it, and that lane's own exit resumes it. If no lane is ` +
        `running: select cron.alter_job((select jobid from cron.job where jobname = '${job}'), ` +
        `active := true);`,
    };
  }
  const elapsed = now.getTime() - firstSeenInactive.getTime();
  if (elapsed > maxPauseMs) {
    return {
      code: "PAUSED_TOO_LONG",
      exit: 1,
      message:
        `cron job \`${job}\` has been PAUSED on ${where} since ${firstSeenInactive.toISOString()} — ` +
        `${(elapsed / 3_600_000).toFixed(2)}h, past the ${hours}h ceiling. Production's nightly ` +
        `reachability repair has not run and platform.reachability may already disagree with ` +
        `platform.associations.\n` +
        `  Remedy, now: select cron.alter_job((select jobid from cron.job where jobname = ` +
        `'${job}'), active := true);\n` +
        `  Then: select count(*) from platform.reachability_drift(); — a non-zero answer is repair ` +
        `work this pause created.`,
    };
  }
  return {
    code: "PAUSED_WITHIN_WINDOW",
    exit: 0,
    message:
      `cron job \`${job}\` is PAUSED on ${where}, first seen ${firstSeenInactive.toISOString()} — ` +
      `${(elapsed / 3_600_000).toFixed(2)}h of the ${hours}h ceiling used, ` +
      `${((maxPauseMs - elapsed) / 3_600_000).toFixed(2)}h left before this guard FAILS.`,
  };
}

const LEDGER_SCHEMA = "campaign_watch";
const LEDGER = `${LEDGER_SCHEMA}.cron_pause`;

async function ensureLedger(branch: pg.Client): Promise<void> {
  await branch.query(`create schema if not exists ${LEDGER_SCHEMA}`);
  await branch.query(
    `create table if not exists ${LEDGER} (
       target_sysid text not null,
       jobname text not null,
       first_seen_inactive timestamptz,
       last_seen_active timestamptz,
       last_checked_at timestamptz not null default now(),
       last_verdict text,
       primary key (target_sysid, jobname)
     )`,
  );
}

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return undefined;
  return a === `--${name}` ? (process.argv[process.argv.indexOf(a) + 1] ?? "") : a.slice(name.length + 3);
}

/** The decision table. Every branch of `decide`, including both failures. */
function selfTest(): number {
  const now = new Date("2026-09-16T12:00:00.000Z");
  const twoHours = 2 * 3_600_000;
  const base = { job: WATCHED_JOB, now, maxPauseMs: twoHours, where: "the self-test" };
  const cases: Array<[string, Parameters<typeof decide>[0], VerdictCode, 0 | 1]> = [
    ["the job is gone", { ...base, found: false, active: false, firstSeenInactive: null }, "MISSING", 1],
    ["the job is active", { ...base, found: true, active: true, firstSeenInactive: null }, "ACTIVE", 0],
    [
      "paused, never seen paused before",
      { ...base, found: true, active: false, firstSeenInactive: null },
      "PAUSED_FIRST_SIGHTING",
      0,
    ],
    [
      "paused 1h59m — inside the window",
      { ...base, found: true, active: false, firstSeenInactive: new Date(now.getTime() - 119 * 60_000) },
      "PAUSED_WITHIN_WINDOW",
      0,
    ],
    [
      "paused 2h01m — past the window",
      { ...base, found: true, active: false, firstSeenInactive: new Date(now.getTime() - 121 * 60_000) },
      "PAUSED_TOO_LONG",
      1,
    ],
    [
      "paused three days",
      { ...base, found: true, active: false, firstSeenInactive: new Date(now.getTime() - 72 * 3_600_000) },
      "PAUSED_TOO_LONG",
      1,
    ],
  ];
  let bad = 0;
  for (const [what, input, wantCode, wantExit] of cases) {
    const v = decide(input);
    if (v.code !== wantCode || v.exit !== wantExit) {
      bad += 1;
      console.error(`${FAIL}self-test: ${what} → ${v.code}/${v.exit}, expected ${wantCode}/${wantExit}`);
    } else {
      console.log(`${OK}self-test: ${what} → ${v.code} (exit ${v.exit})`);
    }
  }
  // A guard whose failing cases cannot fail is not a guard.
  const failing = cases.filter(([, , , e]) => e === 1).length;
  if (failing < 2) {
    bad += 1;
    console.error(`${FAIL}self-test: only ${failing} case(s) can FAIL — this guard cannot bite.`);
  }
  if (bad) {
    console.error(`${FAIL}cron-pause-guard --self-test FAILED (${bad})`);
    return 1;
  }
  console.log(
    `${OK}cron-pause-guard --self-test passed — ${cases.length} cases, ${failing} of them FAILING. The guard can fail.`,
  );
  return 0;
}

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) return selfTest();

  const job = arg("job") || WATCHED_JOB;
  const hours = Number(arg("max-pause-hours") ?? DEFAULT_MAX_PAUSE_HOURS);
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error(`${FAIL}--max-pause-hours must be a positive number; got ${arg("max-pause-hours")}`);
    return 1;
  }
  const maxPauseMs = hours * 3_600_000;
  const target = (arg("target") || "production") as "production" | "branch";
  if (target !== "production" && target !== "branch") {
    console.error(`${FAIL}--target must be production or branch; got ${target}`);
    return 1;
  }

  let ref;
  try {
    ref = loadBranchRef(ROOT);
  } catch (err) {
    console.error(
      `${FAIL}UNMEASURED — BRANCH-REF is unreadable, so this guard cannot record what it saw:\n` +
        `${err instanceof TargetRefusal ? err.message : String(err)}`,
    );
    return 1;
  }

  const open = async (which: "production" | "branch"): Promise<pg.Client> => {
    if (which === "branch") {
      const e = loadBranchDbEnv(ROOT, ref);
      return new pg.Client({
        host: e.host,
        port: e.port,
        user: e.user,
        password: e.password,
        database: e.database,
        ssl: { rejectUnauthorized: false },
        application_name: "cron-pause-guard",
      });
    }
    const e = loadDbEnv();
    if ("missing" in e) throw new Error(`production credentials missing: ${e.missing.join(", ")}`);
    return new pg.Client({
      host: e.host,
      port: e.port,
      user: e.user,
      password: e.password,
      database: e.database,
      ssl: { rejectUnauthorized: false },
      application_name: "cron-pause-guard (read only)",
    });
  };

  let watched: pg.Client;
  let ledgerDb: pg.Client;
  try {
    watched = await open(target);
    await watched.connect();
  } catch (err) {
    console.error(
      `${FAIL}UNMEASURED — could not open ${target}: ${err instanceof Error ? err.message : String(err)}\n` +
        `  A guard that cannot run is never a guard that passed.`,
    );
    return 1;
  }
  try {
    ledgerDb = target === "branch" ? watched : await open("branch");
    if (ledgerDb !== watched) await ledgerDb.connect();
  } catch (err) {
    await watched.end().catch(() => {});
    console.error(
      `${FAIL}UNMEASURED — the observation ledger lives on the rehearsal branch and it could not be ` +
        `opened: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  try {
    const sysid = (
      await watched.query<{ s: string }>("select system_identifier::text s from pg_control_system()")
    ).rows[0]!.s;
    const expected = target === "branch" ? ref.systemIdentifier : ref.parentSystemIdentifier;
    if (sysid !== expected) {
      console.error(
        `${FAIL}--target ${target} but the connected server's system_identifier is ${sysid}, not ` +
          `${expected} (${ref.path}). Read from the server, not from the flag. Nothing was recorded.`,
      );
      return 1;
    }
    const where = `${target} (${target === "branch" ? ref.branchRef : ref.parentRef}, sysid ${sysid})`;

    let row;
    try {
      row = (
        await watched.query<{ jobid: string; active: boolean; schedule: string }>(
          `select jobid::text, active, schedule from cron.job where jobname = $1`,
          [job],
        )
      ).rows[0];
    } catch (err) {
      console.error(
        `${FAIL}UNMEASURED — cron.job could not be read on ${where}: ` +
          `${err instanceof Error ? err.message : String(err)}\n` +
          `  This is not "the job is fine"; it is "nobody knows". Fix the access and re-run.`,
      );
      return 1;
    }

    await ensureLedger(ledgerDb);
    const prior = (
      await ledgerDb.query<{ first_seen_inactive: Date | null }>(
        `select first_seen_inactive from ${LEDGER} where target_sysid = $1 and jobname = $2`,
        [sysid, job],
      )
    ).rows[0];

    const now = new Date();
    const verdict = decide({
      job,
      found: Boolean(row),
      active: Boolean(row?.active),
      firstSeenInactive: prior?.first_seen_inactive ?? null,
      now,
      maxPauseMs,
      where,
    });

    // Record BEFORE reporting, so a failing run still leaves the clock running.
    const active = Boolean(row?.active);
    await ledgerDb.query(
      `insert into ${LEDGER} (target_sysid, jobname, first_seen_inactive, last_seen_active, last_checked_at, last_verdict)
         values ($1, $2, case when $3 then null else $4::timestamptz end, case when $3 then $4::timestamptz else null end, $4::timestamptz, $5)
       on conflict (target_sysid, jobname) do update set
         first_seen_inactive = case when $3 then null else coalesce(${LEDGER}.first_seen_inactive, $4::timestamptz) end,
         last_seen_active    = case when $3 then $4::timestamptz else ${LEDGER}.last_seen_active end,
         last_checked_at     = $4::timestamptz,
         last_verdict        = $5`,
      [sysid, job, active, now.toISOString(), verdict.code],
    );

    if (row) {
      console.log(
        `${INFO}cron.job ${row.jobid} \`${job}\` on ${where}: active = ${row.active}, schedule ${row.schedule}` +
          `\n${INFO}observation ledger: ${LEDGER} on branch ${ref.branchRef}`,
      );
    }
    if (verdict.exit === 0) {
      console.log(
        `${verdict.code === "ACTIVE" ? OK : WARN}${verdict.message}\n` +
          `${C.bold}${OK}cron-pause-guard: ${verdict.code}${C.reset}`,
      );
      return 0;
    }
    console.error(`${FAIL}${verdict.message}\n${C.bold}${FAIL}cron-pause-guard: ${verdict.code}${C.reset}`);
    return 1;
  } finally {
    if (ledgerDb !== watched) await ledgerDb.end().catch(() => {});
    await watched.end().catch(() => {});
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}cron-pause-guard — unexpected error:${C.reset}`, err);
    process.exit(2);
  },
);

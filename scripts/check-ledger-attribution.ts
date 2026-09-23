#!/usr/bin/env npx tsx
/**
 * `pnpm check:ledger-attribution:clone` — THE RUNNER'S LEDGER WRITE PATH NAMES WHO APPLIED THE
 * ROW, PROVEN ON THE DEV CLONE (lane LEDGER-LANE, 2026-09-23).
 *
 * It drives the REAL runner (`scripts/apply-migration.ts`, or the file named by
 * `LEDGER_ATTRIBUTION_RUNNER` — which is how the RED half runs the pre-change runner) against the
 * dev clone with a scratch migration committed into a throwaway git repository, then reads the
 * ledger row back and requires every attribution column to hold what the environment said:
 *   · applied_by_lane       == the --lane passed
 *   · applied_by_os_user    == $USER
 *   · applied_by_host       == os.hostname()
 *   · applied_by_session    carries `claude:<the session id this check planted>`
 *   · applied_by_process    names at least one ancestor process
 *   · applied_from_git_head == `<the throwaway repo's HEAD> (file committed)`
 *   · applied_in_window     == the 01:00–04:00 Pacific rule applied to the row's own applied_at
 * A runner that writes the row without attribution FAILS here. The scratch schema and ledger row
 * are removed on every path, and the removal is asserted.
 *
 * Needs the clone to carry the attribution columns
 * (`pnpm db:apply migrations/campaign/ledgerlane_a_ledger_row_names_who_applied_it.sql --source
 * campaign --target clone --lane LEDGER-LANE`); without them it FAILS by name, never skips.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { connectDirect } from "./lib/direct-db";
import { ATTRIBUTION_COLUMNS, IN_WINDOW_SQL } from "./lib/ledger-attribution";
import { cloneRefOverride, loadCloneDbEnv, loadCloneRef } from "./lib/migration-target";

const ROOT = resolve(__dirname, "..");
const SOURCE = "matrx-frontend";

let failures = 0;

async function main(): Promise<number> {
  const fail = (s: string) => {
    failures += 1;
    console.error(`[FAIL] ${s}`);
  };
  const ok = (s: string) => console.log(`[ OK ] ${s}`);

  const ref = loadCloneRef(ROOT, cloneRefOverride(process.argv.slice(2)));
  const env = loadCloneDbEnv(ROOT, ref);
  const client = await connectDirect(env, "check:ledger-attribution (clone)");
  const runner = process.env.LEDGER_ATTRIBUTION_RUNNER ?? resolve(ROOT, "scripts", "apply-migration.ts");
  const runId = randomBytes(6).toString("hex");
  const file = `zz_db_apply_clone_selftest_${runId}.sql`;
  const schema = `zz_ledger_attribution_${runId}`;
  const lane = `LEDGER-LANE-CHECK-${runId}`;
  const session = `ledger-attribution-check-${runId}`;
  const dir = mkdtempSync(join(tmpdir(), "ledger-attribution-"));
  const path = join(dir, file);
  console.log(`check:ledger-attribution — clone ${ref.cloneRef}, runner ${runner.replace(`${ROOT}/`, "")}`);
  try {
    const cols = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = '_schema_migrations'`,
    );
    const have = new Set(cols.rows.map((r) => r.column_name));
    const missing = ATTRIBUTION_COLUMNS.map(([c]) => c).filter((c) => !have.has(c));
    if (missing.length) {
      fail(`the clone's ledger has no ${missing.join(", ")} — apply the ledger migration to the clone first`);
      return 1;
    }
    writeFileSync(
      path,
      `-- target: clone\ncreate schema if not exists ${schema};\ncomment on schema ${schema} is 'ledger attribution check';\n`,
      "utf8",
    );
    const git = (args: string[]) =>
      spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    git(["init", "-q"]);
    git(["-c", "user.email=ledger@check.invalid", "-c", "user.name=ledger-check", "add", file]);
    git(["-c", "user.email=ledger@check.invalid", "-c", "user.name=ledger-check", "commit", "-q", "-m", "scratch"]);
    const head = git(["rev-parse", "HEAD"]).stdout.trim();

    const childEnv = { ...process.env, CLAUDE_CODE_SESSION_ID: session } as NodeJS.ProcessEnv;
    delete childEnv.MATRX_LANE;
    delete childEnv.CLAUDE_SESSION_ID;
    const r = spawnSync("npx", ["tsx", runner, path, "--target", "clone", "--lane", lane], {
      cwd: ROOT,
      encoding: "utf8",
      env: childEnv,
      timeout: 240_000,
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    if (r.status !== 0) {
      fail(`the runner exited ${r.status} on the clone:\n${out.slice(-1500)}`);
      return 1;
    }
    ok(`the runner applied ${file} to the clone`);

    const row = await client.query<Record<string, unknown>>(
      `select to_jsonb(m) as j,
              (to_char(m.applied_at at time zone 'America/Los_Angeles', 'HH24MI')::int between 100 and 400) as expect_in_window
         from public._schema_migrations m where source = $1 and filename = $2`,
      [SOURCE, file],
    );
    const j = (row.rows[0]?.j ?? null) as Record<string, unknown> | null;
    if (!j) {
      fail(`no ledger row for ${file} on the clone`);
      return 1;
    }
    const expectInWindow = row.rows[0]!.expect_in_window as boolean;
    const checks: Array<[string, boolean, unknown]> = [
      ["applied_by_lane is the --lane", j.applied_by_lane === lane, j.applied_by_lane],
      ["applied_by_os_user is $USER", j.applied_by_os_user === (process.env.USER ?? process.env.LOGNAME), j.applied_by_os_user],
      ["applied_by_host is this machine", j.applied_by_host === hostname(), j.applied_by_host],
      [
        "applied_by_session carries the planted session id",
        typeof j.applied_by_session === "string" && j.applied_by_session.includes(`claude:${session}`),
        j.applied_by_session,
      ],
      [
        "applied_by_process names an ancestor process",
        typeof j.applied_by_process === "string" && /^\d+ \S/.test(j.applied_by_process),
        typeof j.applied_by_process === "string" ? j.applied_by_process.slice(0, 120) : j.applied_by_process,
      ],
      [
        "applied_from_git_head is the file's checkout HEAD, committed",
        j.applied_from_git_head === `${head} (file committed)`,
        j.applied_from_git_head,
      ],
      [
        "applied_in_window follows 01:00–04:00 Pacific on the row's own applied_at",
        j.applied_in_window === expectInWindow,
        j.applied_in_window,
      ],
    ];
    for (const [what, pass, got] of checks) (pass ? ok : fail)(`${what} — got ${JSON.stringify(got)}`);
    // The window expression the runner writes, evaluated by the database at fixed instants — so
    // BOTH answers are proven, not only the one the clock happened to give this run.
    for (const [at, want] of [
      ["2026-09-23 09:30:00+00", true], // 02:30 PDT
      ["2026-09-23 11:00:00+00", true], // 04:00 PDT, the inclusive close
      ["2026-09-23 11:51:47+00", false], // 04:51 PDT, the incident
      ["2026-09-23 07:59:00+00", false], // 00:59 PDT
      ["2026-12-01 10:30:00+00", true], // 02:30 PST
    ] as const) {
      const w = await client.query<{ w: boolean }>(
        `select ${IN_WINDOW_SQL.replace("now()", `timestamptz '${at}'`)} as w`,
      );
      (w.rows[0]?.w === want ? ok : fail)(`applied_in_window at ${at} is ${want}`);
    }
    if (typeof j.applied_by_process === "string" && /:[^@\s/]+@/.test(j.applied_by_process.replace(/:\*\*\*@/g, "")))
      fail(`applied_by_process carries what looks like a DSN password`);
    return failures ? 1 : 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
    try {
      await client.query(`drop schema if exists ${schema} cascade`);
      await client.query(`delete from public._schema_migrations where source = $1 and filename = $2`, [SOURCE, file]);
      const left = await client.query<{ s: string; l: string }>(
        `select (select count(*)::text from information_schema.schemata where schema_name = $1) as s,
                (select count(*)::text from public._schema_migrations where source = $2 and filename = $3) as l`,
        [schema, SOURCE, file],
      );
      if (left.rows[0]?.s !== "0" || left.rows[0]?.l !== "0") fail(`cleanup left ${schema} or its ledger row on the clone`);
      else ok(`cleanup verified — ${schema} and its ledger row are gone from the clone`);
    } catch (err) {
      fail(`cleanup on the clone FAILED: ${err instanceof Error ? err.message : String(err)} — remove ${schema} by hand`);
    }
    await client.end().catch(() => {});
    if (failures) console.error(`[FAIL] check:ledger-attribution — ${failures} assertion(s) failed`);
    else console.log(`[ OK ] check:ledger-attribution — the ledger row names who applied it`);
  }
}

main().then(
  (code) => process.exit(code || (failures ? 1 : 0)),
  (err) => {
    console.error(`check:ledger-attribution failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  },
);

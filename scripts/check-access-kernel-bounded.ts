#!/usr/bin/env npx tsx
/**
 * DD-263 — THE ACCESS KERNEL'S WALK IS BOUNDED, AND NO CARRYING CYCLE CAN BE WRITTEN.
 *
 * THE DEFECT THIS GUARD EXISTS FOR (found by the seeded gate corpus, 2026-09-15)
 * -----------------------------------------------------------------------------
 * `iam.has_access_for_base` resolved containment by CALLING ITSELF — once over
 * `platform.reachability`, once over the `platform.entity_relationships` FK parent chain — with
 * no visited set and no depth bound. Its only cycle protection stopped a record that contains
 * ITSELF and nothing one hop longer. So a NEGATIVE access question about a record inside a cycle
 * (A contains B, B contains A) recursed until Postgres killed the statement with
 * `54001 stack depth limit exceeded`: not a refusal, a broken page, reachable by any signed-in
 * person who can create two ordinary relations, at unbounded server cost per attempt.
 *
 * A POSITIVE question about the same loop answers `true` in microseconds — the recursion
 * short-circuits on the first container. Only the walk that must exhaust every path goes round
 * forever. That is why this guard's planted case asks about a principal who holds NOTHING.
 *
 * WHAT IT ASSERTS (every plant inside ONE transaction that is ALWAYS ROLLED BACK)
 * -----------------------------------------------------------------------------
 *  1. The on-stack frame is refused    — hand the kernel a path already containing its own frame.
 *  2. The depth ceiling is refused     — hand it a path of 40 frames.
 *  3. A REAL PLANTED CYCLE answers     — two folders that contain each other through a carrying
 *     association type, asked about a principal with no grant: must return `false` in bounded
 *     time. This is the exact shape that raised 54001 before DD-263.
 *  4. The association write door refuses a cycle when the relation type does not declare
 *     `allows_loops`, and accepts it when it does.
 *  5. The FK-parent write door refuses a folder loop.
 *  6. Both refusal triggers are BOUND and ENABLED, and EVERY self-referential registered
 *     composition/containment relationship has one — so a new one added later is caught here.
 *  7. `platform.carrying_cycles()` is empty on the live graph.
 *
 * NOTHING IS LEFT BEHIND. There is no code path in this file that commits.
 *
 * THE SELF-TEST (prove the guard can fail)
 * ----------------------------------------
 *   pnpm check:access-kernel-bounded:self-test
 * installs the REAL pre-DD-263 kernel body — captured verbatim from production and kept at
 * `scripts/fixtures/dd263-pre-fix-kernel.sql` — inside the transaction, and requires the
 * planted-cycle assertion to raise `54001`. Then it rolls back. A guard that cannot be shown failing is
 * not a guard. It REFUSES to run against production (it replaces a function, however briefly);
 * point it at a branch with ACCESS_KERNEL_GUARD_DATABASE_URL.
 *
 *   pnpm check:access-kernel-bounded            # loud, non-blocking (exit 0)
 *   pnpm check:access-kernel-bounded:strict     # exit 1 on any failed assertion
 *
 * Exit codes: 0 clean (or creds absent) - 1 a failed assertion AND --strict - 2 unexpected error.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connectDirect, loadDbEnv } from "./lib/direct-db";

const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");
const OVERRIDE_URL = process.env.ACCESS_KERNEL_GUARD_DATABASE_URL ?? "";
const PRODUCTION_MARKERS = ["brsgrqvjdzwihsvnfqkf", "db.matrxserver.com"];
const PRE_FIX_KERNEL = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "dd263-pre-fix-kernel.sql");

const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
  white: "\x1b[97m",
};

/** A fixed, recognisable id prefix, so anything that somehow survived would be identifiable. */
const PFX = "c0000000-0000-4dd2-8630-00000000";
const FOLDER_A = `${PFX}0a01`;
const FOLDER_B = `${PFX}0a02`;
const FOLDER_C = `${PFX}0a03`;
const FOLDER_D = `${PFX}0a04`;
const ASSOC_1 = `${PFX}0d01`;
const ASSOC_2 = `${PFX}0d02`;
const ASSOC_3 = `${PFX}0d03`;
const ASSOC_4 = `${PFX}0d04`;
const NOBODY = `${PFX}0f01`;

/** The edge that would CLOSE the C/D loop. Refused, or accepted, depending on `allows_loops`. */
const CLOSE_THE_LOOP_SQL = `insert into platform.associations (id, source_type, source_id, target_type, target_id, label)
   values ($1,'folder',$2,'folder',$3,'dd263-guard')`;

type Finding = { name: string; ok: boolean; detail: string };
const findings: Finding[] = [];
function record(name: string, ok: boolean, detail: string): void {
  findings.push({ name, ok, detail });
  const mark = ok ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
  console.log(`  ${mark}  ${name}${C.dim} - ${detail}${C.reset}`);
}

async function connect(): Promise<{ client: pg.Client; isProduction: boolean; where: string }> {
  if (OVERRIDE_URL) {
    const isProduction = PRODUCTION_MARKERS.some((m) => OVERRIDE_URL.includes(m));
    const client = new pg.Client({
      connectionString: OVERRIDE_URL,
      ssl: { rejectUnauthorized: false },
      application_name: "check-access-kernel-bounded",
    });
    await client.connect();
    return { client, isProduction, where: new URL(OVERRIDE_URL).host };
  }
  const env = loadDbEnv();
  if ("missing" in env) {
    console.log(
      `${C.yellow}check:access-kernel-bounded: database credentials absent (${env.missing.join(", ")}) - skipping.${C.reset}`,
    );
    process.exit(0);
  }
  const client = await connectDirect(env, "check-access-kernel-bounded");
  return { client, isProduction: true, where: env.host };
}

/** Run one statement that is EXPECTED to raise; return the SQLSTATE, or null if it did not. */
async function expectRaise(client: pg.Client, sql: string, params: unknown[] = []): Promise<string | null> {
  await client.query("savepoint s");
  try {
    await client.query(sql, params);
    await client.query("release savepoint s");
    return null;
  } catch (error) {
    await client.query("rollback to savepoint s");
    return (error as { code?: string }).code ?? "unknown";
  }
}

/** Two folders that contain each other through a carrying relation type declared loop-safe. */
async function plantCycle(client: pg.Client): Promise<void> {
  const org = (await client.query<{ id: string }>("select id::text as id from iam.organizations limit 1")).rows[0];
  const user = (await client.query<{ id: string }>("select id::text as id from auth.users limit 1")).rows[0];
  if (!org || !user) throw new Error("no organization or user to hang the planted folders on");
  await client.query("set local app.actor_system = 'check-access-kernel-bounded'");
  // On production `folder` is registered and this is a no-op. A Supabase BRANCH is transplanted
  // schema-only, so its registry is empty and the association type below would fail its FK to
  // platform.entity_types - which would look like a guard failure rather than an empty branch.
  await client.query(
    `insert into platform.entity_types (token, schema_name, table_name, label)
     values ('folder','files','folders','Folder')
     on conflict (token) do nothing`,
  );
  await client.query(
    `insert into files.folders (id, created_by, folder_path, folder_name, organization_id, visibility)
     values ($1,$3,'/dd263-guard-a','dd263 guard A',$2,'internal'),
            ($4,$3,'/dd263-guard-b','dd263 guard B',$2,'internal')`,
    [FOLDER_A, org.id, user.id, FOLDER_B],
  );
  await client.query(
    `insert into platform.association_types
       (source_type, target_type, label, container_side, conveys_max, is_active, allows_loops, notes)
     values ('folder','folder','dd263-guard','target','viewer',true,true,
             'check:access-kernel-bounded - always rolled back')`,
  );
  await client.query(
    `insert into platform.associations (id, source_type, source_id, target_type, target_id, label)
     values ($1,'folder',$2,'folder',$3,'dd263-guard'),
            ($4,'folder',$3,'folder',$2,'dd263-guard')`,
    [ASSOC_1, FOLDER_A, FOLDER_B, ASSOC_2],
  );
}

/**
 * Two more folders, C containing D, through the SAME relation type (its primary key is
 * (source_type, target_type), so there can only be one folder -> folder row). The edge that would
 * close THIS pair's loop is the write the door has to refuse — asked from scratch, rather than by
 * undoing the pair above, whose deletion would churn the very cache the door reads.
 */
async function plantHalfOpenPair(client: pg.Client): Promise<void> {
  const org = (await client.query<{ id: string }>("select id::text as id from iam.organizations limit 1")).rows[0];
  const user = (await client.query<{ id: string }>("select id::text as id from auth.users limit 1")).rows[0];
  if (!org || !user) throw new Error("no organization or user to hang the planted folders on");
  await client.query(
    `insert into files.folders (id, created_by, folder_path, folder_name, organization_id, visibility)
     values ($1,$3,'/dd263-guard-c','dd263 guard C',$2,'internal'),
            ($4,$3,'/dd263-guard-d','dd263 guard D',$2,'internal')`,
    [FOLDER_C, org.id, user.id, FOLDER_D],
  );
  await client.query(
    `insert into platform.associations (id, source_type, source_id, target_type, target_id, label)
     values ($1,'folder',$2,'folder',$3,'dd263-guard')`,
    [ASSOC_3, FOLDER_D, FOLDER_C],
  );
  // The loop above was planted under a declared exemption; the door is now asked the real question.
  await client.query(
    `update platform.association_types set allows_loops = false
     where source_type='folder' and target_type='folder' and label='dd263-guard'`,
  );
}

async function main(): Promise<void> {
  const { client, isProduction, where } = await connect();
  if (SELF_TEST && isProduction) {
    console.error(
      `${C.red}--self-test replaces iam.has_access_for_base for the length of a transaction and REFUSES to do that on production (${where}).${C.reset}\n` +
        `${C.white}Point it at a branch: ACCESS_KERNEL_GUARD_DATABASE_URL=postgresql://... pnpm check:access-kernel-bounded:self-test${C.reset}`,
    );
    await client.end();
    process.exit(2);
  }

  console.log(
    `${C.white}check:access-kernel-bounded${C.reset} ${C.dim}on ${where}` +
      `${SELF_TEST ? " (SELF-TEST: the pre-DD-263 kernel is installed, then rolled back)" : ""}${C.reset}\n`,
  );
  let exitCode = 0;
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '120s'");

    if (SELF_TEST) {
      // Put the REAL pre-DD-263 body back, verbatim (it recurses into the five-argument signature
      // and never reaches the bounded one at all), so the RED this guard claims to catch is the
      // actual defect rather than an approximation of it.
      await client.query(readFileSync(PRE_FIX_KERNEL, "utf8"));
    }

    // 1 + 2 - the two bounds, with nothing planted at all.
    const bounds: Array<[string, string, string]> = [
      ["the on-stack frame is refused", `array['folder:${FOLDER_A}:t']`, "a frame already on the walk"],
      [
        "the depth ceiling is refused",
        "(select array_agg('x:'||g::text) from generate_series(1,40) g)",
        "40 frames deep",
      ],
    ];
    for (const [name, pathExpr, why] of bounds) {
      const r = await client.query<{ a: boolean | null }>(
        `select iam.has_access_for_base($1::uuid,'folder',$2::uuid,'viewer'::public.permission_level,true, ${pathExpr}) as a`,
        [NOBODY, FOLDER_A],
      );
      record(name, r.rows[0]?.a === false, `${why} -> ${String(r.rows[0]?.a)}`);
    }

    // 3 - a REAL planted cycle, asked negatively. The exact shape that raised 54001.
    await plantCycle(client);
    const started = Date.now();
    let cycleAnswer: string;
    let cycleOk = false;
    try {
      const r = await client.query<{ a: boolean | null }>(
        "select iam.has_access_for_base($1::uuid,'folder',$2::uuid,'viewer'::public.permission_level,true) as a",
        [NOBODY, FOLDER_B],
      );
      cycleAnswer = String(r.rows[0]?.a);
      cycleOk = r.rows[0]?.a === false;
    } catch (error) {
      // The pre-DD-263 failure: the statement dies and takes the transaction with it. Start a new
      // one and re-plant so the remaining assertions still run and report.
      cycleAnswer = `${(error as { code?: string }).code ?? "?"} ${(error as Error).message}`;
      await client.query("rollback");
      await client.query("begin");
      await client.query("set local statement_timeout = '120s'");
      await plantCycle(client);
    }
    record(
      "a negative question inside a real carrying cycle answers false",
      cycleOk,
      `${cycleAnswer} in ${Date.now() - started} ms (pre-DD-263: 54001 stack depth limit exceeded)`,
    );

    // 4 - the association write door, both ways. A SECOND pair of folders and a SECOND relation
    // type, so the half-open edge of the pair above is never disturbed: the door is asked about a
    // loop it has to refuse from scratch, not about undoing one that already exists.
    await plantHalfOpenPair(client);
    const refused = await expectRaise(client, CLOSE_THE_LOOP_SQL, [ASSOC_4, FOLDER_C, FOLDER_D]);
    record(
      "the association write door refuses a carrying cycle",
      refused === "23514",
      `sqlstate ${refused ?? "none - THE CYCLE WAS ACCEPTED"}`,
    );

    await client.query(
      `update platform.association_types set allows_loops = true
       where source_type='folder' and target_type='folder' and label='dd263-guard'`,
    );
    const allowed = await expectRaise(client, CLOSE_THE_LOOP_SQL, [ASSOC_4, FOLDER_C, FOLDER_D]);
    record(
      "allows_loops = true is the declared escape hatch",
      allowed === null,
      allowed === null ? "accepted" : `refused with ${allowed} - the knob does nothing`,
    );

    // 5 - the FK-parent write door.
    await client.query("update files.folders set parent_id = $1 where id = $2", [FOLDER_A, FOLDER_B]);
    const fkRefused = await expectRaise(client, "update files.folders set parent_id = $1 where id = $2", [
      FOLDER_B,
      FOLDER_A,
    ]);
    record(
      "the folder parent write door refuses a loop",
      fkRefused === "23514",
      `sqlstate ${fkRefused ?? "none - THE LOOP WAS ACCEPTED"}`,
    );

    // 6 - the triggers are bound, and every self-referential containment has one.
    const bound = (
      await client.query<{ n: string }>(
        `select count(*)::text as n from pg_trigger t
         where t.tgenabled <> 'D'
           and ((t.tgrelid = 'platform.associations'::regclass and t.tgname = 'trg_associations_zz_no_carrying_cycle')
             or (t.tgrelid = 'files.folders'::regclass and t.tgname = 'trg_cld_folders_no_parent_cycle'))`,
      )
    ).rows[0]?.n;
    record("both refusal triggers are bound and enabled", bound === "2", `${bound} of 2`);

    const unguarded = (
      await client.query<{ rel: string }>(
        `select distinct er.child_type || ' (' || et.schema_name || '.' || et.table_name
                         || ' via ' || er.fk_column || ')' as rel
         from platform.entity_relationships er
         join platform.entity_types et on et.token = er.child_type and et.is_active
         where er.kind in ('composition','containment') and er.child_type = er.parent_type
           and not exists (
             select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
             where t.tgrelid = (quote_ident(et.schema_name)||'.'||quote_ident(et.table_name))::regclass
               and p.proname = 'enforce_no_fk_parent_cycle' and t.tgenabled <> 'D')`,
      )
    ).rows.map((r) => r.rel);
    record(
      "every self-referential containment relationship has a bound cycle refusal",
      unguarded.length === 0,
      unguarded.length === 0 ? "none unguarded" : `UNGUARDED: ${unguarded.join(", ")}`,
    );

    // 7 - the live graph is clean. Taken AFTER the rollback, so the plants above cannot flatter it.
    await client.query("rollback");
    const cycles = (
      await client.query<{ n: string }>("select count(*)::text as n from platform.carrying_cycles()")
    ).rows[0]?.n;
    record("the live containment graph carries no cycle", cycles === "0", `${cycles} cycle(s)`);

    const failed = findings.filter((f) => !f.ok);
    console.log("");
    if (SELF_TEST) {
      // Inverted. With the pre-DD-263 body live, the PLANTED-CYCLE assertion must fail, and it
      // must fail with 54001 specifically - a timeout or a wrong answer would mean the guard is
      // catching something other than the unbounded recursion.
      const planted = findings.find((f) => f.name.startsWith("a negative question"));
      if (planted?.ok || !planted?.detail.includes("54001")) {
        console.error(
          `${C.red}SELF-TEST FAILED: with the pre-DD-263 kernel live the planted cycle gave "${planted?.detail}" - expected 54001 stack depth limit exceeded. This guard proves nothing.${C.reset}`,
        );
        exitCode = 1;
      } else {
        console.log(
          `${C.green}SELF-TEST GREEN: with the pre-DD-263 kernel live the planted cycle raised 54001 - the guard is load-bearing.${C.reset}`,
        );
      }
    } else if (failed.length > 0) {
      console.error(
        `${C.red}${failed.length} assertion(s) FAILED.${C.reset} ` +
          `${C.white}DD-263 is not (fully) live here - re-apply migrations/iam_access_kernel_bounded_walk_dd263.sql.${C.reset}`,
      );
      exitCode = STRICT ? 1 : 0;
    } else {
      console.log(
        `${C.green}GREEN - the access kernel's walk is bounded and no carrying cycle can be written.${C.reset}`,
      );
    }
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* the connection is already gone */
    }
    console.error(`${C.red}check:access-kernel-bounded: unexpected error - ${(error as Error).message}${C.reset}`);
    exitCode = 2;
  } finally {
    try {
      await client.query("rollback");
    } catch {
      /* already rolled back */
    }
    await client.end();
  }
  process.exit(exitCode);
}

void main();

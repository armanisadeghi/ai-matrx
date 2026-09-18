#!/usr/bin/env npx tsx
/**
 * DD-263 / DD-263b — THE ACCESS KERNEL'S WALK IS BOUNDED IN **WORK**, AND NO CARRYING RING OF ANY
 * LENGTH CAN BE WRITTEN.
 *
 * THE DEFECT THIS GUARD EXISTS FOR (found by the seeded gate corpus; narrowed twice)
 * -----------------------------------------------------------------------------
 * DD-263 (2026-09-15): `iam.has_access_for_base` resolved containment by CALLING ITSELF — once over
 * `platform.reachability`, once over the `platform.entity_relationships` FK parent chain — with no
 * visited set and no depth bound. A NEGATIVE access question about a record inside a two-node cycle
 * recursed until `54001 stack depth limit exceeded`.
 *
 * DD-263b (V-115, the same day): the DD-263 fix was narrower than the class, in two ways this guard
 * now plants directly.
 *   * The write door decided by asking `platform.reachability`, whose builder stops at `depth < 8`.
 *     A 9-node ring was refused; a TEN-node ring was ACCEPTED.
 *   * `p_path` made every PATH acyclic but did not bound the number of paths. With a ten-node ring
 *     present a negative question never returned — 60 s+ statement timeout, not 54001. So the guard
 *     below asks its planted question under a TIGHT statement timeout: "answers false in bounded
 *     time" is the assertion, and a timeout is a failure.
 *
 * A POSITIVE question about the same ring answers `true` in microseconds — the walk short-circuits
 * on the first container. Only the walk that must exhaust the graph goes round. That is why this
 * guard's planted case asks about a principal who holds NOTHING.
 *
 * WHAT IT ASSERTS (every plant inside ONE transaction that is ALWAYS ROLLED BACK)
 * -----------------------------------------------------------------------------
 *  1. The on-stack frame is refused    — hand the kernel a path already containing its own frame.
 *  2. The depth ceiling is refused     — hand it a path of 40 frames.
 *  3. A REAL PLANTED TEN-NODE RING answers — ten folders each contained by the next through a
 *     carrying association type declared `allows_loops`, asked about a principal with no grant:
 *     must return `false` inside RING_ANSWER_TIMEOUT. This is the exact shape that timed out
 *     before DD-263b and raised 54001 before DD-263.
 *  4. The association write door refuses the closing edge of a TEN-node ring (the one the depth-8
 *     cache could not see) when the relation type does not declare `allows_loops`, and accepts it
 *     when it does.
 *  5. The FK-parent write door refuses a folder loop.
 *  6. Both refusal triggers are BOUND and ENABLED, and EVERY self-referential registered
 *     composition/containment relationship has one — so a new one added later is caught here.
 *  7. `platform.undeclared_carrying_cycles()` is empty on the live graph. DECLARED loops
 *     (`allows_loops = true`, as the gate corpus builds on purpose) are legal and are NOT counted:
 *     a guard that is red for a legal state is a guard nobody can keep green.
 *
 * NOTHING IS LEFT BEHIND. There is no code path in this file that commits.
 *
 * THE SELF-TEST (prove the guard can fail)
 * ----------------------------------------
 *   pnpm check:access-kernel-bounded:self-test
 * installs the REAL pre-DD-263b kernel body — captured verbatim from production and kept at
 * `scripts/fixtures/dd263b-pre-fix-kernel.sql`, the body whose sha256 the DD-263b migration declares
 * in its `-- based-on:` header — inside the transaction, and requires the planted TEN-NODE RING
 * assertion to fail with `57014` (statement timeout) or `54001` (stack depth). Then it rolls back.
 * `--self-test=dd263` installs the older pre-DD-263 body from `dd263-pre-fix-kernel.sql` instead,
 * which fails the same assertion with 54001. A guard that cannot be shown failing is not a guard.
 * It REFUSES to run against production (it replaces a function, however briefly); point it at a
 * branch with ACCESS_KERNEL_GUARD_DATABASE_URL.
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
import { exitAfterDrain } from "./lib/exit-after-drain";

const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.some((a) => a === "--self-test" || a.startsWith("--self-test="));
/** Which pre-fix body the self-test installs: the DD-263b one (default) or the older DD-263 one. */
const SELF_TEST_BODY = process.argv.find((a) => a.startsWith("--self-test="))?.split("=")[1] ?? "dd263b";
const OVERRIDE_URL = process.env.ACCESS_KERNEL_GUARD_DATABASE_URL ?? "";
const PRODUCTION_MARKERS = ["brsgrqvjdzwihsvnfqkf", "db.matrxserver.com"];
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const PRE_FIX_KERNEL = resolve(
  FIXTURES,
  SELF_TEST_BODY === "dd263" ? "dd263-pre-fix-kernel.sql" : "dd263b-pre-fix-kernel.sql",
);

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
const NOBODY = `${PFX}0f01`;

/**
 * TEN, deliberately. `platform.derive_reachability` stops the closure at `depth < 8`, so the
 * closing edge of a ring of nine is still visible in the cache and one of ten is not — which is
 * exactly the door DD-263b had to move off the cache and onto the edges. A ring of nine would pass
 * against the broken door.
 */
const RING_N = 10;
/** The planted ring must be ANSWERED, not merely survived: the pre-DD-263b body needs 60 s+. */
const RING_ANSWER_TIMEOUT = "15s";
const LABEL = "dd263-guard";
/** Ring A (declared loop-safe, closed) and chain B (open; its closing edge is the door's exam). */
const ringId = (set: "a" | "b", i: number) => `${PFX}${set === "a" ? "1" : "2"}${String(i).padStart(3, "0")}`;

/** The edge that would CLOSE a ring. Refused, or accepted, depending on `allows_loops`. */
const CLOSE_THE_RING_SQL = `insert into platform.associations (id, source_type, source_id, target_type, target_id, label)
   values (gen_random_uuid(),'folder',$1,'folder',$2,'${LABEL}')`;

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
    exitAfterDrain(0);
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

/**
 * On production `folder` is registered and this is a no-op. A Supabase BRANCH is transplanted
 * schema-only, so its registry is empty and the association type below would fail its FK to
 * platform.entity_types - which would look like a guard failure rather than an empty branch.
 */
async function ensureFolderType(client: pg.Client): Promise<void> {
  await client.query("set local app.actor_system = 'check-access-kernel-bounded'");
  await client.query(
    `insert into platform.entity_types (token, schema_name, table_name, label)
     values ('folder','files','folders','Folder')
     on conflict (token) do nothing`,
  );
}

/** Two plain folders with no relation of any kind — the FK-parent door's own subjects. */
async function plantPlainFolders(client: pg.Client): Promise<void> {
  const org = (await client.query<{ id: string }>("select id::text as id from iam.organizations limit 1")).rows[0];
  const user = (await client.query<{ id: string }>("select id::text as id from auth.users limit 1")).rows[0];
  if (!org || !user) throw new Error("no organization or user to hang the planted folders on");
  await ensureFolderType(client);
  await client.query(
    `insert into files.folders (id, created_by, folder_path, folder_name, organization_id, visibility)
     values ($1,$3,'/dd263-guard-fk-a','dd263 guard fk A',$2,'internal'),
            ($4,$3,'/dd263-guard-fk-b','dd263 guard fk B',$2,'internal')`,
    [FOLDER_A, org.id, user.id, FOLDER_B],
  );
}

/** The one folder -> folder carrying type (its primary key is (source_type, target_type)). */
async function setRelationType(client: pg.Client, allowsLoops: boolean): Promise<void> {
  await ensureFolderType(client);
  await client.query(
    `insert into platform.association_types
       (source_type, target_type, label, container_side, conveys_max, is_active, allows_loops, notes)
     values ('folder','folder',$1,'target','viewer',true,$2,
             'check:access-kernel-bounded - always rolled back')
     on conflict (source_type, target_type) do update set allows_loops = excluded.allows_loops,
       label = excluded.label, container_side = excluded.container_side, is_active = true`,
    [LABEL, allowsLoops],
  );
}

/**
 * A chain of RING_N folders, each contained by the previous one, through the carrying type above.
 * The CLOSING edge (node 0 contained by node N-1) is left to the caller: closing it is what the
 * write door has to refuse, and closing it under a declared exemption is what the kernel has to
 * answer. TEN nodes, because the depth-8 closure cannot see the edge that closes a ring of ten —
 * a ring of nine passes even against the door DD-263b replaced.
 */
async function plantChain(client: pg.Client, set: "a" | "b"): Promise<string[]> {
  const org = (await client.query<{ id: string }>("select id::text as id from iam.organizations limit 1")).rows[0];
  const user = (await client.query<{ id: string }>("select id::text as id from auth.users limit 1")).rows[0];
  if (!org || !user) throw new Error("no organization or user to hang the planted folders on");
  await ensureFolderType(client);
  const ids = Array.from({ length: RING_N }, (_, i) => ringId(set, i));
  await client.query(
    `insert into files.folders (id, created_by, folder_path, folder_name, organization_id, visibility)
     select u.id::uuid, $2, '/dd263-guard-' || $4 || '/' || u.ord, 'dd263 guard ' || $4 || ' ' || u.ord,
            $1, 'internal'
     from unnest($3::text[]) with ordinality as u(id, ord)`,
    [org.id, user.id, ids, set],
  );
  for (let i = 1; i < RING_N; i += 1) {
    await client.query(
      `insert into platform.associations (id, source_type, source_id, target_type, target_id, label)
       values (gen_random_uuid(),'folder',$1,'folder',$2,'${LABEL}')`,
      [ids[i], ids[i - 1]],
    );
  }
  return ids;
}

async function main(): Promise<void> {
  const { client, isProduction, where } = await connect();
  if (SELF_TEST && isProduction) {
    console.error(
      `${C.red}--self-test replaces iam.has_access_for_base for the length of a transaction and REFUSES to do that on production (${where}).${C.reset}\n` +
        `${C.white}Point it at a branch: ACCESS_KERNEL_GUARD_DATABASE_URL=postgresql://... pnpm check:access-kernel-bounded:self-test${C.reset}`,
    );
    await client.end();
    exitAfterDrain(2);
  }

  console.log(
    `${C.white}check:access-kernel-bounded${C.reset} ${C.dim}on ${where}` +
      `${SELF_TEST ? ` (SELF-TEST: the pre-${SELF_TEST_BODY} kernel is installed, then rolled back)` : ""}${C.reset}\n`,
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

    // 3 - a REAL planted TEN-NODE RING, asked negatively, under a TIGHT timeout. The exact shape
    //     that raised 54001 before DD-263 and then timed out at 60 s+ before DD-263b. The ring is
    //     closed under a DECLARED exemption, because the door below must refuse an undeclared one:
    //     the read end and the write end are two different assertions and each needs its own plant.
    await setRelationType(client, true);
    const ringA = await plantChain(client, "a");
    await client.query(CLOSE_THE_RING_SQL, [ringA[0], ringA[RING_N - 1]]);
    const started = Date.now();
    let ringAnswer: string;
    let ringOk = false;
    try {
      await client.query(`set local statement_timeout = '${RING_ANSWER_TIMEOUT}'`);
      const r = await client.query<{ a: boolean | null }>(
        "select iam.has_access_for_base($1::uuid,'folder',$2::uuid,'viewer'::public.permission_level,true) as a",
        [NOBODY, ringA[RING_N - 5]],
      );
      ringAnswer = String(r.rows[0]?.a);
      ringOk = r.rows[0]?.a === false;
      await client.query("set local statement_timeout = '120s'");
    } catch (error) {
      // The pre-fix failure: the statement dies (57014 timeout, or 54001 before DD-263) and takes
      // the transaction with it. Start a new one and re-plant so the rest still runs and reports.
      ringAnswer = `${(error as { code?: string }).code ?? "?"} ${(error as Error).message}`;
      await client.query("rollback");
      await client.query("begin");
      await client.query("set local statement_timeout = '120s'");
    }
    record(
      `a negative question inside a real ${RING_N}-node carrying ring answers false`,
      ringOk,
      `${ringAnswer} in ${Date.now() - started} ms (pre-DD-263b: 57014 statement timeout; pre-DD-263: 54001)`,
    );

    // 4 - the association write door, both ways, asked about a ring of TEN. Nine would not prove
    //     anything: `platform.derive_reachability` stops the closure at depth 8, so the old
    //     cache-reading door still refused a nine-node ring and accepted this one.
    await setRelationType(client, false);
    const ringB = await plantChain(client, "b");
    const refused = await expectRaise(client, CLOSE_THE_RING_SQL, [ringB[0], ringB[RING_N - 1]]);
    record(
      `the association write door refuses a carrying ring of ${RING_N}`,
      refused === "23514",
      `sqlstate ${refused ?? "none - THE RING WAS ACCEPTED (the door is reading the depth-8 cache)"}`,
    );

    await setRelationType(client, true);
    const allowed = await expectRaise(client, CLOSE_THE_RING_SQL, [ringB[0], ringB[RING_N - 1]]);
    record(
      "allows_loops = true is the declared escape hatch",
      allowed === null,
      allowed === null ? "accepted" : `refused with ${allowed} - the knob does nothing`,
    );

    // 5 - the FK-parent write door.
    await plantPlainFolders(client);
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
      await client.query<{ n: string }>("select count(*)::text as n from platform.undeclared_carrying_cycles()")
    ).rows[0]?.n;
    record(
      "the live containment graph carries no UNDECLARED cycle",
      cycles === "0",
      `${cycles} undeclared cycle(s) (a declared allows_loops loop is legal and is not counted)`,
    );

    const failed = findings.filter((f) => !f.ok);
    console.log("");
    if (SELF_TEST) {
      // Inverted. With the pre-DD-263 body live, the PLANTED-CYCLE assertion must fail, and it
      // must fail with 54001 specifically - a timeout or a wrong answer would mean the guard is
      // catching something other than the unbounded recursion.
      const planted = findings.find((f) => f.name.startsWith("a negative question"));
      const died = planted?.detail.includes("57014") || planted?.detail.includes("54001");
      if (planted?.ok || !died) {
        console.error(
          `${C.red}SELF-TEST FAILED: with the pre-${SELF_TEST_BODY} kernel live the planted ${RING_N}-node ring gave "${planted?.detail}" - expected 57014 (statement timeout) or 54001 (stack depth). This guard proves nothing.${C.reset}`,
        );
        exitCode = 1;
      } else {
        console.log(
          `${C.green}SELF-TEST GREEN: with the pre-${SELF_TEST_BODY} kernel live the planted ${RING_N}-node ring died instead of answering - the guard is load-bearing.${C.reset}`,
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
  exitAfterDrain(exitCode);
}

void main();

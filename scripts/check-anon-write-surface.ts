#!/usr/bin/env npx tsx
/**
 * THE ANON WRITE-SURFACE GUARD - what a signed-out caller can CHANGE (DD-193).
 *
 * WHY THIS EXISTS
 * ---------------
 * `check:anon-column-surface` (DD-186) asks which COLUMNS a signed-out visitor can
 * READ. Nothing asked what one could WRITE, and the answer the database gave on
 * 2026-09-13 was: 286 relations in a PostgREST-exposed schema granted `anon`
 * INSERT, UPDATE, DELETE or MAINTAIN - `admin.admins`, `ops.system_error`,
 * `extend.extension_auth_codes`, `iam.organizations` among them - from a historical
 * `grant all ... to anon`. Seven schemas granted the same on every table created in
 * them from then on, so the surface re-opened by itself with each `create table`.
 *
 * None of it was exploitable that morning: row-level security was on everywhere and
 * every write policy that reached `anon` required an `auth.uid()` that a signed-out
 * caller does not have. That is exactly why it needed a guard rather than a note. A
 * privilege standing beside a closed policy is the safe path next to the unsafe one
 * (DD-181): the day a predicate widens, a policy set is regenerated with an anon arm,
 * or RLS is dropped for a migration, the grant turns that into an anonymous write in
 * the same instant, and nothing anywhere would have asked.
 *
 * THE RULE IT ENFORCES
 * --------------------
 * An anonymous caller writes ONLY through a declared SECURITY DEFINER door recorded
 * in `platform.client_callable_door` - `record_guest_execution`, `outreach_unsubscribe`,
 * `log_client_error`, the `hr_kiosk_*` family. NEVER through a table privilege. There
 * is no allowlist of anon write grants, because the correct number is zero.
 *
 * SIX ARMS, because this surface has six doors and closing five is closing none:
 *   1. relation - anon or PUBLIC holds a write on a relation, in EITHER catalog shape:
 *                 a table grant (`pg_class.relacl`) or a per-column one
 *                 (`pg_attribute.attacl`), which a table-level REVOKE does not remove.
 *   2. sequence - anon holds UPDATE/USAGE on a sequence (nextval/setval is a write).
 *   3. default  - default privileges grant anon a write on everything created next.
 *   4. policy   - a write-capable policy reaching PUBLIC or anon that no register row
 *                 declares (and a register row describing a policy that is gone).
 *   5. door     - a definer function anon can EXECUTE that writes, with no door row.
 *   6. birth    - default privileges grant anon/PUBLIC SELECT on everything created
 *                 next, so a new table is published to the internet before anybody
 *                 decides anything (DD-196; the read half of arm 3).
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS - with no database credentials it exits 1
 * and says which five variables it wanted and where it looked.
 *
 *   pnpm check:anon-write-surface              # the census
 *   pnpm check:anon-write-surface --self-test  # RED then GREEN against the real database
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { exitAfterDrain } from "./lib/exit-after-drain";
import {
  ANON_WRITE_RELATION_QUERY,
  ANON_WRITE_SEQUENCE_QUERY,
  ANON_WRITE_DEFAULT_QUERY,
  ANON_SELECT_DEFAULT_QUERY,
  ANON_WRITE_POLICY_QUERY,
  ANON_WRITE_DOOR_QUERY,
  POSTGREST_EXPOSED_SCHEMAS,
  PUBLIC_WRITE_POLICIES_OF_RECORD,
  VENDOR_MANAGED_SCHEMAS,
  classifyAnonWrites,
  type AnonWriteFinding,
  type LiveAnonWrite,
} from "../lib/security/public-exposure";

const require_ = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pg: any = require_("pg");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");
const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

const DB_VARS = [
  "SUPABASE_MATRIX_USER",
  "SUPABASE_MATRIX_PASSWORD",
  "SUPABASE_MATRIX_HOST",
  "SUPABASE_MATRIX_PORT",
  "SUPABASE_MATRIX_DATABASE_NAME",
] as const;

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

function resolveDbEnv(): Record<string, string> {
  const looked: string[] = [];
  const take = (bag: Record<string, string | undefined>) =>
    DB_VARS.every((k) => bag[k]) ? (Object.fromEntries(DB_VARS.map((k) => [k, bag[k]!])) as Record<string, string>) : null;

  const fromProcess = take(process.env);
  if (fromProcess) return fromProcess;

  for (const path of [
    resolve(ROOT, ".env.local"),
    resolve(ROOT, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"),
  ]) {
    if (!existsSync(path)) continue;
    looked.push(relative(ROOT, path));
    const hit = take(parseEnvFile(path));
    if (hit) return hit;
  }
  console.error(
    `${C.r}FAIL${C.x} the anon write surface could not be MEASURED - unmeasured is a failure, never a pass.\n` +
      `     Wanted ${DB_VARS.join(", ")} in the environment or in: ${looked.join(", ") || "(no env file found)"}, ../aidream/.env`,
  );
  exitAfterDrain(1);
}

async function connect() {
  const env = resolveDbEnv();
  const client = new pg.Client({
    host: env.SUPABASE_MATRIX_HOST,
    port: Number(env.SUPABASE_MATRIX_PORT),
    user: env.SUPABASE_MATRIX_USER,
    password: env.SUPABASE_MATRIX_PASSWORD,
    database: env.SUPABASE_MATRIX_DATABASE_NAME,
    ssl: { rejectUnauthorized: false },
    application_name: "check-anon-write-surface",
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  // Supavisor pools in transaction mode: a server connection can arrive with a
  // non-LOCAL SET ROLE another client left behind. Reading privileges as the wrong
  // role is a wrong answer that looks like a right one.
  await client.query("set role none");
  return client;
}

const EXPOSED = [...POSTGREST_EXPOSED_SCHEMAS];
const VENDOR = [...VENDOR_MANAGED_SCHEMAS];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function measure(client: any): Promise<LiveAnonWrite> {
  // Sequential, not Promise.all: one pg client executes one query at a time, and
  // overlapping them inside a self-test transaction is how a rollback races a read.
  const relations = await client.query(ANON_WRITE_RELATION_QUERY, [EXPOSED]);
  const sequences = await client.query(ANON_WRITE_SEQUENCE_QUERY, [VENDOR]);
  const defaults = await client.query(ANON_WRITE_DEFAULT_QUERY, [VENDOR]);
  const policies = await client.query(ANON_WRITE_POLICY_QUERY, [EXPOSED]);
  const doors = await client.query(ANON_WRITE_DOOR_QUERY, [VENDOR]);
  const selectDefaults = await client.query(ANON_SELECT_DEFAULT_QUERY, [VENDOR]);
  return {
    relations: relations.rows,
    sequences: sequences.rows,
    defaults: defaults.rows,
    policies: policies.rows,
    doors: doors.rows,
    selectDefaults: selectDefaults.rows,
  };
}

const ARM_TITLE: Record<AnonWriteFinding["arm"], string> = {
  relation: "a relation a signed-out caller can write",
  sequence: "a sequence a signed-out caller can advance",
  default: "a default privilege that re-opens this surface on the next create",
  policy: "an undeclared write policy reaching every role",
  door: "an undeclared anonymous write door",
  birth: "a default privilege that publishes the next table created here to the internet",
};

function report(live: LiveAnonWrite): number {
  const findings = classifyAnonWrites(live);

  console.log(
    `${C.b}Anon write surface${C.x} ${C.d}(what a signed-out caller can change, across the ` +
      `${EXPOSED.length} schemas PostgREST exposes)${C.x}\n` +
      `  ${live.relations.length} relation grant(s), ${live.sequences.length} sequence grant(s), ` +
      `${live.defaults.length} write default(s), ${live.policies.length} PUBLIC/anon write polic(ies) ` +
      `(${PUBLIC_WRITE_POLICIES_OF_RECORD.length} declared), ${live.doors.length} declared definer door(s), ` +
      `${live.selectDefaults.length} read default(s).`,
  );

  if (!findings.length) {
    console.log(
      `${C.g}OK${C.x}   a signed-out caller holds no write privilege anywhere, every anonymous write path\n` +
        `     is a declared door in platform.client_callable_door, and a relation created next is\n` +
        `     closed to anon at birth.`,
    );
    return 0;
  }

  for (const f of findings) {
    console.log(
      `${C.r}FAIL${C.x} ${C.b}${f.object}${C.x} ${C.d}(${ARM_TITLE[f.arm]})${C.x}\n` +
        `     ${f.detail}\n` +
        `     ${f.remedy}`,
    );
  }
  return findings.length;
}

/** One forced RED, always inside a transaction that is always rolled back. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/**
 * CONTENTION IS NOT A VERDICT. Several arms take a row or object lock on
 * something the live platform writes constantly — ARM 5 deletes from
 * `platform.client_callable_door`, which `platform_reopen_declared_doors` (an
 * event trigger on every GRANT / CREATE FUNCTION / ALTER FUNCTION) writes on
 * any concurrent migration, release or fixer run. On 2026-09-21 ARM 5 died on a
 * lock timeout and the whole self-test reported a hard FAIL, which reads as "the
 * arm cannot see its own defect" — a claim nobody measured.
 *
 * So each arm sets its OWN short `lock_timeout` (contention surfaces fast as
 * 55P03 instead of parking the run behind someone else's transaction), retries
 * with backoff, and if it still cannot get the lock it is recorded as
 * NOT MEASURED — never as a pass and never as a broken arm. Unmeasured is still
 * a failure of the RUN (the exit code is 1), because a guard that quietly skipped
 * an arm is a guard you cannot cite; it is simply a DIFFERENT failure, with a
 * different remedy: re-run when the database is quiet.
 */
const LOCK_TIMEOUT = "1500ms";
const RED_ATTEMPTS = 3;
const isContention = (e: unknown): boolean => {
  const code = (e as { code?: string } | null)?.code;
  // 55P03 lock_not_available (lock_timeout), 40P01 deadlock_detected,
  // 40001 serialization_failure — all three mean "someone else had it", never
  // "the arm is wrong".
  return code === "55P03" || code === "40P01" || code === "40001";
};

type SelfTestState = { reds: number; unmeasured: string[] };

/** Run one arm inside an always-rolled-back transaction, retrying on contention. */
async function arm(
  client: any,
  label: string,
  body: () => Promise<void>,
  state: SelfTestState,
) {
  for (let attempt = 1; attempt <= RED_ATTEMPTS; attempt++) {
    await client.query("begin");
    try {
      await client.query(`set local lock_timeout = '${LOCK_TIMEOUT}'`);
      await body();
      state.reds++;
      return;
    } catch (e) {
      if (!isContention(e)) throw e;
      if (attempt < RED_ATTEMPTS) {
        console.log(
          `${C.d}   contention (${(e as { code?: string }).code}) on "${label}" — attempt ${attempt}/${RED_ATTEMPTS}, retrying${C.x}`,
        );
      } else {
        state.unmeasured.push(label);
        console.log(
          `${C.y}[NOT MEASURED — contention]${C.x} ${label} ${C.d}(${(e as { code?: string }).code} after ${RED_ATTEMPTS} attempts; ` +
            `another session holds the lock. This arm was NOT proven and NOT cleared — re-run when the database is quiet.)${C.x}\n`,
        );
        return;
      }
    } finally {
      await client.query("rollback");
    }
    // Backoff OUTSIDE the transaction, so nothing is held while we wait.
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }
}

async function red(client: any, label: string, setup: string[], state: SelfTestState) {
  await arm(
    client,
    label,
    async () => {
      for (const sql of setup) await client.query(sql);
      const n = report(await measure(client));
      if (n === 0) {
        console.error(`\n${C.r}FAIL${C.x} ${label} did NOT fail the guard. That arm cannot see its own defect.`);
        exitAfterDrain(1);
      }
      console.log(`${C.g}RED proven${C.x} ${C.d}(${label} -> ${n} finding(s))${C.x}\n`);
    },
    state,
  );
}

/**
 * B-110 measured this class here first (2026-09-14): piped, this guard printed
 * THREE FAIL lines and only ONE arrived, because `process.exit()` ends the
 * process with whatever is still in the stdout pipe buffer. The local copy of
 * the remedy that lived here is gone — every `scripts/check-*.ts` now exits
 * through the ONE helper, `scripts/lib/exit-after-drain.ts` (DD-232), which
 * carries the measurements and both belts. Do not re-grow a local one.
 */

async function main() {
  const client = await connect();
  try {
    if (!SELF_TEST) {
      exitAfterDrain(report(await measure(client)) ? 1 : 0);
    }

    // -- THE SELF-TEST: a guard nobody has seen fail is not a guard. ----------
    // All six arms are forced against the REAL database inside transactions that
    // are ALWAYS rolled back, so no live grant, policy or door row is left changed.
    console.log(`${C.b}--self-test${C.x} ${C.d}forcing all six arms against the live database${C.x}\n`);

    const baseline = report(await measure(client));
    if (baseline !== 0) {
      console.error(
        `\n${C.r}FAIL${C.x} the self-test needs a GREEN starting point and the live surface already drifts (above).\n` +
          `     Fix the drift first; a RED proof on top of a RED baseline proves nothing.`,
      );
      exitAfterDrain(1);
    }
    console.log(`${C.g}GREEN${C.x} baseline: no signed-out caller can write anything.\n`);

    const state: SelfTestState = { reds: 0, unmeasured: [] };

    // ARM 1a - a table grant comes back, on the roster of platform admins.
    await red(client, "anon granted INSERT on admin.admins", ["grant insert on admin.admins to anon"], state);

    // ARM 1b - THE SHAPE THIS GUARD WAS BLIND TO. A per-column grant is a real
    // privilege (`has_column_privilege` says so) that no `relacl` query can see, and
    // it is how `docproc.processed_documents` stayed writable-by-privilege through
    // DD-193's first sweep, its self-assertion and this guard's first version. The
    // column grant on the existing protected table is always rolled back.
    await red(
      client,
      "anon granted INSERT on NAMED COLUMNS of admin.admins (the attacl shape)",
      [
        "grant insert (user_id) on admin.admins to anon",
      ],
      state,
    );

    // ARM 2 - a sequence anon can advance.
    await red(
      client,
      "anon granted USAGE on public.app_config_history_id_seq",
      ["grant usage on sequence public.app_config_history_id_seq to anon"],
      state,
    );

    // ARM 3 - the default privilege that re-opens the surface on the next create.
    await red(
      client,
      "default privileges grant anon INSERT on every new public table",
      ["alter default privileges for role postgres in schema public grant insert on tables to anon"],
      state,
    );

    // A restrictive policy is a veto, never a write authorization. Verify the
    // actual catalog query, then prove a permissive sibling still goes RED.
    // `create policy` takes ACCESS EXCLUSIVE on admin.admins, so this arm
    // contends exactly like the others and carries the same retry.
    await arm(
      client,
      "permissive authorization remains visible beside a restrictive policy",
      async () => {
        await client.query("create policy b87_self_test_restrictive_write on admin.admins as restrictive for insert to public with check (true)");
        if (report(await measure(client)) !== 0) {
          throw new Error("Restrictive policy incorrectly classified as a write authorization");
        }
        await client.query("create policy b87_self_test_permissive_write on admin.admins for insert to public with check (true)");
        const findings = classifyAnonWrites(await measure(client));
        if (!findings.some((finding) => finding.arm === "policy" && finding.object === "admin.admins :: b87_self_test_permissive_write")) {
          throw new Error("Permissive policy hidden by a restrictive sibling");
        }
        console.log(`${C.g}RED proven${C.x} permissive authorization remains visible beside a restrictive policy`);
      },
      state,
    );

    // ARM 4 - a write policy reaching every role that nobody declared.
    await red(
      client,
      "an undeclared TO PUBLIC insert policy on admin.admins",
      ["create policy b87_self_test_public_write on admin.admins for insert to public with check (true)"],
      state,
    );

    // ARM 5 - a declared door loses its row in platform.client_callable_door.
    await red(
      client,
      "public.record_guest_execution loses its client_callable_door row",
      ["delete from platform.client_callable_door where schema_name = 'public' and function_name = 'record_guest_execution'"],
      state,
    );

    // ARM 6 - the default privilege that publishes the next table to the internet (DD-196).
    //
    // 🚨 THIS ARM'S PLANT CAN NO LONGER BE BUILT, AND THAT IS THE POINT. Since 0896 the
    // event trigger `iam.anon_key_needs_a_class_lane` (tags GRANT, ALTER DEFAULT
    // PRIVILEGES) refuses ANY default privilege giving `anon` SELECT on tables, in every
    // schema except the three vendor ones it grandfathers — and all three of those are in
    // VENDOR_MANAGED_SCHEMAS, which ANON_SELECT_DEFAULT_QUERY excludes. So there is no
    // schema left where this shape can be created AND seen, and the old plant
    // (`… in schema communication grant select on tables to anon`) now dies with 22023
    // before the census ever runs. Weakening either guard to restore the plant would be
    // deleting a live defence to make a test green.
    //
    // So ARM 6 is proven in the two halves that are actually true today:
    //   1. THE RULE — the classifier still turns a read default into a `birth` finding.
    //      Fed a row shaped exactly like ANON_SELECT_DEFAULT_QUERY's output.
    //   2. THE WORLD — the shape cannot be BORN. We attempt the real DDL and require it
    //      to be refused by that event trigger. If the trigger is ever dropped, this half
    //      goes red and says so, which is the signal to restore the live plant above.
    await arm(
      client,
      "a read default is a `birth` finding, and the shape can no longer be created",
      async () => {
        const synthetic = {
          ...(await measure(client)),
          selectDefaults: [{ object: "communication (tables, granted by postgres)", grantee: "anon" }],
        };
        const findings = classifyAnonWrites(synthetic);
        if (!findings.some((f) => f.arm === "birth" && f.object === "communication (tables, granted by postgres)")) {
          console.error(`\n${C.r}FAIL${C.x} the classifier no longer turns an anon SELECT default into a birth finding.`);
          exitAfterDrain(1);
        }
        let refused: string | null = null;
        try {
          await client.query("alter default privileges for role postgres in schema communication grant select on tables to anon");
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (isContention(e)) throw e;
          refused = code ?? "unknown";
        }
        if (refused !== "22023") {
          console.error(
            `\n${C.r}FAIL${C.x} a default privilege giving anon SELECT on every new communication table was ` +
              `${refused === null ? "ACCEPTED" : `refused with ${refused}, not 22023`}.\n` +
              `     iam.anon_key_needs_a_class_lane is meant to refuse it. If that event trigger was removed on ` +
              `purpose, restore this arm's\n     live plant (alter default privileges … grant select on tables to ` +
              `anon) and delete this branch — the shape is constructible again.`,
          );
          exitAfterDrain(1);
        }
        console.log(
          `${C.g}RED proven${C.x} ${C.d}(the classifier flags an anon SELECT default as a birth finding, and ` +
            `iam.anon_key_needs_a_class_lane refuses to let one be created: 22023)${C.x}\n`,
        );
      },
      state,
    );

    // GREEN again - the rollbacks really put the live state back.
    const after = report(await measure(client));
    if (after !== 0) {
      console.error(
        `\n${C.r}FAIL${C.x} the self-test did not restore the live state. THIS IS A LIVE DEFECT - fix it by hand now.`,
      );
      exitAfterDrain(1);
    }
    console.log(`${C.g}GREEN${C.x} teardown verified: ${state.reds} RED proof(s), live grants, policies and doors unchanged.`);
    if (state.unmeasured.length > 0) {
      console.error(
        `\n${C.y}[NOT MEASURED — contention]${C.x} ${state.unmeasured.length} arm(s) never got their lock: ` +
          `${state.unmeasured.join(", ")}.\n` +
          `     This is NOT a pass. The live surface is green (above) and every arm that ran was proven, but ` +
          `these arms\n     proved nothing either way. Re-run when no migration, release or fixer agent is ` +
          `writing to the database.`,
      );
      exitAfterDrain(1);
    }
    exitAfterDrain(0);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  exitAfterDrain(1);
});

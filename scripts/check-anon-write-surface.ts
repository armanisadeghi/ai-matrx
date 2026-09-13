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
 * FIVE ARMS, because this surface has five doors and closing four is closing none:
 *   1. relation - anon or PUBLIC holds INSERT/UPDATE/DELETE/MAINTAIN on a relation.
 *   2. sequence - anon holds UPDATE/USAGE on a sequence (nextval/setval is a write).
 *   3. default  - default privileges grant anon a write on everything created next.
 *   4. policy   - a write-capable policy reaching PUBLIC or anon that no register row
 *                 declares (and a register row describing a policy that is gone).
 *   5. door     - a definer function anon can EXECUTE that writes, with no door row.
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
import {
  ANON_WRITE_RELATION_QUERY,
  ANON_WRITE_SEQUENCE_QUERY,
  ANON_WRITE_DEFAULT_QUERY,
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
  process.exit(1);
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
  return {
    relations: relations.rows,
    sequences: sequences.rows,
    defaults: defaults.rows,
    policies: policies.rows,
    doors: doors.rows,
  };
}

const ARM_TITLE: Record<AnonWriteFinding["arm"], string> = {
  relation: "a relation a signed-out caller can write",
  sequence: "a sequence a signed-out caller can advance",
  default: "a default privilege that re-opens this surface on the next create",
  policy: "an undeclared write policy reaching every role",
  door: "an undeclared anonymous write door",
};

function report(live: LiveAnonWrite): number {
  const findings = classifyAnonWrites(live);

  console.log(
    `${C.b}Anon write surface${C.x} ${C.d}(what a signed-out caller can change, across the ` +
      `${EXPOSED.length} schemas PostgREST exposes)${C.x}\n` +
      `  ${live.relations.length} relation grant(s), ${live.sequences.length} sequence grant(s), ` +
      `${live.defaults.length} write default(s), ${live.policies.length} PUBLIC/anon write polic(ies) ` +
      `(${PUBLIC_WRITE_POLICIES_OF_RECORD.length} declared), ${live.doors.length} declared definer door(s).`,
  );

  if (!findings.length) {
    console.log(
      `${C.g}OK${C.x}   a signed-out caller holds no write privilege anywhere, and every anonymous write\n` +
        `     path is a declared door in platform.client_callable_door.`,
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
async function red(client: any, label: string, setup: string[], state: { reds: number }) {
  await client.query("begin");
  try {
    for (const sql of setup) await client.query(sql);
    const n = report(await measure(client));
    if (n === 0) {
      console.error(`\n${C.r}FAIL${C.x} ${label} did NOT fail the guard. That arm cannot see its own defect.`);
      process.exit(1);
    }
    state.reds++;
    console.log(`${C.g}RED proven${C.x} ${C.d}(${label} -> ${n} finding(s))${C.x}\n`);
  } finally {
    await client.query("rollback");
  }
}

async function main() {
  const client = await connect();
  try {
    if (!SELF_TEST) {
      process.exit(report(await measure(client)) ? 1 : 0);
    }

    // -- THE SELF-TEST: a guard nobody has seen fail is not a guard. ----------
    // All five arms are forced against the REAL database inside transactions that
    // are ALWAYS rolled back, so no live grant, policy or door row is left changed.
    console.log(`${C.b}--self-test${C.x} ${C.d}forcing all five arms against the live database${C.x}\n`);

    const baseline = report(await measure(client));
    if (baseline !== 0) {
      console.error(
        `\n${C.r}FAIL${C.x} the self-test needs a GREEN starting point and the live surface already drifts (above).\n` +
          `     Fix the drift first; a RED proof on top of a RED baseline proves nothing.`,
      );
      process.exit(1);
    }
    console.log(`${C.g}GREEN${C.x} baseline: no signed-out caller can write anything.\n`);

    const state = { reds: 0 };

    // ARM 1 - a table grant comes back, on the roster of platform admins.
    await red(client, "anon granted INSERT on admin.admins", ["grant insert on admin.admins to anon"], state);

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

    // GREEN again - the rollbacks really put the live state back.
    const after = report(await measure(client));
    if (after !== 0) {
      console.error(
        `\n${C.r}FAIL${C.x} the self-test did not restore the live state. THIS IS A LIVE DEFECT - fix it by hand now.`,
      );
      process.exit(1);
    }
    console.log(`${C.g}GREEN${C.x} teardown verified: ${state.reds} RED proof(s), live grants, policies and doors unchanged.`);
    process.exit(0);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

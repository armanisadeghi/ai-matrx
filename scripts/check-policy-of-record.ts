#!/usr/bin/env npx tsx
/**
 * THE POLICY-OF-RECORD GUARD — every live RLS policy this generator did not author
 * is written down in a migration (DD-172).
 *
 * WHY THIS EXISTS
 * ---------------
 * DD-147 taught `iam.apply_rls` to keep what it did not author, and gave the one
 * deliberate way a bespoke policy goes (`iam.supersede_bespoke_policies`, a reason
 * of at least 60 characters, recorded in `iam.superseded_policy`). Its census then
 * found the other half of the same defect: policies that are LIVE on this database
 * and appear in NO migration file in either repository. They were created off the
 * migration path — hand-applied through a tool, the DD-113 class — so nothing
 * anywhere says what they are for, and the next lane that meets one can only guess
 * whether removing it is a cleanup or an outage. Measured 2026-09-12 by B-54: 101
 * such names. Re-measured 2026-09-13 by B-66 after later lanes: 81, on 39
 * relations. DD-172 closed all 81 — seven superseded with reasons, seventy-four
 * recorded byte-for-byte in `migrations/iam_bespoke_policies_of_record_dd172.sql`.
 *
 * Zero is a measurement, not a property. The next policy created through a console,
 * an MCP call, or a psql session is the same defect again, and nothing else in the
 * tree would notice. This guard is what notices.
 *
 * WHAT IT FAILS ON
 * ----------------
 * A live policy whose name appears in NO `migrations/*.sql` in matrx-frontend and
 * no `db/migrations/*.sql` in aidream, and which `iam.generated_policy_names()`
 * does not author. Generated names are excluded because their record IS the
 * generator: `iam.apply_rls` emits them from code that is itself in a migration.
 *
 * WHY THE TEST IS "THE NAME APPEARS SOMEWHERE"
 * --------------------------------------------
 * It is the same test B-54 and B-66 censused with, so the number this guard prints
 * is comparable to theirs, and it is deliberately the WEAKER of the two candidates.
 * The stronger one — a file containing both the policy name and its table name —
 * reports 325 today, almost all of them generic names (`owner_all`, `admin_read`)
 * that a shared migration created for many tables at once. Failing a release gate
 * on a number nobody has triaged is how a guard gets switched off. The weak test
 * catches exactly the shape DD-172 is about: a name nobody ever wrote down.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS — with no database credentials it exits 1
 * and says which five variables it wanted and where it looked.
 *
 *   pnpm check:policy-of-record              # the census
 *   pnpm check:policy-of-record --self-test  # RED then GREEN against the real database
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

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
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

interface DbEnv { user: string; password: string; host: string; port: number; database: string; from: string }

function loadDbEnv(): DbEnv | { missing: readonly string[]; looked: string[] } {
  const looked: string[] = [];
  const tryBag = (bag: Record<string, string | undefined>, from: string): DbEnv | null => {
    if (DB_VARS.some((k) => !bag[k])) return null;
    return {
      user: bag.SUPABASE_MATRIX_USER!, password: bag.SUPABASE_MATRIX_PASSWORD!,
      host: bag.SUPABASE_MATRIX_HOST!, port: Number(bag.SUPABASE_MATRIX_PORT!),
      database: bag.SUPABASE_MATRIX_DATABASE_NAME!, from,
    };
  };
  const fromProcess = tryBag(process.env, "the environment");
  if (fromProcess) return fromProcess;
  for (const path of [
    resolve(ROOT, ".env.local"), resolve(ROOT, ".env.production.local"),
    resolve(ROOT, ".env.production"), resolve(ROOT, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"),
  ]) {
    if (!existsSync(path)) continue;
    looked.push(relative(ROOT, path));
    const hit = tryBag(parseEnvFile(path), relative(ROOT, path));
    if (hit) return hit;
  }
  return { missing: DB_VARS, looked };
}

/** Every byte of every migration file in both repositories, concatenated once. */
function migrationCorpus(): { text: string; files: number; dirs: string[] } {
  const dirs = [
    resolve(ROOT, "migrations"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), "db", "migrations"),
  ].filter((d) => existsSync(d));
  const parts: string[] = [];
  let files = 0;
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".sql")) continue;
      parts.push(readFileSync(resolve(dir, name), "utf8"));
      files += 1;
    }
  }
  return { text: parts.join("\n"), files, dirs };
}

interface LivePolicy { sch: string; tbl: string; pol: string }

const CENSUS_SQL = `
  select n.nspname as sch, c.relname as tbl, p.polname as pol
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where p.polname <> all (iam.generated_policy_names())
   order by 1, 2, 3`;

/**
 * THE PURE RULE, exported so the self-test can hand it rows it made up rather than
 * rows it read — a guard whose rule only ever sees real data has never been shown
 * to say no.
 */
export function withoutRecord(live: readonly LivePolicy[], corpus: string): LivePolicy[] {
  return live.filter((p) => !corpus.includes(p.pol));
}

async function census(env: DbEnv): Promise<LivePolicy[]> {
  const client = new pg.Client({
    host: env.host, port: env.port, user: env.user, password: env.password, database: env.database,
    ssl: { rejectUnauthorized: false }, application_name: "check:policy-of-record", connectionTimeoutMillis: 20_000,
  });
  await client.connect();
  try {
    const r = await client.query(CENSUS_SQL);
    return r.rows as LivePolicy[];
  } finally {
    await client.end();
  }
}

function selfTest(): number {
  const corpus = "create policy recorded_one on x.y for select using (true);";
  const red = withoutRecord(
    [{ sch: "x", tbl: "y", pol: "recorded_one" }, { sch: "x", tbl: "y", pol: "never_written_down" }],
    corpus,
  );
  if (red.length !== 1 || red[0].pol !== "never_written_down") {
    console.error(`${C.r}[FAIL]${C.x} self-test RED: the rule did not name the unrecorded policy. It found ${JSON.stringify(red)}.`);
    return 1;
  }
  console.log(`${C.y}[RED ]${C.x} a policy named in no migration text is reported: ${red[0].pol}`);
  const green = withoutRecord([{ sch: "x", tbl: "y", pol: "recorded_one" }], corpus);
  if (green.length !== 0) {
    console.error(`${C.r}[FAIL]${C.x} self-test GREEN: a policy whose name IS in the corpus was still reported.`);
    return 1;
  }
  console.log(`${C.g}[GREEN]${C.x} a policy whose name appears in a migration is not reported.`);
  return 0;
}

async function main(): Promise<number> {
  if (SELF_TEST) return selfTest();

  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${C.r}[FAIL]${C.x} check:policy-of-record could not reach the database, so it measured NOTHING and will not print a green line it did not earn.\n` +
      `       Wanted ${env.missing.join(", ")} in the environment or in one of: ${env.looked.join(", ") || "(no env file found)"}.`,
    );
    return 1;
  }

  const { text, files, dirs } = migrationCorpus();
  if (files === 0) {
    console.error(`${C.r}[FAIL]${C.x} no migration files found under ${dirs.join(", ") || "(no directory)"} — the corpus is empty, so every policy would look unrecorded. Refusing to report.`);
    return 1;
  }

  const live = await census(env);
  const orphans = withoutRecord(live, text);

  console.log(
    `${C.d}${live.length} live policies iam.apply_rls does not author, checked against ${files} migration files in ${dirs.length} repositor${dirs.length === 1 ? "y" : "ies"} (credentials from ${env.from}).${C.x}`,
  );
  if (orphans.length === 0) {
    console.log(`${C.g}[ OK ]${C.x} Every live RLS policy has a migration of record. ${C.d}(DD-172)${C.x}`);
    return 0;
  }
  console.error(`${C.r}[FAIL]${C.x} ${orphans.length} live polic${orphans.length === 1 ? "y appears" : "ies appear"} in no migration file in either repository — created off the migration path, with nothing saying what they are for (the DD-113 class, censused as DD-172):`);
  for (const o of orphans) console.error(`  ${C.b}${o.sch}.${o.tbl}${C.x}  ${o.pol}`);
  console.error(
    `${C.d}Fix: read each one's USING/WITH CHECK against the table's class, then either record it with a reason in a migration (the shape of migrations/iam_bespoke_policies_of_record_dd172.sql) or remove it on purpose through iam.supersede_bespoke_policies(schema, table, names, reason).${C.x}`,
  );
  return 1;
}

main().then((code) => { process.exitCode = code; }).catch((e) => {
  console.error(`${C.r}[FAIL]${C.x} check:policy-of-record could not run: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});

#!/usr/bin/env npx tsx
/**
 * THE STALE-ROWTYPE GUARD — no trigger function rebuilds its row from a column
 * list older than the table (DD-184).
 *
 * WHY THIS EXISTS
 * ---------------
 * `jsonb_populate_record(NEW, patch)` resolves the composite shape of its base
 * argument ONCE and caches that TupleDesc in the call site's `fn_extra`. The cache
 * is keyed by the row type's OID and typmod, and `ALTER TABLE ... ADD COLUMN`
 * changes NEITHER. So once a trigger using that construct has fired on a table in
 * a transaction, every later firing in that SAME transaction rebuilds the row from
 * the shape the table had at the first firing: a column added in between is
 * dropped and lands as NULL. No error, no warning, no log line.
 *
 * `platform._touch_row` (679 triggers) and `platform._stamp_actor_tier` (576) both
 * carried it from 2026-07-15 until 2026-09-13. Measured live: a real table lost the
 * value on 4 of 4 rows on the SECOND add-column-then-update pair in one transaction
 * — which is exactly what a migration is, because `pnpm db:apply` runs the whole
 * file in one transaction. B-65 lost 35 rows of `crm.jurisdiction_policy.visibility`
 * to it and only noticed because a NOT NULL assertion in its own migration screamed.
 *
 * Both were fixed by `migrations/platform_touch_row_never_drops_a_new_column_dd184.sql`
 * — direct field assignment, which is resolved against the tuple itself every time.
 * Zero is a measurement, not a property: the next trigger function someone writes
 * with the same construct is the same silent data loss, on whatever table it is
 * attached to. This guard is what notices.
 *
 * WHAT IT FAILS ON
 * ----------------
 * Any trigger function in the live database whose body ASSIGNS TO or RETURNS a
 * `*_populate_record(...)` built from NEW/OLD. Populating a LOCAL variable in order
 * to READ from it is NOT a member of the class and is not reported: it cannot write
 * a stale column list (that is `web.validate_cross_pointers`, deliberately left
 * alone). Comments are stripped before matching, so a function may name the banned
 * construct in order to warn the next author off it.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS — with no database credentials it exits 1
 * and says which five variables it wanted and where it looked.
 *
 *   pnpm check:stale-rowtype-triggers              # the census
 *   pnpm check:stale-rowtype-triggers --self-test  # RED then GREEN against the real database
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pg: any = require_("pg");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");
const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", x: "\x1b[0m" };

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

interface Offender { trigger_function: string; trigger_count: string; verdict: string }

/**
 * The rule itself lives in the DATABASE (`platform.assert_no_stale_rowtype_triggers()`),
 * installed by the DD-184 migration, so the migration proves the same rule this script
 * runs — there is no second copy to drift.
 */
const CENSUS_SQL = `select trigger_function, trigger_count::text, verdict
                      from platform.assert_no_stale_rowtype_triggers()`;

/** A trigger function the self-test plants, to prove the rule can say no. */
const PLANT_SQL = `
  create schema dd184_selftest;
  create function dd184_selftest.planted_offender() returns trigger language plpgsql as $body$
  BEGIN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', now()));
    RETURN NEW;
  END
  $body$;`;

async function main(): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${C.r}[FAIL]${C.x} check:stale-rowtype-triggers could not reach the database, so it measured NOTHING.\n` +
        `  It needs ${DB_VARS.join(", ")}.\n` +
        `  Looked in: ${env.looked.length ? env.looked.join(", ") : "the environment only"}, then ../aidream/.env.\n` +
        `  Unmeasured is a failure, never a pass.`,
    );
    return 1;
  }

  const client = new pg.Client({
    host: env.host, port: env.port, user: env.user, password: env.password, database: env.database,
    ssl: { rejectUnauthorized: false }, application_name: "check:stale-rowtype-triggers",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();
  console.log(`${C.d}${env.user}@${env.host}:${env.port}/${env.database} (credentials from ${env.from})${C.x}`);

  try {
    if (SELF_TEST) {
      // RED: plant an offender inside a transaction that is rolled back, and require the
      // rule to name it. A guard nobody has seen fail is not a guard.
      await client.query("begin");
      let planted: Offender[] = [];
      try {
        await client.query(PLANT_SQL);
        planted = (await client.query(CENSUS_SQL)).rows as Offender[];
      } finally {
        await client.query("rollback");
      }
      const caught = planted.some((o) => o.trigger_function === "dd184_selftest.planted_offender");
      if (!caught) {
        console.error(
          `${C.r}[FAIL]${C.x} SELF-TEST RED failed: a planted trigger function that rebuilds NEW through\n` +
            `  jsonb_populate_record was NOT reported. This guard would never have caught DD-184.`,
        );
        return 1;
      }
      console.log(`${C.g}[ RED]${C.x} planted offender reported by name (dd184_selftest.planted_offender); transaction rolled back.`);
    }

    const rows = (await client.query(CENSUS_SQL)).rows as Offender[];
    if (rows.length) {
      console.error(
        `${C.r}[FAIL]${C.x} ${rows.length} trigger function(s) rebuild NEW/OLD from a cached rowtype (DD-184).\n` +
          `  Each one silently writes NULL into any column added earlier in the same transaction —\n` +
          `  which is every migration that adds a column and then writes rows of that table.\n` +
          `  Fix: assign the fields directly (NEW.col := value) inside a shape guard, the way\n` +
          `  platform._touch_row does since migrations/platform_touch_row_never_drops_a_new_column_dd184.sql.`,
      );
      for (const o of rows) console.error(`    ${C.b}${o.trigger_function}${C.x} — ${o.trigger_count} trigger(s) — ${o.verdict}`);
      return 1;
    }
    console.log(`${C.g}[ OK ]${C.x} no trigger function in this database rebuilds NEW/OLD through jsonb_populate_record.`);
    return 0;
  } finally {
    await client.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${C.r}[FAIL]${C.x} check:stale-rowtype-triggers errored, so it measured NOTHING:\n  ${String(err?.message ?? err)}`);
    process.exit(1);
  });

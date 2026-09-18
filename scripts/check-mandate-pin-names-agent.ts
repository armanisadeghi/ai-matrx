#!/usr/bin/env npx tsx
/**
 * A PIN NAMES ITS AGENT — no live mandate rung may pin a version while naming no holder.
 *
 * WHAT IT PROTECTS
 * ----------------
 * `mandate.definition (default_holder_id, default_holder_version_id)` and
 * `mandate.binding (holder_id, holder_version_id)`: an `agent` rung that carries a pinned
 * version MUST also carry the agent's id. Every reader keys on the id — `mandate._rungs`
 * reads `chose_holder = (holder_id IS NOT NULL)`, the I2 reverse lookup finds a rung's agent
 * through it, the impact read grades what I2 returns. A version-only pin is therefore a rung
 * resolution treats as settings-only and the impact read never grades: on 2026-09-14, 36 live
 * definitions (all code-declared, written by the boot sync from `seed_version_id`-only
 * declarations) produced NO verdict, and 30 of 71 behind-latest rows on the standing table
 * read "Not graded". The binding twin was fixed in its writer the same day (aidream 03cc2d114).
 *
 * WHY A LIVE CENSUS AND NOT A SOURCE SCAN: the writers are fixed in aidream (set_default_holder,
 * set_binding, sync_declared_mandates all derive the id from the version now), but any
 * hand-provisioned row, any older path, any future writer lands in the same two tables. The
 * answer is in the rows (db-rules FEATURE.md §1). Read-only: this script writes nothing.
 *
 *   pnpm check:mandate-pin-names-agent           # loud, exit 0
 *   pnpm check:mandate-pin-names-agent:strict    # exit 1 on ANY finding (CI)
 *
 * PROVEN FAILING THEN PASSING, on the live database (2026-09-14):
 *   before migrations/agent_change_impact_05_version_only_pins_name_their_agent.sql:
 *     definition_pins_name_their_agent FAIL — 36 rows; binding_pins_name_their_agent ok — 0.
 *   after the backfill in that migration: both green, 0 and 0.
 *
 * 🚨 UNMEASURED IS NOT PASSED. No credentials or no connection prints `LIVE PULL FAILED` and
 * is a FAILURE under --strict; a guard that cannot see the rows never reports green.
 *
 * Exit codes: 0 ok (or advisory) · 1 findings/unmeasured under --strict · 2 crash.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");

const C = { reset: "\x1b[0m", bold: "\x1b[1m", red: "\x1b[31m", green: "\x1b[32m", cyan: "\x1b[36m" };
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  ok: `${C.green}[ OK ]${C.reset} `,
};

const DB_VARS = [
  "SUPABASE_MATRIX_USER",
  "SUPABASE_MATRIX_PASSWORD",
  "SUPABASE_MATRIX_HOST",
  "SUPABASE_MATRIX_PORT",
  "SUPABASE_MATRIX_DATABASE_NAME",
] as const;

interface DbEnv {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
  from: string;
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]!] = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function loadDbEnv(): DbEnv | null {
  const tryBag = (bag: Record<string, string | undefined>, from: string): DbEnv | null => {
    if (DB_VARS.some((k) => !bag[k])) return null;
    return {
      user: bag.SUPABASE_MATRIX_USER!,
      password: bag.SUPABASE_MATRIX_PASSWORD!,
      host: bag.SUPABASE_MATRIX_HOST!,
      port: Number(bag.SUPABASE_MATRIX_PORT!),
      database: bag.SUPABASE_MATRIX_DATABASE_NAME!,
      from,
    };
  };
  const fromProcess = tryBag(process.env, "the environment");
  if (fromProcess) return fromProcess;
  for (const path of [
    resolve(ROOT, ".env.local"),
    resolve(ROOT, ".env.production.local"),
    resolve(ROOT, ".env.production"),
    resolve(ROOT, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"),
  ]) {
    if (!existsSync(path)) continue;
    const hit = tryBag(parseEnvFile(path), relative(ROOT, path));
    if (hit) return hit;
  }
  return null;
}

function unmeasured(why: string, remedy: string): never {
  console.log("");
  console.log(`${C.red}${C.bold}LIVE PULL FAILED — THE PIN-NAMES-AGENT GUARD IS UNMEASURED${C.reset}`);
  console.log(`${TAG.fail}${why}`);
  console.log(`${TAG.info}Remedy: ${remedy}`);
  console.log(`${TAG.info}Unmeasured is not passed: this run proved nothing about the live rows.`);
  exitAfterDrain(STRICT ? 1 : 0);
}

interface Census {
  readonly key: string;
  readonly sql: string;
}

/** Each census names the rows that break the law; a healthy system returns zero. */
const CENSUSES: readonly Census[] = [
  {
    key: "definition_pins_name_their_agent",
    sql: `select m.mandate_key as label
            from mandate.definition m
           where m.deleted_at is null
             and m.default_holder_type = 'agent'
             and m.default_holder_version_id is not null
             and m.default_holder_id is null
           order by 1`,
  },
  {
    key: "binding_pins_name_their_agent",
    sql: `select coalesce(d.mandate_key, b.mandate_id::text) || ' (' || b.principal_type || ' binding ' || b.id || ')' as label
            from mandate.binding b
            left join mandate.definition d on d.id = b.mandate_id
           where b.deleted_at is null
             and b.holder_type = 'agent'
             and b.holder_version_id is not null
             and b.holder_id is null
           order by 1`,
  },
];

async function main(): Promise<void> {
  const env = loadDbEnv();
  if (!env) {
    unmeasured(
      `none of the environment, .env.local, .env, or ../aidream/.env carries all five SUPABASE_MATRIX_* variables.`,
      "provide them and re-run.",
    );
  }
  console.log(`${TAG.info}Connection variables from ${C.bold}${env.from}${C.reset}.`);
  const client = new pg.Client({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database: env.database,
    ssl: { rejectUnauthorized: false },
    application_name: "matrx-frontend check:mandate-pin-names-agent",
    connectionTimeoutMillis: 15_000,
  });
  try {
    await client.connect();
  } catch (e) {
    unmeasured(
      `could not connect to ${env.host}:${env.port}/${env.database} — ${e instanceof Error ? e.message : String(e)}`,
      "check the credentials and network, then re-run.",
    );
  }

  let failed = 0;
  try {
    for (const census of CENSUSES) {
      const rows = await client.query<{ label: string }>(census.sql);
      if (rows.rowCount === 0) {
        console.log(`${TAG.ok}${C.bold}${census.key}${C.reset} — 0 rows pin a version while naming no agent.`);
        continue;
      }
      failed += 1;
      console.log(
        `${TAG.fail}${C.bold}${census.key}${C.reset} — ${rows.rowCount} row(s) pin a version while naming no agent; ` +
          "the impact read grades none of them and resolution treats them as settings-only:",
      );
      for (const r of rows.rows) console.log(`       ${r.label}`);
    }
  } catch (e) {
    unmeasured(
      `the census query failed — ${e instanceof Error ? e.message : String(e)}`,
      "read the error above; it is the verbatim database refusal.",
    );
  } finally {
    await client.end().catch(() => {});
  }

  console.log("");
  if (failed === 0) {
    console.log(`${TAG.ok}${CENSUSES.length}/${CENSUSES.length} censuses green.`);
    exitAfterDrain(0);
  }
  console.log(
    `${TAG.info}Fix: migrations/agent_change_impact_05_version_only_pins_name_their_agent.sql backfills the ` +
      `agent id from the pinned version (pnpm db:apply); the writers derive it in aidream ` +
      `(set_default_holder, set_binding, sync_declared_mandates).`,
  );
  exitAfterDrain(STRICT ? 1 : 0);
}

main().catch((e) => {
  console.error(`${TAG.fail}check:mandate-pin-names-agent crashed: ${e instanceof Error ? e.stack : e}`);
  exitAfterDrain(2);
});

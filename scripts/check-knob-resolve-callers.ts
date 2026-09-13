#!/usr/bin/env npx tsx
/**
 * THE SCOPES-ARGUMENT GUARD — every caller of `platform.knob_resolve` names its rungs
 * with an ARRAY, never an object (DD-198).
 *
 * WHY THIS EXISTS
 * ---------------
 * `platform.knob_resolve(feature, key, org, user, p_scopes)` dereferences `p_scopes` in
 * exactly one place — `jsonb_array_elements(p_scopes)` inside the candidate-override
 * EXISTS — and that line is reached ONLY once an override row already exists at a rung
 * that is neither `organization` nor `user`. So a caller that passes an OBJECT
 * (`jsonb_build_object('table', <id>)`) or `'{}'::jsonb` runs green forever, until the
 * first person creates a row-keyed override — and then every call raises
 * `22023 cannot extract elements from an object`.
 *
 * That is exactly what happened: `platform._stamp_actor_tier`, the provenance carrier on
 * 577 tables, and `content_ir.edit_kind_instance_value`, the edit-confirms door, both
 * carried an object argument from wf_046 (2026-09-12) until DD-183's per-rung override
 * picker shipped and made the trigger reachable in one click. `knob_resolve` now refuses
 * a non-array `p_scopes` up front, so the failure is loud at the first call — but a NEW
 * caller written tomorrow with an object argument would still only be caught the first
 * time that code path runs in production. This guard is what catches it before then.
 *
 * WHAT IT MEASURES — BOTH HALVES, ONE CLASSIFIER
 * ----------------------------------------------
 *   1. THE LIVE CATALOG — every `pg_proc` body in this database that calls knob_resolve.
 *      That is where the class lived, and where a source census can never see.
 *   2. THE REPO SOURCE — matrx-frontend, aidream, matrx-local, matrx-extend: the TypeScript,
 *      Python and JavaScript call sites, which reach knob_resolve over PostgREST and are
 *      therefore invisible to the catalog census.
 *
 * `migrations/` is deliberately NOT scanned. An applied migration file is the record of a
 * change that already landed, not a caller: its bytes are checksummed in
 * `public._schema_migrations`, and editing one would falsify that ledger while changing
 * nothing that runs. The SQL that RUNS is in the catalog, and half 1 reads all of it — so
 * skipping history costs this guard no coverage at all. (wf_046/047/048/051 and
 * platform_touch_row_…_dd184.sql still hold the object argument on disk, correctly: that is
 * what they did on the day they ran. DD-198's own file is the record of the fix.)
 *
 * Both are parsed by the same function (`scopesArgumentOf` + `classify`): the call's
 * arguments are split at top level, the 5th is taken, and the literal it starts with
 * decides the verdict.
 *
 *   OK        — absent, `null`, `undefined`, `jsonb_build_array(`, `array[`, a `[…]` literal,
 *               `to_jsonb(array`, or a TS/Python array literal.
 *   OFFENDER  — `jsonb_build_object(`, a `{…}` JSON literal (`'{}'::jsonb` included), or a
 *               TS/Python object literal. These are the class.
 *   OPAQUE    — a variable or an expression this cannot read. Printed by name so nobody has
 *               to guess what was and was not measured (law 4), never counted as a pass and
 *               never counted as a failure — read them.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS — with no database credentials it exits 1 and says
 * which five variables it wanted and where it looked.
 *
 *   pnpm check:knob-resolve-callers              # the census
 *   pnpm check:knob-resolve-callers --self-test  # RED then GREEN against the real database
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pg: any = require_("pg");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = resolve(ROOT, "..");
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

import { classify, knobResolveCalls, scopesArgumentOf } from "./knob-resolve-callers/core";
import type { Verdict } from "./knob-resolve-callers/core";

interface Finding { where: string; arg: string; verdict: Verdict }

function scan(label: string, body: string): Finding[] {
  return knobResolveCalls(body).map(({ args, at }) => {
    const arg = scopesArgumentOf(args);
    const line = body.slice(0, at).split("\n").length;
    return { where: `${label}:${line}`, arg: arg.replace(/\s+/g, " ").slice(0, 90) || "(omitted)", verdict: classify(arg) };
  });
}

/** Comments stripped, so a file may NAME the banned shape in order to warn the next author off it. */
function strip(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/#[^\n]*/g, "");
}

const SOURCE_ROOTS = ["matrx-frontend", "aidream", "matrx-local", "matrx-extend"];
const SOURCE_EXT = /\.(sql|ts|tsx|py|mjs|js)$/;
const SKIP_DIR = /^(node_modules|\.git|\.next|dist|build|\.venv|venv|__pycache__|\.turbo|coverage|out|migrations|\\.next-preview|\\.vercel|storybook-static|target|\\.cache)$/;
/**
 * The guard's OWN three files name the banned shape on purpose — the RED plant in this file,
 * the classifier's rules in core.ts, and the RED cases in the test. Nothing else is exempt:
 * a file that must mention the shape in prose puts it in a comment, which `strip()` removes.
 */
const SKIP_FILE = /scripts\/(check-knob-resolve-callers\.ts|knob-resolve-callers\/core\.ts|__tests__\/check-knob-resolve-callers\.test\.ts)$/;

function walk(dir: string, out: string[], depth = 0): void {
  if (depth > 12) return;
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIR.test(e)) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out, depth + 1);
    else if (SOURCE_EXT.test(e) && st.size < 4_000_000) out.push(p);
  }
}

function scanRepos(): Finding[] {
  const findings: Finding[] = [];
  for (const repo of SOURCE_ROOTS) {
    const root = resolve(WORKSPACE, repo);
    if (!existsSync(root)) continue;
    const files: string[] = [];
    walk(root, files);
    for (const f of files) {
      let text: string;
      try { text = readFileSync(f, "utf8"); } catch { continue; }
      if (!text.includes("knob_resolve")) continue;
      // Generated database types name the function; they never call it.
      if (/database\.types\.ts$/.test(f)) continue;
      if (SKIP_FILE.test(f)) continue;
      findings.push(...scan(relative(WORKSPACE, f), strip(text)));
    }
  }
  return findings;
}

const CATALOG_SQL = `
  select n.nspname || '.' || p.proname as fn, p.prosrc as body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where strpos(lower(p.prosrc), 'knob_resolve') > 0
     and not (n.nspname = 'platform' and p.proname = 'knob_resolve')
   order by 1`;

/** A function the self-test plants, to prove the rule can say no. */
const PLANT_SQL = `
  create schema dd198_selftest;
  create function dd198_selftest.planted_offender(p_org uuid) returns jsonb language sql stable as $body$
    select platform.knob_resolve('records', 'confirmation.table_allows_born_confirmed',
                                 p_org, null, jsonb_build_object('table', p_org));
  $body$;`;

async function main(): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `${C.r}[FAIL]${C.x} check:knob-resolve-callers could not reach the database, so it measured NOTHING.\n` +
        `  It needs ${DB_VARS.join(", ")}.\n` +
        `  Looked in: ${env.looked.length ? env.looked.join(", ") : "the environment only"}, then ../aidream/.env.\n` +
        `  Unmeasured is a failure, never a pass.`,
    );
    return 1;
  }

  const client = new pg.Client({
    host: env.host, port: env.port, user: env.user, password: env.password, database: env.database,
    ssl: { rejectUnauthorized: false }, application_name: "check:knob-resolve-callers",
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();
  console.log(`${C.d}${env.user}@${env.host}:${env.port}/${env.database} (credentials from ${env.from})${C.x}`);

  const censusCatalog = async (): Promise<Finding[]> => {
    const rows = (await client.query(CATALOG_SQL)).rows as { fn: string; body: string }[];
    return rows.flatMap((r) => scan(`catalog ${r.fn}`, strip(r.body)));
  };

  try {
    if (SELF_TEST) {
      await client.query("begin");
      let planted: Finding[] = [];
      try {
        await client.query(PLANT_SQL);
        planted = await censusCatalog();
      } finally {
        await client.query("rollback");
      }
      const caught = planted.some((f) => f.where.startsWith("catalog dd198_selftest.planted_offender") && f.verdict === "offender");
      if (!caught) {
        console.error(
          `${C.r}[FAIL]${C.x} SELF-TEST RED failed: a planted function calling knob_resolve with\n` +
            `  jsonb_build_object as p_scopes was NOT reported. This guard would never have caught DD-198.`,
        );
        return 1;
      }
      console.log(`${C.g}[ RED]${C.x} planted offender reported by name (dd198_selftest.planted_offender); transaction rolled back.`);
    }

    const findings = [...(await censusCatalog()), ...scanRepos()];
    const offenders = findings.filter((f) => f.verdict === "offender");
    const opaque = findings.filter((f) => f.verdict === "opaque");
    const ok = findings.filter((f) => f.verdict === "ok");

    if (opaque.length) {
      console.log(`${C.y}[NOTE]${C.x} ${opaque.length} call site(s) pass an expression this guard cannot read. Not a pass and not a failure — read them:`);
      for (const f of opaque) console.log(`    ${C.d}${f.where}${C.x} — p_scopes = ${f.arg}`);
    }

    if (offenders.length) {
      console.error(
        `${C.r}[FAIL]${C.x} ${offenders.length} caller(s) pass a NON-ARRAY p_scopes to platform.knob_resolve (DD-198).\n` +
          `  knob_resolve reads p_scopes only through jsonb_array_elements, and only once a row-keyed\n` +
          `  override exists — so an object argument is silent until the first person creates one, and\n` +
          `  then every call raises 22023 cannot extract elements from an object.\n` +
          `  Fix: jsonb_build_array(jsonb_build_object('kind', '<rung>', 'id', <uuid>)), or NULL when the\n` +
          `  call stands on no row-keyed rung — the shape platform._knob_override_write already uses.`,
      );
      for (const f of offenders) console.error(`    ${C.b}${f.where}${C.x} — p_scopes = ${f.arg}`);
      return 1;
    }

    console.log(
      `${C.g}[ OK ]${C.x} ${ok.length} knob_resolve call site(s) name their rungs with an array or nothing ` +
        `(${findings.length} read: live catalog + ${SOURCE_ROOTS.join(", ")}).`,
    );
    return 0;
  } finally {
    await client.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${C.r}[FAIL]${C.x} check:knob-resolve-callers errored, so it measured NOTHING:\n  ${String(err?.message ?? err)}`);
    process.exit(1);
  });

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
import { execFileSync } from "node:child_process";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = resolve(ROOT, "..");
const SELF_TEST = process.argv.includes("--self-test");
const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

// ONE credential loader and ONE catalog query, shared with
// check:knob-database-consumers (DD-211) so the two guards can never disagree
// about where the database is or which bodies count as callers.
import { CATALOG_SQL, DB_VARS, client as dbClient, loadDbEnv } from "./knob-resolve-callers/db";
import { classify, knobResolveCalls, scopesArgumentOf } from "./knob-resolve-callers/core";
import type { Verdict } from "./knob-resolve-callers/core";
import { exitAfterDrain } from "./lib/exit-after-drain";

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

/**
 * SOURCE means SOURCE: a git-ignored file is not a caller.
 *
 * matrx-local mirrors coding-session artifacts into its gitignored runtime data directory
 * (`system/data/coding-sessions/…`), so a lane's own scratch SQL — including the deliberately
 * broken RED variants written to prove a guard fires — lands inside a scanned repo minutes
 * later and is not code anybody runs. The same is true of any build output or cache a future
 * `.gitignore` covers. Asking git is the durable rule; hardcoding one path is not.
 *
 * If git cannot answer (no repo, no binary), NOTHING is skipped and the script SAYS SO — a
 * silent widening would be a stand-in that never announces itself.
 */
function ignoredIn(root: string, files: string[]): Set<string> {
  const out = new Set<string>();
  // In CHUNKS: `git check-ignore --stdin` writes its answers while it is still reading, so a
  // single write of every path in a repo fills the pipe and the child is gone before we finish
  // writing (spawnSync EPIPE, measured on all four repos). Only the handful of files that
  // actually mention knob_resolve are ever asked about, so one chunk is normally enough.
  const CHUNK = 200;
  for (let i = 0; i < files.length; i += CHUNK) {
    const batch = files.slice(i, i + CHUNK);
    let answer: string;
    try {
      answer = execFileSync("git", ["-C", root, "check-ignore", "--stdin", "-z"], {
        input: batch.map((f) => relative(root, f)).join("\0"),
        encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e: unknown) {
      // `git check-ignore` exits 1 when it matched NOTHING — a clean answer, not an error.
      const err = e as { status?: number; stdout?: string; message?: string };
      if (err.status === 1) { answer = String(err.stdout ?? ""); }
      else {
        console.log(`${C.y}[NOTE]${C.x} git could not tell this guard what is ignored in ${relative(WORKSPACE, root)} — every file there is being read, build output and mirrors included. (${err.message?.slice(0, 120)})`);
        return new Set();
      }
    }
    for (const r of answer.split("\0")) if (r) out.add(resolve(root, r));
  }
  return out;
}

function scanRepos(): Finding[] {
  const findings: Finding[] = [];
  for (const repo of SOURCE_ROOTS) {
    const root = resolve(WORKSPACE, repo);
    if (!existsSync(root)) continue;
    const files: string[] = [];
    walk(root, files);
    // Narrow to the files that actually mention it BEFORE asking git — that keeps the
    // ignore question to a handful of paths instead of every file in the repo.
    const candidates: { path: string; text: string }[] = [];
    for (const f of files) {
      // Generated database types name the function; they never call it.
      if (/database\.types\.ts$/.test(f) || SKIP_FILE.test(f)) continue;
      let text: string;
      try { text = readFileSync(f, "utf8"); } catch { continue; }
      if (!text.includes("knob_resolve")) continue;
      candidates.push({ path: f, text });
    }
    const ignored = ignoredIn(root, candidates.map((c) => c.path));
    for (const c of candidates) {
      if (ignored.has(c.path)) continue;
      findings.push(...scan(relative(WORKSPACE, c.path), strip(c.text)));
    }
  }
  return findings;
}



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

  const client = dbClient(env, "check:knob-resolve-callers");
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
  .then((code) => exitAfterDrain(code))
  .catch((err) => {
    console.error(`${C.r}[FAIL]${C.x} check:knob-resolve-callers errored, so it measured NOTHING:\n  ${String(err?.message ?? err)}`);
    exitAfterDrain(1);
  });

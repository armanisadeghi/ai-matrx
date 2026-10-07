#!/usr/bin/env node
// scripts/safety-net/run.mjs — LANE SAFETY-NET (2026-10-01): THE ONE COMMAND.
//
// Runs every safety-net check against LIVE or the CLONE and writes one pass/fail table, the logs
// and the screenshots under common-docs/operations/for-arman/2026-10-01/safety-net/<run>/.
//
//   node scripts/safety-net/run.mjs --target live            # the before / after run (read-mostly)
//   node scripts/safety-net/run.mjs --target clone           # everything, incl. SQL suites
//   node scripts/safety-net/run.mjs --target clone --plant <plant-id>   # PROVE RED: one planted break
//   node scripts/safety-net/run.mjs --list                   # every check, its items and targets
//   options: --half a|b|all (a = SAFETY-NET's areas, b = SAFETY-NET-B's: cutover, agents)
//            --walk-parallel <n> (live: 3 is safe; clone: 1)   --parallel <n> (SQL/cmd, default 1)
//            --only <checkId,checkId|area>   --origin <url>   --out <dir>   --label <word>
//
// What runs where (the lane rules):
// - LIVE: the walks (admin@admin.com / test@test.com, disposable fixtures in Cedar Ridge, archived at
//   the end) and READ-ONLY probes (each wrapped in `begin read only`). No SQL suite that writes, no
//   plant, no schema / permission / lock change ever reaches live: the runner refuses.
// - CLONE: everything. The clone is resolved from CLONE_DATABASE_URL (.env.local) and proven by
//   its connection user carrying the clone ref from common-docs/operations/clone/CLONE-REF.
// - PLANTS (clone only): `in-transaction` plants run in the same session before the suite and are
//   rolled back with it; `committed` plants (for walks, which read through the app) are applied,
//   the check runs, then the restore runs in `finally` and a read-back proves it was restored.
//
// A fresh agent runs this and reports the table. It never edits a check to make it pass.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { CHECKS, ITEMS } from "./checks.mjs";
import { formatDurationMs } from "@ai-matrx/kit/format";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const CODE = resolve(REPO, "..");
const args = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);

if (flag("list")) {
  for (const c of CHECKS) console.log(`${c.id.padEnd(44)} ${c.kind.padEnd(5)} [${c.targets.join("/")}] ${c.items.join(",")}`);
  process.exit(0);
}

const SELF_TEST = flag("self-test");
const TARGET = SELF_TEST ? "clone" : opt("target");
if (!["live", "clone"].includes(TARGET)) {
  console.error("--target live|clone is required");
  process.exit(2);
}
const PLANT = opt("plant");
// Plants run on the clone only — except an `intercept` plant, which breaks only this run's own test
// browser at its network boundary and changes nothing on any server (checked after the plant loads).

// ── environment ────────────────────────────────────────────────────────────────────────────
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}
const AIDREAM_ENV = readEnvFile(join(CODE, "aidream/.env"));
const FE_ENV = readEnvFile(join(REPO, ".env.local"));
const PSQL = process.env.PSQL ?? ["/opt/homebrew/opt/libpq/bin/psql", "/opt/homebrew/opt/postgresql@17/bin/psql", "/opt/homebrew/opt/postgresql@16/bin/psql"].find(existsSync);
if (!PSQL) {
  console.error("no psql binary found (set PSQL)");
  process.exit(2);
}
const cloneRef = (readFileSync(join(CODE, "common-docs/operations/clone/CLONE-REF"), "utf8").match(/^clone_ref\s*=\s*(\S+)/m) ?? [])[1];
const CLONE_DSN = process.env.CLONE_DATABASE_URL ?? FE_ENV.CLONE_DATABASE_URL;
// 🚨 W27 (2026-10-01 ~03:15 PT, the chair): LIVE IS NEVER REACHED THROUGH THE TRANSACTION POOLER.
// A `begin read only … rollback` sent through Supavisor's transaction pooler (port 6543) whose rollback
// never ran (psql stopped on an error, a timeout, a killed run) left a backend in an open READ-ONLY
// transaction; the pooler handed it to the aidream server and its next UPDATE failed with "cannot
// execute UPDATE in a read-only transaction" (ops.app_log bursts 09:39–10:14Z). So the live DSN is the
// SESSION pooler on the same host (port 5432: a disconnect ends the backend), 6543 is refused by name,
// every live probe runs with ON_ERROR_STOP=0 so its trailing rollback always executes, and every live
// connection carries application_name=safety-net-live so it can be found. Self-test: --self-test.
const LIVE_SESSION_PORT = "5432";
function assertLiveDsn(dsn) {
  const port = (String(dsn).match(/@[^/:]+:(\d+)\//) ?? [])[1];
  if (port === "6543") throw new Error("refused: a live connection through the TRANSACTION pooler (6543) can hand a half-open read-only transaction to the app (W27); use the session pooler 5432");
  if (port !== LIVE_SESSION_PORT) throw new Error(`refused: live DSN port ${port ?? "?"} is not the session pooler ${LIVE_SESSION_PORT}`);
  return dsn;
}
function liveDsnFrom(e) {
  if (!e.SUPABASE_MATRIX_HOST) return null;
  return assertLiveDsn(`postgresql://${encodeURIComponent(e.SUPABASE_MATRIX_USER)}:${encodeURIComponent(e.SUPABASE_MATRIX_PASSWORD)}@${e.SUPABASE_MATRIX_HOST}:${LIVE_SESSION_PORT}/${e.SUPABASE_MATRIX_DATABASE_NAME}?application_name=safety-net-live`);
}
const LIVE_DSN = liveDsnFrom(AIDREAM_ENV);
/** The one live/read-only wrapper: rollback ALWAYS runs (ON_ERROR_STOP=0); any ERROR is a failure. */
function readOnlyBody(text, vars = "") {
  return `${vars}\nbegin read only;\nset local statement_timeout = '60s';\nset local idle_in_transaction_session_timeout = '90s';\n${text}\nrollback;\n`;
}
if (TARGET === "clone") {
  if (!CLONE_DSN || !cloneRef || !CLONE_DSN.includes(`postgres.${cloneRef}`)) {
    console.error(`refused: CLONE_DATABASE_URL does not name the current clone (${cloneRef}); re-publish it (aidream: uv run python scripts/clone/refresh_clone.py --publish-current)`);
    process.exit(2);
  }
}
const DSN = TARGET === "clone" ? CLONE_DSN : LIVE_DSN;

// A CLONE run through the local preview must find the preview serving the CLONE — the one dev server
// switches modes, and at ~02:00 PT on 2026-10-01 it was restarted in LIVE mode while clone walks ran
// (their writes went to production and their plants, on the clone, were invisible). Refuse by name.
function previewServesTheClone(origin) {
  if (!/localhost/.test(origin)) return { ok: false, why: `${origin} is not the local preview; a clone walk needs the clone-mode preview` };
  const r = spawnSync("bash", [join(REPO, "scripts/agent-dev-server.sh"), "status"], { encoding: "utf8", cwd: REPO });
  const out = `${r.stdout}${r.stderr}`;
  const mode = (out.match(/mode=(\w+)/) ?? [])[1];
  if (mode !== "clone") return { ok: false, why: `the preview is ${mode ? `in ${mode.toUpperCase()} mode` : "not running"} (pnpm preview:status); a clone walk would ${mode === "live" ? "write to PRODUCTION" : "find nothing"}. Start it in clone mode: pnpm preview:start` };
  if (cloneRef && !out.includes(cloneRef)) return { ok: false, why: `the preview serves a clone other than the current ${cloneRef}` };
  return { ok: true };
}

const ORIGIN = opt("origin") ?? (TARGET === "live" ? "https://www.aimatrx.com" : "http://safety-net.localhost:3001");
const MANAGE = TARGET === "live" ? "https://manage.aimatrx.com" : ORIGIN;
const hhmm = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Los_Angeles" }).replace(":", "");
const LABEL = opt("label") ?? (PLANT ? `plant-${PLANT}` : "run");
const OUT = resolve(opt("out") ?? join("/tmp/matrx-evidence", `2026-10-01/safety-net/${TARGET}-${hhmm}-${LABEL}`));
mkdirSync(join(OUT, "logs"), { recursive: true });
mkdirSync(join(OUT, "shots"), { recursive: true });

// ── self-test (W27): the refusal and the rollback, proven ───────────────────────────────────
if (SELF_TEST) {
  let bad = 0;
  const say = (ok, what) => {
    console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
    if (!ok) bad += 1;
  };
  let refused = false;
  try {
    assertLiveDsn("postgresql://u:p@aws-1-us-east-1.pooler.supabase.com:6543/postgres");
  } catch {
    refused = true;
  }
  say(refused, "a live DSN on the transaction pooler (6543) is refused");
  say(!LIVE_DSN || /:5432\//.test(LIVE_DSN), "the live DSN the runner builds is the session pooler (5432)");
  say(!LIVE_DSN || /application_name=safety-net-live/.test(LIVE_DSN), "every live connection is named safety-net-live");
  const body = readOnlyBody("select 1/0;");
  say(/^\s*begin read only;/m.test(body) && /rollback;\s*$/.test(body), "the read-only wrapper opens read only and ends with rollback");
  // Real proof on the CLONE's session pooler: a probe that errors mid-transaction leaves no open
  // transaction behind under its application name.
  const cloneSession = CLONE_DSN.replace(/:6543\//, ":5432/") + (CLONE_DSN.includes("?") ? "&" : "?") + `application_name=sn-selftest-${process.pid}`;
  const r = spawnSync(PSQL, [cloneSession, "-v", "ON_ERROR_STOP=0", "-At", "-f", "-"], { input: readOnlyBody("select 1/0;\nselect 'after the error';"), encoding: "utf8", cwd: REPO });
  const out = `${r.stdout}${r.stderr}`;
  say(/division by zero/.test(out) && /^ROLLBACK$/m.test(out), "an erroring probe still reaches its rollback (ON_ERROR_STOP=0)");
  const left = spawnSync(PSQL, [CLONE_DSN, "-At", "-c", `select count(*) from pg_stat_activity where application_name = 'sn-selftest-${process.pid}' and state like 'idle in transaction%'`], { encoding: "utf8" });
  say(left.stdout.trim() === "0", `no transaction is left open after it (found ${left.stdout.trim() || left.stderr.trim()})`);
  // The old shape, for contrast: ON_ERROR_STOP=1 stops before the rollback (the hazard W27 names).
  const oldShape = spawnSync(PSQL, [cloneSession, "-v", "ON_ERROR_STOP=1", "-At", "-f", "-"], { input: "begin read only;\nselect 1/0;\nrollback;\n", encoding: "utf8" });
  say(oldShape.status !== 0 && !/ROLLBACK/.test(`${oldShape.stdout}`), "the OLD shape (ON_ERROR_STOP=1) stops before its rollback — the hazard is real");
  console.log(bad ? `self-test: ${bad} failed` : "self-test: all passed");
  process.exit(bad ? 1 : 0);
}

// ── selection ──────────────────────────────────────────────────────────────────────────────
const only = opt("only")?.split(",").filter(Boolean) ?? null;
let plant = null;
if (PLANT) {
  const file = join(HERE, "plants", `${PLANT}.mjs`);
  if (!existsSync(file)) {
    console.error(`no plant ${file}`);
    process.exit(2);
  }
  plant = (await import(file)).default;
  // On live only an intercept plant (the test browser's own boundary) or an `env` plant that declares
  // `liveSafe` with its reason (it changes only what the probe ASKS, never any server or row) may run.
  if (TARGET !== "clone" && plant.mode !== "intercept" && !(plant.mode === "env" && plant.liveSafe)) {
    console.error("refused: a planted break runs on the clone only (an intercept plant, or an env plant marked liveSafe, may run on live)");
    process.exit(2);
  }
}
// HALVES (2026-10-01 split): a = SAFETY-NET (tables, lists, scopes, datahome, drill, platform);
// b = SAFETY-NET-B (cutover, agents). `--half all` (default) runs both.
const HALF = opt("half", "all");
const HALF_B = new Set(["cutover", "agents"]);
if (!["a", "b", "all"].includes(HALF)) {
  console.error("--half a|b|all");
  process.exit(2);
}
let selected = CHECKS.filter((c) => c.targets.includes(TARGET));
if (HALF !== "all") selected = selected.filter((c) => (HALF === "b") === HALF_B.has(c.area));
if (only) selected = selected.filter((c) => only.some((o) => c.id === o || c.id.startsWith(`${o}.`) || c.area === o));
if (plant) selected = selected.filter((c) => c.id === plant.check);
if (flag("no-walks")) selected = selected.filter((c) => c.kind !== "walk");
if (TARGET === "clone" && selected.some((c) => c.kind === "walk")) {
  const p = previewServesTheClone(ORIGIN);
  if (!p.ok) {
    console.error(`refused: ${p.why}. (SQL and cmd checks only: add --no-walks.)`);
    process.exit(2);
  }
}
if (!selected.length) {
  console.error("nothing selected");
  process.exit(2);
}

// ── runners per kind ───────────────────────────────────────────────────────────────────────
function run(cmd, argv, { cwd = REPO, env = {}, input = null, timeoutMs = 45 * 60 * 1000, log }) {
  return new Promise((resolveP) => {
    const t0 = Date.now();
    const child = spawn(cmd, argv, { cwd, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    const onData = (d) => {
      out += d;
      appendFileSync(log, d);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    if (input) child.stdin.end(input);
    else child.stdin.end();
    const timer = setTimeout(() => {
      appendFileSync(log, `\n[runner] TIMEOUT after ${timeoutMs} ms\n`);
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveP({ code: code ?? 99, out, ms: Date.now() - t0 });
    });
  });
}

function psqlSync(sql, { readOnly = false } = {}) {
  if (readOnly) {
    const r = spawnSync(PSQL, [DSN, "-v", "ON_ERROR_STOP=0", "-At", "-f", "-"], { input: readOnlyBody(sql), encoding: "utf8", cwd: REPO });
    const out = `${r.stdout}${r.stderr}`;
    return { code: /\bERROR:/.test(out) ? 1 : r.status, out };
  }
  const r = spawnSync(PSQL, [DSN, "-v", "ON_ERROR_STOP=1", "-At", "-f", "-"], { input: sql, encoding: "utf8", cwd: REPO });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const walkEnv = {
  SN_TARGET: TARGET,
  SN_ORIGIN: ORIGIN,
  SN_MANAGE_ORIGIN: MANAGE,
  SN_OUT: OUT,
  SN_CLONE_REF: cloneRef ?? "",
};

async function runCheck(c) {
  const log = join(OUT, "logs", `${c.id}.log`);
  writeFileSync(log, `# ${c.id} (${c.kind}) target=${TARGET}${plant ? ` plant=${plant.id}` : ""}\n`);
  if (c.kind === "walk") {
    const r = await run(process.execPath, [join(REPO, c.file)], { env: { ...walkEnv, ...(c.env ?? {}), ...(plant && plant.mode === "env" ? plant.env : {}), ...(plant && plant.mode === "intercept" ? { SN_INTERCEPT: JSON.stringify(plant.rules ?? []), SN_INJECT_CSS: plant.css ?? "" } : {}) }, log, timeoutMs: c.timeoutMs ?? 40 * 60 * 1000 });
    const name = c.walkName ?? c.file.split("/").pop().replace(/\.mjs$/, "");
    const jf = join(OUT, `${name}.json`);
    const steps = existsSync(jf) ? JSON.parse(readFileSync(jf, "utf8")).results : [];
    return { code: r.code, ms: r.ms, steps, tail: r.out.slice(-1200) };
  }
  if (c.kind === "sql") {
    const readOnly = TARGET === "live";
    if (readOnly && !c.liveReadOnly) return { code: 0, skip: "SQL that writes runs on the clone only", steps: [] };
    // A `vars` plant switches one of the suite's OWN built-in plants on (`-v plant=nolane` etc.).
    const allVars = { ...(c.vars ?? {}), ...(plant && plant.mode === "vars" ? plant.vars : {}) };
    const vars = Object.entries(allVars).map(([k, v]) => `\\set ${k} '${v}'`).join("\n");
    const text = readFileSync(join(REPO, c.file), "utf8");
    let wrapped;
    if (readOnly) {
      // LIVE goes through the TRANSACTION pooler (port 6543): a session-level SET does not survive
      // a transaction, so the only read-only guarantee is ONE explicit `begin read only … rollback`.
      // A file that opens, ends or includes anything (a campaign suite's preamble commits) is refused.
      const bad = text.split("\n").find((l) => /^\s*(begin|commit|rollback|end|start\s+transaction|abort)\b/i.test(l) || /^\s*\\(i|ir|include|include_relative)\b/.test(l));
      if (bad) throw new Error(`refused on live: ${c.file} controls its own transaction or includes a file (${bad.trim().slice(0, 60)}); a live probe is one plain read-only body`);
      wrapped = readOnlyBody(text, vars);
    } else {
      // IN-TRANSACTION PLANTS (and a check's `inTxSql`, e.g. a longer `set local statement_timeout`)
      // GO INSIDE THE SUITE'S OWN TRANSACTION. Every campaign suite includes _preamble.sql, which runs
      // its own begin … commit, and the clone is reached through the transaction pooler, so anything
      // sent before `\i suite` is either committed (a plant — caught by SN-SCOPES, 2026-10-01 ~02:05 PT,
      // before any plant had run) or lost (a session SET). The suite's text is composed with them
      // inserted right after its first `begin` that follows the preamble; a suite with no such begin,
      // or with a `commit` after it, is refused for an in-transaction plant.
      const inject = [c.inTxSql ?? null, plant && plant.mode === "in-transaction" ? plant.apply : null].filter(Boolean);
      let suiteRef = `\\i ${c.file}`;
      // `substitute` ([{ from, to }]) changes a suite's RUN PARAMETER in the composed copy only (e.g. its
      // own `set local statement_timeout` on a busy shared clone) — never an assertion.
      if (inject.length || c.substitute?.length) {
        let src = text;
        for (const sub of c.substitute ?? []) {
          if (!src.includes(sub.from)) throw new Error(`refused: ${c.file} no longer contains "${sub.from}"`);
          src = src.split(sub.from).join(sub.to);
        }
        const lines = src.split("\n");
        const pre = lines.findIndex((l) => /^\s*\\i\s+\S*_preamble\.sql/.test(l));
        const at = lines.findIndex((l, i) => i > pre && /^\s*begin\b/i.test(l));
        if (at < 0 && inject.length) throw new Error(`refused: ${c.file} opens no transaction after its preamble, so an in-transaction plant would commit`);
        if (plant && plant.mode === "in-transaction" && lines.slice(at + 1).some((l) => /^\s*commit\s*;/i.test(l))) throw new Error(`refused: ${c.file} commits after its begin, so an in-transaction plant would commit`);
        if (inject.length) lines.splice(at + 1, 0, "-- ── SAFETY-NET (inside the suite's transaction; rolled back with it) ──", ...inject, "-- ── end ──");
        const composed = join(OUT, "logs", `${c.id}.composed.sql`);
        writeFileSync(composed, lines.join("\n"));
        suiteRef = `\\i ${composed}`;
      }
      wrapped = `\\set expect 'clone'\n${vars}\n${suiteRef}\n`;
    }
    if (readOnly) {
      // W27: ON_ERROR_STOP=0 so the trailing rollback always runs; an ERROR anywhere is a FAIL.
      assertLiveDsn(DSN);
      const r0 = await run(PSQL, [DSN, "-v", "ON_ERROR_STOP=0", "-X", "-f", "-"], { input: wrapped, log, timeoutMs: c.timeoutMs ?? 5 * 60 * 1000 });
      const code = /\bERROR:/.test(r0.out) ? 1 : r0.code;
      return { code, ms: r0.ms, steps: [], tail: r0.out.slice(-1500) };
    }
    let r = await run(PSQL, [DSN, "-v", "ON_ERROR_STOP=1", "-X", "-f", "-"], { input: wrapped, log, timeoutMs: c.timeoutMs ?? 20 * 60 * 1000 });
    // The clone is shared by many lanes: a lock / statement timeout is the neighbours, not the
    // product. Retry ONCE after a pause, and say so in the log; a second timeout is a FAIL.
    if (r.code !== 0 && /canceling statement due to (lock|statement) timeout|deadlock detected/.test(r.out)) {
      appendFileSync(log, "\n[runner] lock/statement timeout on the shared clone — retrying once in 20 s\n");
      await new Promise((ok) => setTimeout(ok, 20000));
      r = await run(PSQL, [DSN, "-v", "ON_ERROR_STOP=1", "-X", "-f", "-"], { input: wrapped, log, timeoutMs: c.timeoutMs ?? 20 * 60 * 1000 });
    }
    const skipped = /\bSKIPPED\b/.test(r.out) && r.code === 0;
    // A suite that prints a verdict instead of exiting non-zero names it: passWhen / failWhen.
    if (r.code === 0 && c.passWhen && !new RegExp(c.passWhen, "m").test(r.out)) r = { ...r, code: 1 };
    if (c.failWhen && new RegExp(c.failWhen, "m").test(r.out)) r = { ...r, code: 1 };
    return { code: r.code, ms: r.ms, skip: skipped ? "suite SKIPPED (a dependency it declares is absent)" : null, steps: [], tail: r.out.slice(-1500) };
  }
  if (c.kind === "cmd") {
    const cwd = c.cwd ? resolve(REPO, c.cwd) : REPO;
    // cmd env values may name $SN_ORIGIN, $SN_MANAGE_ORIGIN, $SN_OUT, $SN_TARGET.
    const subst = (v) => String(v).replace(/\$SN_ORIGIN/g, ORIGIN).replace(/\$SN_MANAGE_ORIGIN/g, MANAGE).replace(/\$SN_OUT/g, OUT).replace(/\$SN_TARGET/g, TARGET);
    const env = Object.fromEntries(Object.entries(c.env ?? {}).map(([k, v]) => [k, subst(v)]));
    if (plant && plant.mode === "env") Object.assign(env, plant.env);
    if (c.dbEnv === "clone") {
      env.CLONE_DATABASE_URL = CLONE_DSN;
      env.DATABASE_URL = CLONE_DSN;
    }
    if (c.dbEnv === "target") env.SN_DSN = DSN;
    // W27: a live cmd that builds its own connection from the five SUPABASE_MATRIX_* values gets the
    // SESSION pooler port and an application name, never 6543.
    if (TARGET === "live") Object.assign(env, { SUPABASE_MATRIX_PORT: LIVE_SESSION_PORT, PGPORT: LIVE_SESSION_PORT, PGAPPNAME: "safety-net-live", SN_LIVE_SESSION_PORT: LIVE_SESSION_PORT });
    env.SN_TARGET = TARGET;
    env.SN_OUT = OUT;
    const r = await run(c.cmd, c.args, { cwd, env, log, timeoutMs: c.timeoutMs ?? 30 * 60 * 1000 });
    const passRe = c.passWhen ? new RegExp(c.passWhen, "m") : null;
    const failRe = c.failWhen ? new RegExp(c.failWhen, "m") : null;
    let code = r.code;
    if (code === 0 && passRe && !passRe.test(r.out)) code = 1;
    if (failRe && failRe.test(r.out)) code = 1;
    // SAFETY-NET-B: a cmd probe that writes per-step results ({ results: [{ step, items, status, detail }] }, the walk
    // shape) to OUT/<stepsJson> is graded per item like a walk, so one failed step does not fail every item it names.
    const sj = c.stepsJson ? join(OUT, c.stepsJson) : null;
    const steps = sj && existsSync(sj) ? JSON.parse(readFileSync(sj, "utf8")).results ?? [] : [];
    return { code, ms: r.ms, steps, tail: r.out.slice(-1500) };
  }
  return { code: 99, steps: [], tail: `unknown kind ${c.kind}` };
}

// ── the run ────────────────────────────────────────────────────────────────────────────────
const started = new Date();
console.log(`[safety-net] target=${TARGET} origin=${ORIGIN} out=${relative(CODE, OUT)} checks=${selected.length}${plant ? ` PLANT=${plant.id}` : ""}`);
const rows = [];
let plantApplied = false;
try {
  if (plant && plant.mode === "committed") {
    // A plant that REPLACES something (a function body, a row) captures its own restore first:
    // `captureRestore` is SQL whose output IS the restore SQL (e.g. pg_get_functiondef(...)), taken
    // immediately before the apply so the restore puts back exactly what was there.
    if (plant.captureRestore) {
      const cap = psqlSync(plant.captureRestore);
      if (cap.code !== 0 || !cap.out.trim()) throw new Error(`plant captureRestore failed: ${cap.out.slice(-600)}`);
      plant.restore = `${cap.out.trim()}\n;\n${plant.restore ?? ""}`;
      writeFileSync(join(OUT, "logs", "plant-restore.sql"), plant.restore);
    }
    const a = psqlSync(plant.apply);
    writeFileSync(join(OUT, "logs", "plant-apply.log"), a.out);
    if (a.code !== 0) throw new Error(`plant apply failed: ${a.out.slice(-600)}`);
    plantApplied = true;
    console.log(`[safety-net] PLANTED (committed on the clone): ${plant.description}`);
  }
  // Walks run one at a time (browser load on the shared preview); SQL / cmd checks two at a time.
  const queue = [...selected];
  const parallel = Number(opt("parallel", "1"));
  async function worker() {
    while (queue.length) {
      const c = queue.shift();
      console.log(`[safety-net] ▶ ${c.id}`);
      let r;
      try {
        r = await runCheck(c);
      } catch (e) {
        r = { code: 98, steps: [], tail: String(e?.message ?? e) };
        appendFileSync(join(OUT, "logs", `${c.id}.log`), `\n[runner] ${r.tail}\n`);
      }
      const status = r.skip ? "SKIP" : r.code === 0 ? "PASS" : "FAIL";
      rows.push({ check: c, status, ...r });
      console.log(`[safety-net] ${status} ${c.id} (${formatDurationMs(r.ms, { style: "compact" })})`);
    }
  }
  const walks = selected.filter((c) => c.kind === "walk");
  const rest = selected.filter((c) => c.kind !== "walk");
  queue.length = 0;
  queue.push(...rest);
  const restWorkers = Promise.all(Array.from({ length: parallel }, worker));
  await restWorkers;
  queue.push(...walks);
  // Walks share one browser each. On the clone they share the one dev server, so one at a time;
  // on live `--walk-parallel 3` is safe (each walk is one seat-pair in its own browser).
  const walkParallel = Number(opt("walk-parallel", "1"));
  await Promise.all(Array.from({ length: walkParallel }, worker));
} finally {
  if (plantApplied) {
    const r = psqlSync(plant.restore);
    writeFileSync(join(OUT, "logs", "plant-restore.log"), r.out);
    const rb = plant.readback ? psqlSync(plant.readback) : { code: 0, out: "t" };
    const restored = r.code === 0 && rb.code === 0 && /^t$/m.test(rb.out.trim());
    console.log(`[safety-net] ${restored ? "RESTORED" : "🚨 RESTORE NOT PROVEN"} plant ${plant.id}: ${rb.out.trim().slice(0, 200)}`);
    appendFileSync(join(OUT, "logs", "plant-restore.log"), `\nreadback: ${rb.out}\nrestored=${restored}\n`);
    if (!restored) process.exitCode = 5;
  }
}

// ── grade per item ─────────────────────────────────────────────────────────────────────────
const byItem = new Map(Object.keys(ITEMS).map((id) => [id, []]));
for (const r of rows) {
  if (r.steps?.length) {
    for (const s of r.steps) for (const id of s.items) byItem.get(id)?.push({ status: s.status, how: `${r.check.id} · ${s.step}`, detail: s.detail, shot: s.shot });
    // A walk that crashed before its steps graded nothing: its declared items are FAIL.
    if (r.code !== 0 && !r.steps.some((s) => s.status === "FAIL")) for (const id of r.check.items) byItem.get(id)?.push({ status: "FAIL", how: r.check.id, detail: `walk exited ${r.code}: ${(r.tail ?? "").split("\n").slice(-3).join(" ")}` });
  } else {
    for (const id of r.check.items) byItem.get(id)?.push({ status: r.status, how: r.check.id, detail: r.skip ?? (r.status === "FAIL" ? (r.tail ?? "").split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 240) : "exit 0") });
  }
}
const grade = (list) => (!list.length ? "—" : list.some((x) => x.status === "FAIL") ? "FAIL" : list.some((x) => x.status === "PASS") ? "PASS" : "SKIP");
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const lines = [];
lines.push(`# Safety net — ${TARGET} — ${started.toISOString()}${plant ? ` — PLANT ${plant.id}` : ""}`);
lines.push("");
lines.push(`Origin ${ORIGIN} · database ${TARGET === "clone" ? `clone ${cloneRef}` : "production (read-only probes only)"} · ${selected.length} checks · runner \`node scripts/safety-net/run.mjs ${args.join(" ")}\``);
if (plant) lines.push(`\n**Planted break:** ${plant.description} (expected to turn RED: ${plant.items.join(", ")})`);
const counts = { PASS: 0, FAIL: 0, SKIP: 0, "—": 0 };
const itemRows = [];
for (const [id, list] of byItem) {
  if (plant && !plant.items.includes(id) && !list.length) continue;
  const g = grade(list);
  counts[g] += 1;
  const fail = list.find((x) => x.status === "FAIL");
  const pick = fail ?? list.find((x) => x.status === "PASS") ?? list[0];
  itemRows.push(`| ${id} | ${esc(ITEMS[id])} | **${g}** | ${esc(pick?.how ?? "not run on this target")} | ${esc((pick?.detail ?? "").slice(0, 220))} | ${pick?.shot ? `[shot](${pick.shot})` : ""} |`);
}
lines.push("");
lines.push(`**Items:** ${counts.PASS} pass · ${counts.FAIL} fail · ${counts.SKIP} skip · ${counts["—"]} not run on this target`);
lines.push("");
lines.push("| Item | What | Result | Proven by | Detail | Shot |");
lines.push("|---|---|---|---|---|---|");
lines.push(...itemRows);
lines.push("");
lines.push("## Checks");
lines.push("");
lines.push("| Check | Kind | Result | Seconds | Log |");
lines.push("|---|---|---|---|---|");
for (const r of rows) lines.push(`| ${r.check.id} | ${r.check.kind} | **${r.status}** | ${Math.round((r.ms ?? 0) / 1000)} | [log](logs/${r.check.id}.log) |`);
writeFileSync(join(OUT, "SUMMARY.md"), `${lines.join("\n")}\n`);
writeFileSync(join(OUT, "summary.json"), JSON.stringify({ target: TARGET, origin: ORIGIN, plant: plant?.id ?? null, started, counts, items: Object.fromEntries([...byItem].map(([k, v]) => [k, { grade: grade(v), evidence: v }])), checks: rows.map((r) => ({ id: r.check.id, status: r.status, code: r.code, ms: r.ms })) }, null, 2));
console.log(`\n[safety-net] items: ${counts.PASS} pass · ${counts.FAIL} fail · ${counts.SKIP} skip · ${counts["—"]} not run → ${join(OUT, "SUMMARY.md")}`);
if (rows.some((r) => r.status === "FAIL") && !process.exitCode) process.exitCode = 1;

#!/usr/bin/env node
/**
 * check-no-session-read-only.mjs — NOTHING A SCRIPT DOES MAY OUTLIVE ITS TRANSACTION ON A POOLED BACKEND.
 *
 * Incident 2026-10-01 (08:31–10:14Z, ~210 refused writes): session-level SETs sent through the shared
 * Supabase TRANSACTION pooler (:6543) stayed on the backend and the pooler handed it to the production
 * server — "cannot execute UPDATE in a read-only transaction". Proof (clone, 2026-10-01): any session
 * SET leaks on :6543; the session pooler (:5432) resets between clients; an unfinished
 * `begin read only … rollback` is cleaned at disconnect. Doc: common-docs/projects/data-doctrine-adoption/
 * v5/PROGRESS-POOLER-LEAK-GUARD.md. The one helper: scripts/lib/pooled-db.mjs.
 *
 * Rules (executable lines of scripts/ and tests/; comment lines skipped):
 *   R0 session read-only — `default_transaction_read_only`, `set session characteristics … read only`,
 *      `set transaction_read_only` (any file).
 *   R1 session SET of any GUC — a bare `SET <guc> =|TO` (not LOCAL / TRANSACTION / CONSTRAINTS, not a
 *      function attribute) or `set_config(…, false)`, in a file that can reach production.
 *   R2 `begin read only` inside one psql `-c` string — use psqlRead() (stdin, ON_ERROR_STOP=0, rollback
 *      always runs) (any file).
 *   R3 production on the transaction pooler — `6543`, or a DSN / PGPORT / port built from
 *      SUPABASE_MATRIX_PORT (production's value is 6543), in a file that can reach production.
 * R1, R2 and R3 are a RATCHET: files that held them on 2026-10-01 are counted in
 * scripts/lib/pooler-leak-grandfathered.json; a new file or a higher count fails. Move a file onto
 * pooled-db.mjs and the count drops (`--print-baseline` prints the current counts).
 * Escape hatch per line: `pooler-session-readonly:allow <reason>` (R0) / `pooler-session-set:allow <reason>` (R1–R3).
 *
 *   pnpm check:no-session-read-only             # the guard
 *   pnpm check:no-session-read-only:self-test   # prove every rule can fail
 */
import { readdirSync, readFileSync, statSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, extname, dirname, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const R0 = [
  /default_transaction_read_only/i, // SET, ALTER ... SET, PGOPTIONS / options=-c ...
  /set\s+session\s+characteristics\s+as\s+transaction\s+read\s+only/i,
  /set\s+(session\s+)?transaction_read_only/i,
];
const R1_SET = /(?:^|["'`;(]|\\n)\s*set\s+(?!local\b|transaction\b|constraints\b)(?:session\s+)?(?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout|idle_session_timeout|transaction_timeout|search_path|work_mem|maintenance_work_mem|temp_buffers|jit\w*|application_name|session_replication_role|time\s*zone|timezone|default_transaction_\w+|default_\w+|synchronous_commit|row_security|enable_\w+|plan_cache_mode|client_min_messages|log_\w+|check_function_bodies|max_parallel_\w+|random_page_cost|effective_\w+|"?[a-z_]+\.[a-z_.]+"?)\s*(?:=|\bto\b)/i;
const R1_SET_ROLE = /(?:^|["'`;(]|\\n)\s*set\s+(?!local\b)(?:session\s+)?(?:role\s+\S|session\s+authorization\b)/i;
const R1_SET_CONFIG = /set_config\s*\([^)]*,\s*(?:false|'false')\s*\)/i;
const R1_NOT_A_SESSION_SET = /\b(language|security\s+definer|returns|function|procedure)\b|alter\s+(role|database|system|function|procedure|table|user)\b/i;
const R2_DASH_C = /(["'`]-c["'`]|\s-c\s)/;
const R2_BEGIN_RO = /begin\s+(transaction\s+)?read\s+only/i;
// A production DSN literal on 6543 (production's pooler host is aws-1-us-east-1; the clone's is aws-0).
const R3_LITERAL = /(brsgrqvjdzwihsvnfqkf[^\s"'`]*:6543|aws-1-us-east-1\.pooler\.supabase\.com:6543)/i;
// READING SUPABASE_MATRIX_PORT (production's value is 6543) into a connection — not assigning 5432 to it.
const R3_READS_PORT = /(\w\s*\[\s*["']SUPABASE_MATRIX_PORT|\w\??\.SUPABASE_MATRIX_PORT|\$\{?SUPABASE_MATRIX_PORT|\(\s*["']SUPABASE_MATRIX_PORT)/;
const R3_IN_CONNECTION = /(postgres(ql)?:\/\/|PGPORT|port\s*[:=(]|:\$\{|@\$\{|\bport\b|-p\b|make_conninfo|connect\()/i;
const REACHES_PRODUCTION = /SUPABASE_MATRIX_(HOST|PASSWORD|PORT|USER)|loadDbEnv|direct-db|gate-db|dsnFor\(\s*["'`]production|brsgrqvjdzwihsvnfqkf|governProduction|guardIfProduction/;

const EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".cjs", ".sh", ".py", ".sql"]);
const SKIP_DIR = new Set(["node_modules", ".git", ".next", "dist", "evidence"]);
const ALLOW_R0 = "pooler-session-readonly:allow";
const ALLOW = "pooler-session-set:allow";
const SELF = "check-no-session-read-only.mjs";
// Fixture files: their job is to name the forbidden shapes (another guard's red cases).
const FIXTURES = new Set(["scripts/__tests__/gate-db.test.ts", "scripts/__tests__/production-guard.test.ts", "scripts/lib/production-guard.selftest.mts"]);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const BASELINE = join(HERE, "lib", "pooler-leak-grandfathered.json");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (EXT.has(extname(name)) && name !== SELF) yield p;
  }
}

const isComment = (l) => /^\s*(\/\/|\*|\/\*|#|--)/.test(l);

/** Every hit as { file, line, rule, text }. `base` makes file names repo-relative. */
export function scan(roots, base = REPO) {
  const hits = [];
  for (const root of roots) {
    let files;
    try { files = [...walk(root)]; } catch { continue; }
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      const prod = REACHES_PRODUCTION.test(text);
      const file = relative(base, f);
      if (FIXTURES.has(file)) continue;
      text.split("\n").forEach((line, i) => {
        if (isComment(line)) return;
        const add = (rule) => hits.push({ file, line: i + 1, rule, text: line.trim().slice(0, 140) });
        if (!line.includes(ALLOW_R0) && R0.some((re) => re.test(line))) add("R0");
        if (line.includes(ALLOW)) return;
        if (prod && !line.includes(ALLOW_R0) && ((R1_SET.test(line) && !R1_NOT_A_SESSION_SET.test(line)) || R1_SET_ROLE.test(line) || R1_SET_CONFIG.test(line))) add("R1");
        if (R2_DASH_C.test(line) && R2_BEGIN_RO.test(line)) add("R2");
        if (R3_LITERAL.test(line) || (prod && R3_READS_PORT.test(line) && R3_IN_CONNECTION.test(line))) add("R3");
      });
    }
  }
  return hits;
}

/** {"R1": {file: n}, "R3": {file: n}} */
function counts(hits) {
  const out = { R1: {}, R2: {}, R3: {} };
  for (const h of hits) if (out[h.rule]) out[h.rule][h.file] = (out[h.rule][h.file] ?? 0) + 1;
  return out;
}

export function judge(hits, baseline, { stale = true } = {}) {
  const bad = hits.filter((h) => h.rule === "R0");
  const now = counts(hits);
  for (const rule of ["R1", "R2", "R3"]) {
    for (const [file, n] of Object.entries(now[rule])) {
      const allowed = baseline?.[rule]?.[file] ?? 0;
      if (n > allowed) bad.push(...hits.filter((h) => h.rule === rule && h.file === file).map((h) => ({ ...h, over: `${n} > grandfathered ${allowed}` })));
    }
  }
  // A stale entry fails too: the count went down, so the baseline goes down with it (a ratchet).
  for (const rule of stale ? ["R1", "R2", "R3"] : []) {
    for (const [file, allowed] of Object.entries(baseline?.[rule] ?? {})) {
      const n = now[rule][file] ?? 0;
      if (n < allowed) bad.push({ file, line: 0, rule, text: `stale grandfathered count ${allowed}, now ${n}`, over: "lower it in scripts/lib/pooler-leak-grandfathered.json" });
    }
  }
  return bad;
}

const REMEDY = {
  R0: "read-only is `begin read only` … `rollback` (or `set local` inside a transaction), never a session SET",
  R1: "a session SET outlives the transaction on a pooled backend — use `set local` inside the transaction (or pooled-db.mjs)",
  R2: "one `-c` string cannot guarantee its rollback — use psqlRead() from scripts/lib/pooled-db.mjs (stdin, ON_ERROR_STOP=0)",
  R3: "production is reached on the session pooler :5432 only — dsnFor('production') from scripts/lib/pooled-db.mjs",
};

function report(bad) {
  if (!bad.length) { console.log("check:no-session-read-only — clean (R0–R3; R1–R3 within the grandfathered counts)"); return 0; }
  console.error(`check:no-session-read-only — ${bad.length} hit(s) that can leave state on a pooled backend:`);
  for (const h of bad) console.error(`  [${h.rule}] ${h.file}:${h.line}: ${h.text}${h.over ? `  (${h.over})` : ""}`);
  for (const r of new Set(bad.map((h) => h.rule))) console.error(`  ${r}: ${REMEDY[r]}`);
  return 1;
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "no-session-ro-"));
  try {
    const PROD = 'const host = process.env.SUPABASE_MATRIX_HOST;';
    const cases = {
      R0: ['await c.query("set default_transaction_read_only = on");', 'await c.query("set session characteristics as transaction read only");',
        "psql 'postgresql://u@h:6543/db?options=-c%20default_transaction_read_only%3Don'", "SET transaction_read_only = on;"],
      R1: [`await c.query("set statement_timeout = '60s'");`, `spawnSync(PSQL, [dsn, "-c", "set lock_timeout='2s'; select 1"]);`,
        "await c.query(\"select set_config('search_path', 'public', false)\");", 'cur.execute("SET ROLE authenticated")'],
      R2: ['spawnSync(PSQL, [DSN, "-At", "-c", `begin read only; ${sql}; commit;`]);', 'psql "$DSN" -c "begin read only; select 1/0; rollback;"'],
      R3: ['const dsn = "postgresql://postgres.brsgrqvjdzwihsvnfqkf:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres";',
        "const url = `postgresql://${u}:${p}@${h}:${process.env.SUPABASE_MATRIX_PORT}/postgres`;", 'export PGPORT="$SUPABASE_MATRIX_PORT"',
        '"PGPORT": e["SUPABASE_MATRIX_PORT"], "PGDATABASE": e["SUPABASE_MATRIX_DATABASE_NAME"]}',
        "dsn = f\"postgresql://{u}:{pw}@{host}:{os.environ['SUPABASE_MATRIX_PORT']}/postgres\""],
    };
    const good = [
      'await c.query("begin read only");',
      "await c.query(\"set local statement_timeout = '60s'\");",
      "await c.query(\"select set_config('statement_timeout', '60s', true)\");",
      "create function f() returns int language sql security definer set search_path = pg_catalog as $$ select 1 $$;",
      "await c.query(\"set transaction read only\");",
      "// set statement_timeout = '60s'  (a comment)",
      "const r = psqlRead('production', sql);",
      'if (port === "6543") throw new Error("refused: production through the transaction pooler (6543)");',
      'Object.assign(env, { SUPABASE_MATRIX_PORT: "5432", PGPORT: "5432" });',
      'await c.query("set lock_timeout = \'1s\'"); // pooler-session-set:allow clone-only plant',
      'cur.execute("set default_transaction_read_only = on")  # pooler-session-readonly:allow direct freeze',
    ];
    let ok = true;
    for (const [rule, lines] of Object.entries(cases)) {
      for (const [i, l] of lines.entries()) {
        const sub = join(dir, `${rule}-${i}`); mkdirSync(sub);
        writeFileSync(join(sub, "bad.ts"), `${PROD}\n${l}\n`);
        const got = judge(scan([sub], dir), { R1: {}, R2: {}, R3: {} }).filter((h) => h.rule === rule);
        if (!got.length) { ok = false; console.log(`  RED missed [${rule}]: ${l}`); }
      }
    }
    const g = join(dir, "good"); mkdirSync(g);
    writeFileSync(join(g, "good.ts"), [PROD, ...good].join("\n"));
    const fp = judge(scan([g], dir), { R1: {}, R2: {}, R3: {} });
    for (const h of fp) { ok = false; console.log(`  GREEN false positive [${h.rule}]: ${h.text}`); }
    // Ratchet: a grandfathered count passes; one more fails.
    const r = join(dir, "ratchet"); mkdirSync(r);
    writeFileSync(join(r, "old.ts"), `${PROD}\nawait c.query("set statement_timeout = '1s'");\n`);
    const base = { R1: { "ratchet/old.ts": 1 }, R2: {}, R3: {} };
    const within = judge(scan([r], dir), base).length === 0;
    writeFileSync(join(r, "old.ts"), `${PROD}\nawait c.query("set statement_timeout = '1s'");\nawait c.query("set lock_timeout = '1s'");\n`);
    const over = judge(scan([r], dir), base).length > 0;
    writeFileSync(join(r, "old.ts"), `${PROD}\n`);
    const stale = judge(scan([r], dir), base).some((h) => h.text.startsWith("stale"));
    if (!within || !over || !stale) { ok = false; console.log(`  ratchet wrong: within=${within} over=${over} stale=${stale}`); }
    const n = Object.values(cases).flat().length;
    console.log(`self-test: ${n} red cases across R0–R3, ${good.length} green cases, ratchet within/over/stale — ${ok ? "ok" : "WRONG"}`);
    return ok ? 0 : 1;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv.includes("--self-test")) process.exit(selfTest());
const rootsArg = process.argv.indexOf("--root");
const roots = rootsArg > 0 ? [resolve(process.argv[rootsArg + 1])] : [join(REPO, "scripts"), join(REPO, "tests")];
const hits = scan(roots);
if (process.argv.includes("--print-baseline")) { console.log(JSON.stringify(counts(hits), null, 2)); process.exit(0); }
let baseline = { R1: {}, R2: {}, R3: {} };
try { baseline = JSON.parse(readFileSync(BASELINE, "utf8")); } catch { /* no baseline: every R1/R3 hit fails */ }
process.exit(report(judge(hits, baseline, { stale: rootsArg < 0 })));

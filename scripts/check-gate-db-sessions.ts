/**
 * EVERY RELEASE GATE THAT OPENS A DATABASE SESSION DOES IT THROUGH scripts/lib/gate-db.ts.
 *
 * Why (2026-09-25): the live database machine froze and was force-rebooted, and the heaviest
 * recurring load on it was our own gates — pooled sessions fanning out over hundreds of catalog
 * objects, statement timeouts raised to minutes, session-level SETs that stuck to pooled backends.
 * `scripts/lib/gate-db.ts` now owns the limits (two sessions per gate, 60 s statements unless a
 * reason is named, 3 s locks, 60 s idle in a transaction, all transaction-local). This guard makes
 * sure no gate goes around it.
 *
 * WHAT IT READS. Every gate `scripts/run-release-gates.sh --list` prints, in both lanes; the
 * command's entry files (through package.json, `&&` chains included); and every local module those
 * files import, transitively (static and dynamic imports, `./`, `../` and `@/`). A file is named
 * when its code — comments stripped — constructs a pg `Client`/`Pool` or calls `connectDirect(`.
 * A SHELL gate is named when it runs psql against the live database's SUPABASE_MATRIX_* variables
 * without `scripts/gate-db-limits.ts`.
 *
 * Advisory, per this repo's standing ruling: findings print `[WARN]` and exit 0; `--strict` exits
 * 1. `--self-test` proves it can go red on a gate that opens a raw session.
 *
 *   pnpm check:gate-db-sessions
 *   pnpm check:gate-db-sessions --strict
 *   pnpm check:gate-db-sessions:self-test
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");
/** `--ref=<git ref>` reads every gate file as it stood at that commit (the before-and-after proof). */
const REF = process.argv.find((a) => a.startsWith("--ref="))?.slice("--ref=".length);

/** The connection primitives themselves. They define sessions; they are not gates. */
const PRIMITIVES = new Set(["scripts/lib/gate-db.ts", "scripts/lib/direct-db.ts"]);

/**
 * Files a gate reaches that construct a connection the gate never opens. Each carries its reason;
 * an entry whose file no longer opens anything is itself reported (a stale excuse).
 */
const EXEMPT: Record<string, string> = {
  "scripts/apply-migration.ts":
    "the migration runner (`pnpm db:apply`). The four gates that reach it pass pure self-test " +
    "flags (--amend-idempotent --self-test, --ground-gate-self-test, --policy-only-self-test, " +
    "--window-class-self-test) that judge SQL text and open no connection.",
};

export interface Finding {
  readonly gate: string;
  readonly file: string;
  readonly what: string;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

const PG_IMPORT = /from\s+["']pg["']|require_?\(\s*["']pg["']\s*\)|import\(\s*["']pg["']\s*\)/;
const RAW_SESSION: Array<[RegExp, string, boolean]> = [
  [/\bnew\s+pg\.(Client|Pool)\s*\(/, "constructs a pg.$1 directly", false],
  [/\bnew\s+(Client|Pool)\s*\(/, "constructs a pg $1 directly", true],
  [/\bconnectDirect\s*\(/, "opens a session with connectDirect()", false],
];

/** What in this source opens a session outside the helper. Exported for the self-test. */
export function rawSessionsIn(src: string): string[] {
  const code = stripComments(src);
  const importsPg = PG_IMPORT.test(src);
  const out: string[] = [];
  for (const [re, what, needsPgImport] of RAW_SESSION) {
    if (needsPgImport && !importsPg) continue;
    const m = code.match(re);
    if (m) out.push(what.replace("$1", m[1] ?? ""));
  }
  return out;
}

/** A shell gate that runs psql against the live variables without the limits. */
export function rawShellSession(src: string): string | null {
  const code = src.replace(/^\s*#.*$/gm, "");
  const runsPsql = /(\$\{?PSQL\}?|\bpsql\b)["\s]/.test(code);
  const readsLive = /SUPABASE_MATRIX_/.test(code);
  if (!runsPsql || !readsLive) return null;
  if (/gate-db-limits\.ts/.test(code)) return null;
  return "runs psql against the live SUPABASE_MATRIX_* database without scripts/gate-db-limits.ts";
}

// ─── resolving a gate to its files ───────────────────────────────────────────

const PKG: Record<string, string> = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;

function entryFiles(cmd: string, depth = 0): string[] {
  if (depth > 5) return [];
  const out: string[] = [];
  for (const part of cmd.split(/&&|\|\||;/)) {
    const p = part.trim();
    const m = p.match(/^pnpm\s+(?:run\s+)?([\w:.-]+)/);
    if (m && m[1] !== "exec" && PKG[m[1]!]) {
      out.push(...entryFiles(PKG[m[1]!]!, depth + 1));
      continue;
    }
    for (const tok of p.split(/\s+/)) {
      const t = tok.replace(/^\.\//, "");
      if (/\.(ts|mts|mjs|js|cjs|sh)$/.test(t) && existsSync(join(ROOT, t))) out.push(t);
    }
  }
  return out;
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+|@\/[^"']+)["']/g;

function resolveImport(from: string, spec: string): string | null {
  let base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : resolve(ROOT, dirname(from), spec);
  base = base.replace(/\.(js|mjs)$/, "");
  for (const ext of ["", ".ts", ".tsx", ".mts", ".js", ".mjs", "/index.ts", "/index.tsx"]) {
    const c = base + ext;
    if (existsSync(c) && statSync(c).isFile()) return relative(ROOT, c);
  }
  return null;
}

/** Each file's local imports, read once for the whole run (a gate graph reaches thousands). */
const EDGES = new Map<string, string[]>();
function importsOf(file: string): string[] {
  let hit = EDGES.get(file);
  if (!hit) {
    const src = readFileSync(join(ROOT, file), "utf8");
    hit = [];
    for (const m of src.matchAll(IMPORT_RE)) {
      const r = resolveImport(file, m[1]!);
      if (r) hit.push(r);
    }
    EDGES.set(file, hit);
  }
  return hit;
}

function reach(entry: string, seen: Set<string>): void {
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f) || !existsSync(join(ROOT, f))) continue;
    seen.add(f);
    if (PRIMITIVES.has(f) || f.endsWith(".sh")) continue;
    stack.push(...importsOf(f));
  }
}

function listGates(): Array<{ label: string; cmd: string }> {
  const out = new Map<string, { label: string; cmd: string }>();
  for (const lane of [["--list"], ["--strict", "--list"]]) {
    const text = execFileSync("bash", [join(ROOT, "scripts/run-release-gates.sh"), ...lane], {
      cwd: ROOT,
      encoding: "utf8",
    });
    for (const line of text.split("\n")) {
      const i = line.indexOf("|");
      if (i < 0) continue;
      const cmd = line.slice(i + 1).trim();
      if (!out.has(cmd)) out.set(cmd, { label: line.slice(0, i), cmd });
    }
  }
  return [...out.values()];
}

export function census(gates: Array<{ label: string; cmd: string }>, read: (f: string) => string): {
  findings: Finding[];
  dbGates: Array<{ gate: string; files: string[] }>;
  usedExemptions: Set<string>;
} {
  const findings: Finding[] = [];
  const dbGates: Array<{ gate: string; files: string[] }> = [];
  const usedExemptions = new Set<string>();
  const cache = new Map<string, string>();
  const readOnce = (f: string): string => {
    let v = cache.get(f);
    if (v === undefined) cache.set(f, (v = read(f)));
    return v;
  };
  for (const g of gates) {
    const seen = new Set<string>();
    for (const e of entryFiles(g.cmd)) reach(e, seen);
    const governed: string[] = [];
    for (const f of seen) {
      const src = readOnce(f);
      if (PRIMITIVES.has(f)) continue;
      if (f.endsWith(".sh")) {
        const what = rawShellSession(src);
        if (what) findings.push({ gate: g.cmd, file: f, what });
        else if (/gate-db-limits\.ts/.test(src)) governed.push(f);
        continue;
      }
      if (/from\s+["']\.\/lib\/gate-db["']|import\(\s*["']\.\/lib\/gate-db["']\s*\)/.test(src)) governed.push(f);
      const raw = rawSessionsIn(src);
      if (raw.length === 0) continue;
      if (EXEMPT[f]) {
        usedExemptions.add(f);
        continue;
      }
      for (const what of raw) findings.push({ gate: g.cmd, file: f, what });
    }
    if (governed.length) dbGates.push({ gate: g.cmd, files: governed });
  }
  return { findings, dbGates, usedExemptions };
}

function selfTest(): number {
  let bad = 0;
  const expect = (ok: boolean, what: string) => {
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${what}`);
    if (!ok) bad++;
  };
  expect(
    rawSessionsIn('import pg from "pg";\nconst c = new pg.Client({});').length === 1,
    "RED   — a gate constructing new pg.Client({...}) is named",
  );
  expect(
    rawSessionsIn('import { Pool } from "pg";\nconst p = new Pool();').length === 1,
    "RED   — a gate constructing a bare pg Pool is named",
  );
  expect(
    rawSessionsIn('import { connectDirect } from "./lib/direct-db";\nawait connectDirect(env, "x");').length === 1,
    "RED   — a gate calling connectDirect() is named",
  );
  expect(
    rawShellSession('eval "$(grep SUPABASE_MATRIX_ .env)"\n"$PSQL" -X -f census.sql\n') !== null,
    "RED   — a shell gate running psql on the live variables without the limits is named",
  );
  expect(
    rawSessionsIn('import { openGateDb } from "./lib/gate-db";\nconst db = await openGateDb(env, { gate: "x" });').length === 0,
    "GREEN — a gate that opens its session through openGateDb is not named",
  );
  expect(
    rawSessionsIn('// new pg.Client() used to live here\nimport pg from "pg";\nlet c: pg.Client;').length === 0,
    "GREEN — a comment and a type annotation are not sessions",
  );
  expect(
    rawShellSession('LIMITS="$(pnpm exec tsx scripts/gate-db-limits.ts g)"\nexport X=$SUPABASE_MATRIX_HOST\n"$PSQL" -1 -c "$LIMITS" -f f.sql\n') === null,
    "GREEN — a shell gate that takes the limits is not named",
  );
  // And against the real tree: remove the helper from one real gate in memory, and it is named.
  const gates = listGates();
  const target = "scripts/check-door-rows.ts";
  const { findings } = census(gates, (f) => {
    const src = readFileSync(join(ROOT, f), "utf8");
    return f === target ? `${src}\nconst leak = new pg.Client({});\n` : src;
  });
  expect(
    findings.some((x) => x.file === target),
    "RED   — check-door-rows.ts with a raw pg.Client put back is named against the real gate list",
  );
  console.log(bad === 0 ? "the guard fails when it should and passes when it should" : "[FAIL] the guard is not trustworthy");
  return bad === 0 ? 0 : 1;
}

function main(): number {
  if (SELF_TEST) return selfTest();
  console.log("GATE DATABASE SESSIONS — every release gate opens its database through scripts/lib/gate-db.ts");
  const gates = listGates();
  // Only files that differ from the ref are read through git; the rest are the same bytes.
  const changed = REF
    ? new Set(
        execFileSync("git", ["diff", "--name-only", REF, "--", "."], { cwd: ROOT, encoding: "utf8" })
          .split("\n")
          .filter(Boolean),
      )
    : new Set<string>();
  const read = (f: string): string => {
    if (!REF || !changed.has(f)) return existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8") : "";
    try {
      return execFileSync("git", ["show", `${REF}:${f}`], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 << 20,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return "";
    }
  };
  if (REF) console.log(`[INFO] reading gate files as of ${REF}`);
  const { findings, dbGates, usedExemptions } = census(gates, read);
  console.log(`[INFO] ${gates.length} gates read; ${dbGates.length} open a governed database session:`);
  for (const g of dbGates) console.log(`         ${g.gate}`);
  for (const f of Object.keys(EXEMPT)) {
    if (!usedExemptions.has(f) && existsSync(join(ROOT, f)) && rawSessionsIn(readFileSync(join(ROOT, f), "utf8")).length === 0) {
      findings.push({ gate: "(exemption list)", file: f, what: "stale exemption: this file no longer opens a session" });
    }
  }
  if (findings.length === 0) {
    console.log("[ OK ] no release gate opens a database session outside the gate helper.");
    return 0;
  }
  console.log(`[WARN] ${findings.length} raw database session(s) in release gates — outside scripts/lib/gate-db.ts:`);
  for (const f of findings) console.log(`         ${f.file}: ${f.what}  (gate: ${f.gate})`);
  console.log(
    "       Remedy: open the session with openGateDb()/withGateDb() from scripts/lib/gate-db.ts " +
      "(a shell gate: psql -1 -c \"$(pnpm exec tsx scripts/gate-db-limits.ts <gate>)\").",
  );
  return STRICT ? 1 : 0;
}

exitAfterDrain(main());

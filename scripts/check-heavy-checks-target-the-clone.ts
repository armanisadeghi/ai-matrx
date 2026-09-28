#!/usr/bin/env npx tsx
/**
 * HEAVY CHECKS RUN ON THE CLONE — A SCRIPT NEVER OPENS LIVE LONG OR UNGUARDED.
 *
 * WHY (2026-09-27, common-docs/projects/database-workload-safety/incidents/2026-09-27-per-connection-memory.md).
 * The live database kept running out of memory; every warm connection costs it ~66 MB, and our own
 * verification scripts held connections for minutes: `check:store-doors-decide` ran a 4-10 minute
 * census on live many times a day, a dozen other checks raised their own statement clocks to
 * 60 s - 20 min, and a dozen more opened live through a bare `new pg.Client` that no limit governs.
 * The work itself is fine; WHERE it ran was not. Heavy checks now take the nightly clone by default
 * (`scripts/lib/check-target.ts`), and this guard keeps the class closed.
 *
 * WHAT IT FAILS ON, for every script under `scripts/` (TypeScript/JavaScript and shell; the openers
 * in `scripts/lib/`, tests and fixtures are not scripts):
 *
 *   R1  UNGUARDED LIVE CLIENT - the file can reach the LIVE credentials (`SUPABASE_MATRIX_*`,
 *       `loadDbEnv`, `loadDbEnvFrom`) and builds its own `new pg.Client` / `new Pool` without
 *       `guardIfProduction(...)`. A raw client on live carries no statement, idle or transaction
 *       limit at all. Use `connectCheckDirect` / `openCheckDb` (`check-target.ts`), `connectDirect`,
 *       `openGateDb`, or wrap the client in `guardIfProduction` (`production-guard.ts`).
 *
 *   R2  A LONG CLOCK ON LIVE - the file can reach live (credentials, `connectDirect`, `openGateDb`,
 *       `withGateDb`, or - in shell - a production target) and asks for a statement timeout above
 *       30 s (`set [local] statement_timeout`, `set_config('statement_timeout', …)`,
 *       `statementTimeoutMs`, a pg config `statement_timeout`, `PGOPTIONS`), WITHOUT routing its target
 *       through `check-target.ts` (`openCheckDb` / `connectCheckDirect`), which is what caps the clock
 *       at the live ceiling when the run is on production and lets it run long on the clone. A shell
 *       script that asserts the clone (`night_clone_dsn`, `night_assert_target clone`) is on the clone.
 *
 * A file that genuinely must stay as it is carries an entry in
 * `scripts/heavy-checks-target-the-clone-allowlist.json` WITH its reason. The allowlist only shrinks:
 * an entry that no longer matches a finding fails the run too (a stale excuse is a lie on file).
 *
 *   pnpm check:heavy-checks-target-the-clone             # the tree as it is
 *   pnpm check:heavy-checks-target-the-clone --at <rev>  # the tree at a git revision (proves RED on history)
 *   pnpm check:heavy-checks-target-the-clone:self-test   # the rules against planted fixtures, both ways
 *
 * Static, offline, no credentials. Exit 0 clean, 1 a finding or a stale allowlist entry.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(process.env.MATRX_FRONTEND_ROOT ?? process.cwd());
const ALLOWLIST = "scripts/heavy-checks-target-the-clone-allowlist.json";
export const LIVE_CEILING_MS = 30_000;

export interface Finding {
  readonly path: string;
  readonly rule: "R1" | "R2";
  readonly detail: string;
}

const CODE_EXT = /\.(ts|mts|cts|js|mjs|cjs)$/;
const SHELL_EXT = /\.(sh|zsh|bash)$/;

/** Not scripts: the openers themselves, tests, fixtures, generated dirs, and this guard. */
export function inScope(path: string): boolean {
  if (!path.startsWith("scripts/")) return false;
  if (!CODE_EXT.test(path) && !SHELL_EXT.test(path)) return false;
  if (/^scripts\/lib\//.test(path)) return false;
  if (/(^|\/)(__tests__|node_modules|fixtures|judgment-corpus)\//.test(path)) return false;
  if (/\.(test|spec|selftest)\.[a-z]+$/.test(path)) return false;
  if (path === "scripts/check-heavy-checks-target-the-clone.ts") return false;
  return true;
}

function stripComments(text: string, shell: boolean): string {
  if (shell) return text.replace(/(^|\s)#[^\n]*/g, "$1");
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

function toMs(n: string, unit: string | undefined, bareIsMs = true): number {
  const v = Number(n.replace(/_/g, ""));
  switch ((unit ?? (bareIsMs ? "ms" : "s")).toLowerCase()) {
    case "s":
      return v * 1_000;
    case "min":
      return v * 60_000;
    case "h":
      return v * 3_600_000;
    default:
      return v;
  }
}

/** Every literal statement timeout the text asks for, in ms (with the matched text). */
export function timeoutsIn(text: string): Array<{ ms: number; at: string }> {
  const out: Array<{ ms: number; at: string }> = [];
  const push = (ms: number, at: string) => {
    if (Number.isFinite(ms)) out.push({ ms, at: at.replace(/\s+/g, " ").trim().slice(0, 80) });
  };
  const consts = new Map<string, string>();
  for (const m of text.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*([\d_]+)\s*;/g)) consts.set(m[1]!, m[2]!);
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => number]> = [
    [/statement_timeout\s*(?:=|\bto\b)\s*'?\s*(\d[\d_.]*)\s*(ms|s|min|h)?\s*'?/gi, (m) => toMs(m[1]!, m[2])],
    [/set_config\s*\(\s*'statement_timeout'\s*,\s*'(\d[\d.]*)\s*(ms|s|min|h)?'/gi, (m) => toMs(m[1]!, m[2])],
    [/statementTimeoutMs\s*:\s*(\d[\d_]*)/g, (m) => toMs(m[1]!, "ms")],
    [/statement_timeout\s*:\s*(\d[\d_]*)/g, (m) => toMs(m[1]!, "ms")],
    [/statement_timeout=(\d+)/g, (m) => toMs(m[1]!, "ms")],
  ];
  for (const [re, ms] of patterns) for (const m of text.matchAll(re)) push(ms(m), m[0]);
  for (const m of text.matchAll(/statementTimeoutMs\s*:\s*([A-Z][A-Z0-9_]*)\b/g)) {
    const v = consts.get(m[1]!);
    if (v) push(toMs(v, "ms"), `${m[0]} (= ${v})`);
  }
  return out;
}

/** The rules, over one file's text. Exported for the self-test. */
export function judge(path: string, raw: string): Finding[] {
  const shell = SHELL_EXT.test(path);
  const text = stripComments(raw, shell);
  const findings: Finding[] = [];
  const credentials = /SUPABASE_MATRIX_|\bloadDbEnv(From)?\s*\(/.test(text);
  if (shell) {
    const cloneOnly =
      /night_clone_dsn|night_assert_target\s+clone|night_target_dsn\s+clone/.test(text) &&
      !/night_target_dsn\s+production|night_assert_target\s+production/.test(text);
    // A shell script names its database by what it reads: the live credentials, a production
    // target, or - when it names neither the clone nor the (retired) rehearsal branch - whatever
    // PG* environment it inherits, which on this machine is live.
    const branchOnly = /SUPABASE_BRANCH_DATABASE_URL|night_branch_dsn|night_target_dsn\s+branch/.test(text);
    const liveReach =
      credentials ||
      /night_target_dsn\s+production|night_assert_target\s+production/.test(text) ||
      (!cloneOnly && !branchOnly);
    const long = timeoutsIn(text).filter((t) => t.ms > LIVE_CEILING_MS);
    if (liveReach && !cloneOnly && long.length > 0) {
      findings.push({
        path,
        rule: "R2",
        detail: `asks for ${long.map((t) => `${t.ms / 1000}s (${t.at})`).join("; ")} and does not assert the clone`,
      });
    }
    return findings;
  }
  const liveReach = credentials || /\b(connectDirect|openGateDb|withGateDb)\s*\(/.test(text);
  const routed = /\b(openCheckDb|connectCheckDirect)\s*\(/.test(text);
  if (credentials && /\bnew\s+(pg\.)?(Client|Pool)\s*\(/.test(text) && !/\bguardIfProduction\s*\(/.test(text)) {
    findings.push({
      path,
      rule: "R1",
      detail: "reaches the live credentials and builds a raw pg client with no guardIfProduction()",
    });
  }
  if (liveReach && !routed) {
    const long = timeoutsIn(text).filter((t) => t.ms > LIVE_CEILING_MS);
    if (long.length > 0) {
      findings.push({
        path,
        rule: "R2",
        detail:
          `asks for ${long.map((t) => `${t.ms / 1000}s (${t.at})`).join("; ")} on a connection that can be live, ` +
          "and does not take its target through scripts/lib/check-target.ts",
      });
    }
  }
  return findings;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full));
  }
}

function filesAt(rev: string | null): Array<{ path: string; text: string }> {
  if (rev) {
    const list = execFileSync("git", ["ls-tree", "-r", "--name-only", rev, "scripts/"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter((p) => p && inScope(p));
    return list.map((path) => ({
      path,
      text: execFileSync("git", ["show", `${rev}:${path}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }),
    }));
  }
  const all: string[] = [];
  walk(join(ROOT, "scripts"), all);
  return all.filter(inScope).map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }));
}

type Allow = Record<string, { rules: Array<"R1" | "R2">; reason: string }>;

function loadAllow(): Allow {
  const p = join(ROOT, ALLOWLIST);
  if (!existsSync(p)) return {};
  const parsed = JSON.parse(readFileSync(p, "utf8")) as { entries?: Allow };
  return parsed.entries ?? {};
}

/** Apply the allowlist: returns what still fails and which entries are stale. Exported for the self-test. */
export function applyAllow(findings: Finding[], allow: Allow): { failing: Finding[]; stale: string[]; excused: Finding[] } {
  const failing: Finding[] = [];
  const excused: Finding[] = [];
  const used = new Set<string>();
  for (const f of findings) {
    const e = allow[f.path];
    if (e && e.rules.includes(f.rule) && e.reason.trim()) {
      excused.push(f);
      used.add(`${f.path}#${f.rule}`);
    } else failing.push(f);
  }
  const stale: string[] = [];
  for (const [path, e] of Object.entries(allow)) {
    for (const r of e.rules) if (!used.has(`${path}#${r}`)) stale.push(`${path} (${r})`);
  }
  return { failing, stale, excused };
}

function selfTest(): number {
  const cases: Array<[string, string, string, Array<"R1" | "R2">]> = [
    [
      "a raw client on the live credentials is R1",
      "scripts/x.ts",
      `const e = loadDbEnv(); const c = new pg.Client({ ...e });`,
      ["R1"],
    ],
    [
      "the same client wrapped in guardIfProduction is clean",
      "scripts/x.ts",
      `const e = loadDbEnv(); const c = guardIfProduction(new pg.Client({ ...e }), "x");`,
      [],
    ],
    [
      "a raw client on the clone only is clean",
      "scripts/x.ts",
      `const e = loadCloneDbEnv(ROOT, ref); const c = new pg.Client({ ...e });`,
      [],
    ],
    [
      "connectDirect + set local 120s is R2 (the 2026-09-26 shape)",
      "scripts/x.ts",
      `const c = await connectDirect(loadDbEnv(), "x"); await c.query("set local statement_timeout = '120s'");`,
      ["R2"],
    ],
    [
      "openGateDb with a 540 s ceiling is R2 (check:store-doors-decide before 2026-09-27)",
      "scripts/x.ts",
      `const CENSUS_BUDGET_MS = 540_000;\nopenGateDb(loadDbEnv(), { gate: "g", statementTimeoutMs: CENSUS_BUDGET_MS });`,
      ["R2"],
    ],
    [
      "the same ceiling through openCheckDb is clean (capped on live at run time)",
      "scripts/x.ts",
      `const CENSUS_BUDGET_MS = 540_000;\nopenCheckDb({ gate: "g", defaultTarget: "clone", statementTimeoutMs: CENSUS_BUDGET_MS });`,
      [],
    ],
    [
      "a 30 s clock on live is clean",
      "scripts/x.ts",
      `const c = await connectDirect(loadDbEnv(), "x"); await c.query("set local statement_timeout = '30s'");`,
      [],
    ],
    [
      "a raw pg config statement_timeout of 60 s on the live credentials is R1 and R2",
      "scripts/x.ts",
      `const e = loadDbEnv(); new pg.Client({ ...e, statement_timeout: 60_000 });`,
      ["R1", "R2"],
    ],
    [
      "a timeout in a comment is not a finding",
      "scripts/x.ts",
      `// set local statement_timeout = '900s' used to live here\nconst c = await connectDirect(loadDbEnv(), "x");`,
      [],
    ],
    [
      "a shell gate asking 600 s of the clone is clean",
      "scripts/x.sh",
      `DSN="$(night_clone_dsn)"\nnight_assert_target clone "$DSN"\nexport PGOPTIONS='-c statement_timeout=600000'`,
      [],
    ],
    [
      "a shell script on the (retired) rehearsal branch is not live",
      "scripts/x.sh",
      `DSN="$(grep '^SUPABASE_BRANCH_DATABASE_URL=' .env.local)"\npsql "$DSN" -c "set statement_timeout = '900s'"`,
      [],
    ],
    [
      "a shell script asking 600 s with no clone assertion is R2",
      "scripts/x.sh",
      `export PGOPTIONS='-c statement_timeout=600000'\npsql "$SUPABASE_MATRIX_HOST"`,
      ["R2"],
    ],
  ];
  let bad = 0;
  for (const [name, path, text, want] of cases) {
    const got = judge(path, text).map((f) => f.rule).sort();
    const ok = JSON.stringify(got) === JSON.stringify([...want].sort());
    if (!ok) bad++;
    console.log(`${ok ? "[ OK ]" : "[FAIL]"} ${name} - got [${got.join(",")}], want [${want.join(",")}]`);
  }
  // The allowlist half: an excuse that no longer excuses anything is itself a failure.
  const staleProbe = applyAllow([], { "scripts/gone.ts": { rules: ["R1"], reason: "was heavy once" } });
  const staleOk = staleProbe.stale.length === 1;
  if (!staleOk) bad++;
  console.log(`${staleOk ? "[ OK ]" : "[FAIL]"} a stale allowlist entry is named - got ${staleProbe.stale.length}`);
  const reasonless = applyAllow(
    [{ path: "scripts/x.ts", rule: "R1", detail: "" }],
    { "scripts/x.ts": { rules: ["R1"], reason: " " } },
  );
  const reasonOk = reasonless.failing.length === 1;
  if (!reasonOk) bad++;
  console.log(`${reasonOk ? "[ OK ]" : "[FAIL]"} an allowlist entry with no reason excuses nothing`);
  console.log(bad === 0 ? "\nself-test: every rule goes red on its fixture and green on its fix." : `\nself-test FAILED: ${bad} case(s).`);
  return bad === 0 ? 0 : 1;
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return selfTest();
  const atIdx = argv.indexOf("--at");
  const rev = atIdx >= 0 ? (argv[atIdx + 1] ?? null) : null;
  const files = filesAt(rev);
  const findings = files.flatMap((f) => judge(f.path, f.text));
  // The allowlist describes the CURRENT tree; a historical run reports every finding raw.
  const { failing, stale, excused } = rev ? { failing: findings, stale: [], excused: [] } : applyAllow(findings, loadAllow());
  console.log(
    `check:heavy-checks-target-the-clone - ${files.length} script(s) under scripts/${rev ? ` at ${rev}` : ""}; ` +
      `${failing.length} finding(s), ${excused.length} allowlisted, ${stale.length} stale allowlist entr(ies).`,
  );
  for (const f of failing) console.log(`[FAIL] ${f.rule} ${f.path} - ${f.detail}`);
  for (const s of stale) console.log(`[FAIL] stale allowlist entry ${s} - it no longer matches a finding; delete it (${ALLOWLIST}).`);
  if (failing.length || stale.length) {
    console.log(
      "\n  Heavy checks run on the nightly clone: take the target through scripts/lib/check-target.ts " +
        "(openCheckDb / connectCheckDirect, default `clone`, `--target production` bounded at 30 s). A raw " +
        "client on live is wrapped in guardIfProduction (scripts/lib/production-guard.ts).",
    );
    return 1;
  }
  console.log("[ OK ] no script opens live with a clock above 30 s or through an unguarded client.");
  return 0;
}

process.exitCode = main();

/**
 * `pnpm check:migration-judgment` — THE TWO RUNNERS JUDGE THE SAME BYTES THE SAME WAY.
 *
 * WHY THIS EXISTS
 * ---------------
 * 🚨 This campaign has TWO sanctioned migration runners — `pnpm db:apply` here and
 * `uv run python db/apply_migrations.py` in aidream — and on 2026-09-16 ATTACK-7 proved
 * they did not enforce the same rules:
 *
 *   · `-- chair-step:` was an owner-awake step in the TypeScript runner and a `print`
 *     statement in the Python one, which is the runner BOTH release trains execute;
 *   · a header that NAMED production was judged by an allow-list here and waived by one
 *     comment line, so `migrations/inverse/custom_entity_types_detail_variant_down.sql`
 *     — §8.9 step 3a's only production undo — was ACCEPTED by one command and REFUSED by
 *     the other;
 *   · `--source campaign` demanded an explicit `--target` there and silently defaulted to
 *     PRODUCTION here.
 *
 * Every "both runners" sentence in the build book was therefore a coin flip decided by
 * which command a tired lane typed at 3 a.m. Reading both implementations is how that was
 * found, and reading is not a check. So both runners expose the same read-only
 * `--judge-only` mode over ONE corpus of fixture migrations, every fixture carries the
 * verdict it must receive at each target, and this script FAILS when the two runners
 * disagree with each other OR with the fixture's own `-- expect:` line.
 *
 * The normative description of every rule the verdicts come from is
 * `migrations/JUDGMENT.md`. This script is that document's forcing function: a rule that
 * changes in one runner and not the other turns this red.
 *
 * WHAT IT RUNS
 * ------------
 *   1. THE CORPUS — `migrations/judgment-corpus/*.sql`, every file × both targets, through
 *      both runners' `--judge-only`. No connection is opened by either: the judgement is a
 *      pure function of the bytes and the target.
 *   2. THE FLAG CASES — the rules that are about the COMMAND rather than the file, which a
 *      corpus of files cannot express. Each is an actual invocation of both runners that
 *      must refuse BEFORE any connection exists (they are the reason `--source campaign`
 *      is safe to exercise here).
 *
 * It needs BOTH checkouts. Without the sibling repo it FAILS as UNMEASURED — never a
 * warning that reads like a pass, because "the judges agree" is exactly the claim nobody
 * may make without measuring it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = resolve(ROOT, "migrations", "judgment-corpus");
const TARGETS = ["branch", "production"] as const;
type Target = (typeof TARGETS)[number];

const C = process.stdout.isTTY
  ? { dim: "[2m", red: "[31m", green: "[32m", yellow: "[33m", bold: "[1m", reset: "[0m" }
  : { dim: "", red: "", green: "", yellow: "", bold: "", reset: "" };
const OK = `${C.green}[ OK ]${C.reset} `;
const FAIL = `${C.red}[FAIL]${C.reset} `;

/** The sibling aidream checkout, by env override or by name. A miss is UNMEASURED. */
function aidreamDir(): string {
  const env = process.env.AIDREAM_DIR;
  if (env) return resolve(env);
  return resolve(ROOT, "..", "aidream");
}

interface Verdict {
  runner: string;
  file: string;
  target: Target;
  verdict: "accept" | "refuse";
  code: string;
  guard?: string | null;
  chair_step?: boolean;
  excused?: number;
  revoke_exemption?: string | null;
  detail?: string;
}

/** The part of a verdict the two runners must agree on, as one comparable string. */
function shape(v: Verdict): string {
  if (v.verdict === "refuse") return `refuse:${v.code}`;
  return (
    `accept guard=${v.guard ?? "-"} chair_step=${v.chair_step ? "yes" : "no"} ` +
    `excused=${v.excused ?? 0} revoke=${v.revoke_exemption ?? "-"}`
  );
}

/** What the fixture's own `-- expect:` line says, per target. */
function expectationOf(file: string): Record<Target, string> {
  const first = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => /^\s*--\s*expect\s*:/i.test(l));
  if (!first)
    throw new Error(
      `${basename(file)} carries no \`-- expect:\` line. Every corpus fixture states the verdict ` +
        `both runners must return for it, at each target — a fixture with no expectation is a ` +
        `fixture nobody reviewed.\n` +
        `  Form: -- expect: branch=accept production=refuse:<code>`,
    );
  const out: Partial<Record<Target, string>> = {};
  for (const part of first.replace(/^\s*--\s*expect\s*:/i, "").trim().split(/\s+/)) {
    const [t, v] = part.split("=");
    if (!TARGETS.includes(t as Target) || !v)
      throw new Error(
        `${basename(file)}: \`${part}\` is not an expectation. Form: ` +
          `-- expect: branch=accept production=refuse:<code>`,
      );
    out[t as Target] = v;
  }
  for (const t of TARGETS)
    if (!out[t])
      throw new Error(`${basename(file)}: the \`-- expect:\` line says nothing about --target ${t}.`);
  return out as Record<Target, string>;
}

/** An expectation (`accept`, `refuse:<code>`) against a runner's full verdict shape. */
function satisfies(expected: string, v: Verdict): boolean {
  if (expected === "accept") return v.verdict === "accept";
  if (expected.startsWith("refuse:")) return v.verdict === "refuse" && v.code === expected.slice(7);
  return false;
}

function judgeOnly(cmd: string, args: string[], cwd: string, label: string): Verdict[] {
  let out: string;
  try {
    out = execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `${label}'s --judge-only did not run: ${e.message ?? String(err)}\n${e.stderr ?? ""}`,
    );
  }
  const rows: Verdict[] = [];
  for (const line of out.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    rows.push(JSON.parse(t) as Verdict);
  }
  return rows;
}

/** The rules that are about the COMMAND, not the file. Both must refuse, before connecting. */
interface FlagCase {
  readonly what: string;
  readonly fe: readonly string[];
  readonly py: readonly string[];
  /** Every one of these must appear in the refusal, in both runners. */
  readonly names: readonly string[];
}

const FLAG_CASES: readonly FlagCase[] = [
  {
    what: "`--source campaign` with NO `--target` is refused (ATTACK-7 finding 4)",
    fe: ["migrations/campaign/custom_campaign_build_lock.sql", "--source", "campaign", "--lane", "W1-STORE", "--dry-run"],
    py: ["--source", "campaign", "--only", "custom_campaign_build_lock.sql", "--lane", "W1-STORE", "--no-generate", "--dry-run"],
    names: ["--target"],
  },
  {
    what: "a campaign file with no `--lane` is refused",
    fe: ["migrations/campaign/custom_campaign_build_lock.sql", "--source", "campaign", "--target", "branch", "--dry-run"],
    py: ["--source", "campaign", "--only", "custom_campaign_build_lock.sql", "--target", "branch", "--no-generate", "--dry-run"],
    names: ["--lane"],
  },
];

function runExpectingRefusal(
  cmd: string,
  args: readonly string[],
  cwd: string,
): { code: number; out: string } {
  try {
    const out = execFileSync(cmd, args as string[], {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

function main(): number {
  const aidream = aidreamDir();
  if (!existsSync(resolve(aidream, "db", "apply_migrations.py"))) {
    console.error(
      `${FAIL}UNMEASURED — the aidream checkout is not at ${aidream}, so the two runners' ` +
        `judgement CANNOT be compared.\n` +
        `  This is a failure, not a warning: "both runners agree" is the claim this check ` +
        `exists to prove, and an unrun check has proven nothing.\n` +
        `  Remedy: check out aidream beside this repo, or set AIDREAM_DIR=<path>.`,
    );
    return 1;
  }
  if (!existsSync(CORPUS_DIR)) {
    console.error(`${FAIL}the conformance corpus is missing at ${CORPUS_DIR}.`);
    return 1;
  }
  const files = readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.error(`${FAIL}the conformance corpus at ${CORPUS_DIR} is EMPTY.`);
    return 1;
  }

  console.log(
    `${C.bold}migration judgment${C.reset} ${C.dim}— ${files.length} fixtures × ${TARGETS.length} ` +
      `targets through both runners, plus ${FLAG_CASES.length} flag cases${C.reset}`,
  );
  console.log(`${C.dim}       corpus  ${CORPUS_DIR}${C.reset}`);
  console.log(`${C.dim}       aidream ${aidream}${C.reset}`);

  const fe = judgeOnly("npx", ["tsx", "scripts/apply-migration.ts", "--judge-only", CORPUS_DIR], ROOT, "matrx-frontend");
  const py = judgeOnly("uv", ["run", "python", "db/apply_migrations.py", "--judge-only", CORPUS_DIR], aidream, "aidream");

  const index = (rows: Verdict[]) => {
    const m = new Map<string, Verdict>();
    for (const r of rows) m.set(`${r.file} ${r.target}`, r);
    return m;
  };
  const feMap = index(fe);
  const pyMap = index(py);

  let failures = 0;
  let agreements = 0;
  for (const name of files) {
    let expect: Record<Target, string>;
    try {
      expect = expectationOf(resolve(CORPUS_DIR, name));
    } catch (err) {
      console.error(`${FAIL}${(err as Error).message}`);
      failures += 1;
      continue;
    }
    for (const target of TARGETS) {
      const key = `${name} ${target}`;
      const a = feMap.get(key);
      const b = pyMap.get(key);
      if (!a || !b) {
        console.error(
          `${FAIL}${name} @ ${target}: ${!a ? "matrx-frontend" : "aidream"} returned no verdict at all.`,
        );
        failures += 1;
        continue;
      }
      const sa = shape(a);
      const sb = shape(b);
      if (sa !== sb) {
        console.error(
          `${FAIL}${name} @ ${target}: THE TWO RUNNERS DISAGREE.\n` +
            `         matrx-frontend: ${sa}${a.detail ? `\n           ${C.dim}${a.detail}${C.reset}` : ""}\n` +
            `         aidream:        ${sb}${b.detail ? `\n           ${C.dim}${b.detail}${C.reset}` : ""}\n` +
            `         One judgement, or the campaign has two. migrations/JUDGMENT.md says which it is.`,
        );
        failures += 1;
        continue;
      }
      if (!satisfies(expect[target], a)) {
        console.error(
          `${FAIL}${name} @ ${target}: both runners say ${sa}, and the fixture expects ` +
            `${expect[target]}.\n` +
            `         Either the rule moved (update migrations/JUDGMENT.md and this fixture in the ` +
            `same commit) or the runners are wrong.${a.detail ? `\n           ${C.dim}${a.detail}${C.reset}` : ""}`,
        );
        failures += 1;
        continue;
      }
      agreements += 1;
    }
  }

  for (const c of FLAG_CASES) {
    const a = runExpectingRefusal("npx", ["tsx", "scripts/apply-migration.ts", ...c.fe], ROOT);
    const b = runExpectingRefusal("uv", ["run", "python", "db/apply_migrations.py", ...c.py], aidream);
    const bad: string[] = [];
    if (a.code === 0) bad.push(`matrx-frontend exited 0`);
    if (b.code === 0) bad.push(`aidream exited 0`);
    for (const token of c.names) {
      if (a.code !== 0 && !a.out.includes(token)) bad.push(`matrx-frontend's refusal never names ${token}`);
      if (b.code !== 0 && !b.out.includes(token)) bad.push(`aidream's refusal never names ${token}`);
    }
    if (bad.length) {
      console.error(`${FAIL}flag case — ${c.what}\n         ${bad.join("\n         ")}`);
      failures += 1;
    } else {
      agreements += 1;
      console.log(`${OK}${C.dim}flag case — ${c.what}${C.reset}`);
    }
  }

  if (failures) {
    console.error(
      `\n${FAIL}${C.bold}migration judgment FAILED${C.reset} — ${failures} disagreement(s) over ` +
        `${files.length} fixtures. The campaign has ONE judgement or it has none; fix the runner or ` +
        `the rule, never the expectation alone.`,
    );
    return 1;
  }
  console.log(
    `${OK}${C.bold}both runners agree, exactly${C.reset} — ${agreements} verdicts (${files.length} ` +
      `fixtures × ${TARGETS.length} targets + ${FLAG_CASES.length} flag cases), every one of them ` +
      `what migrations/JUDGMENT.md says it must be`,
  );
  return 0;
}

process.exit(main());

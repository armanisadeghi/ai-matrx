#!/usr/bin/env tsx
/**
 * pnpm check:lint-debt — the ESLint debt inventory.
 *
 * The repo carries a large repo-wide ESLint backlog. Left as a single number
 * it was actively misleading: a feature branch's lint gate "failing" said
 * nothing about that branch, and the headline count mixed genuine rendering
 * bugs in with React Compiler style notes. This makes the backlog VISIBLE and
 * CLASSIFIED so it can be worked down by what matters first.
 *
 * LOUD, NEVER BLOCKING. Prints a ranked report and exits 0 (Arman's standing
 * rule: no check may block a build or a commit). `--strict` is for a human or
 * a CI job that explicitly wants a hard fail on a scoped path.
 *
 * Admin scoreboard: /administration/reporting/lint-debt
 * Contract + how to classify a rule: scripts/lint-debt/FEATURE.md
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scanRepo } from "./scan";
import {
  CLASS_TITLES,
  LINT_DEBT_CLASSES,
  RULE_CLASS,
  classOf,
  isReal,
  type LintDebtBucket,
  type LintDebtClass,
  type LintDebtFinding,
  type LintDebtHistoryPoint,
  type LintDebtReport,
  type LintDebtRuleBucket,
} from "./types";

function repoRoot(): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.cwd();
  }
}

const ROOT = repoRoot();
const REPORT_PATH = join(ROOT, "scripts/lint-debt/report.json");
const HISTORY_PATH = join(ROOT, "scripts/lint-debt/history.json");
const HISTORY_MAX_POINTS = 120;

const USAGE = `
pnpm check:lint-debt — the ESLint debt inventory.

  pnpm check:lint-debt                  scan + ranked report
  pnpm check:lint-debt:write            also refresh report.json + history.json
  pnpm check:lint-debt --json           machine-readable report on stdout
  pnpm check:lint-debt --class=<c>      one class (bug, correctness, doctrine, style)
  pnpm check:lint-debt --rule=<id>      one ESLint rule id
  pnpm check:lint-debt --path=<prefix>  only files under a repo-relative prefix.
                                        Quote route groups: --path='app/(admin)'
  pnpm check:lint-debt --limit=<n>      findings to print (default 40; 0 = all)
  pnpm check:lint-debt --strict         exit 1 when findings exist

Always exits 0 unless --strict, a bad filter (exit 2), or a crash.
Contract:   scripts/lint-debt/FEATURE.md
Scoreboard: /administration/reporting/lint-debt
`.trim();

const RED = "\u001b[0;31m";
const YELLOW = "\u001b[1;33m";
const GREEN = "\u001b[0;32m";
const CYAN = "\u001b[0;36m";
const DIM = "\u001b[2m";
const BOLD = "\u001b[1m";
const NC = "\u001b[0m";

interface Args {
  write: boolean;
  json: boolean;
  strict: boolean;
  klass: LintDebtClass | null;
  rule: string | null;
  pathPrefix: string | null;
  limit: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(USAGE);
    process.exit(0);
  }
  const valueOf = (flag: string): string | null => {
    const hit = argv.find((a) => a.startsWith(`${flag}=`));
    return hit ? hit.slice(flag.length + 1) : null;
  };
  /**
   * A filter flag with no value is a MALFORMED scope, never "no filter" —
   * the same trap `scripts/dead-ends` had to close. An empty prefix passes
   * every truthiness gate downstream, so the run scans the whole repo (and
   * can overwrite the baseline) while the operator believes it was scoped.
   */
  const scopeOf = (flag: string): string | null => {
    const raw = valueOf(flag);
    if (raw === null) return null;
    const clean = raw.trim().replace(/^\/+|\/+$/g, "");
    if (!clean) {
      console.error(
        `${RED}[lint-debt] ${flag}= was passed with no value.${NC} ` +
          `An empty filter is not "scan everything" — it is a typo. ` +
          `Drop the flag for a full run, or give it a value.`,
      );
      process.exit(2);
    }
    return clean;
  };
  const klassRaw = scopeOf("--class");
  if (klassRaw !== null && !LINT_DEBT_CLASSES.includes(klassRaw as LintDebtClass)) {
    console.error(
      `${RED}[lint-debt] unknown --class=${klassRaw}.${NC} ` +
        `Known classes: ${LINT_DEBT_CLASSES.join(", ")}.`,
    );
    process.exit(2);
  }
  const limitRaw = valueOf("--limit");
  return {
    write: argv.includes("--write"),
    json: argv.includes("--json"),
    strict: argv.includes("--strict"),
    klass: (klassRaw as LintDebtClass | null) ?? null,
    rule: scopeOf("--rule"),
    pathPrefix: scopeOf("--path"),
    // `--limit=0` means "print everything"; `Number("0") || 40` would eat it.
    limit: limitRaw === null ? 40 : Math.max(0, Number(limitRaw) || 0),
  };
}

function rank(
  findings: LintDebtFinding[],
  keyOf: (f: LintDebtFinding) => string,
  limit: number,
): LintDebtBucket[] {
  const map = new Map<string, LintDebtBucket>();
  for (const f of findings) {
    const key = keyOf(f);
    const bucket = map.get(key) ?? { key, count: 0, real: 0 };
    bucket.count += 1;
    if (isReal(classOf(f.rule))) bucket.real += 1;
    map.set(key, bucket);
  }
  return [...map.values()]
    .sort((a, b) => b.real - a.real || b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function rankRules(findings: LintDebtFinding[]): LintDebtRuleBucket[] {
  const map = new Map<string, LintDebtRuleBucket>();
  for (const f of findings) {
    const bucket = map.get(f.rule) ?? { rule: f.rule, count: 0, klass: classOf(f.rule) };
    bucket.count += 1;
    map.set(f.rule, bucket);
  }
  const order: Record<LintDebtClass, number> = { bug: 0, correctness: 1, doctrine: 2, style: 3 };
  return [...map.values()].sort(
    (a, b) => order[a.klass] - order[b.klass] || b.count - a.count || a.rule.localeCompare(b.rule),
  );
}

function buildReport(
  findings: LintDebtFinding[],
  filesScanned: number,
  commit: string | null,
): LintDebtReport {
  const byClass = { bug: 0, correctness: 0, doctrine: 0, style: 0 } as Record<
    LintDebtClass,
    number
  >;
  const files = new Set<string>();
  for (const f of findings) {
    byClass[classOf(f.rule)] += 1;
    files.add(f.file);
  }
  return {
    generatedAt: new Date().toISOString(),
    commit,
    totals: {
      errors: findings.length,
      filesWithFindings: files.size,
      filesScanned,
      byClass,
    },
    byRule: rankRules(findings),
    worstFiles: rank(findings, (f) => f.file, 40),
    worstFeatures: rank(findings, (f) => f.feature, 40),
    findings,
  };
}

function headCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      cwd: ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Unclassified rules are SHOUTED, not quietly filed under style.
 * A rule turned on without a `RULE_CLASS` entry would otherwise join the
 * backlog at the bottom of the priority list and never be seen again.
 */
function unclassifiedRules(findings: LintDebtFinding[]): string[] {
  const seen = new Set<string>();
  for (const f of findings) {
    if (!(f.rule in RULE_CLASS)) seen.add(f.rule);
  }
  return [...seen].sort();
}

function writeSnapshot(report: LintDebtReport): void {
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  let history: LintDebtHistoryPoint[] = [];
  if (existsSync(HISTORY_PATH)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(HISTORY_PATH, "utf8"));
      if (Array.isArray(parsed)) history = parsed as LintDebtHistoryPoint[];
    } catch {
      // A corrupt history is not worth losing the report over; it rebuilds
      // from this point forward and the scoreboard shows the short trend.
      console.error(`${YELLOW}[lint-debt] history.json was unreadable — starting a new trend.${NC}`);
    }
  }
  history.push({
    generatedAt: report.generatedAt,
    commit: report.commit,
    errors: report.totals.errors,
    filesWithFindings: report.totals.filesWithFindings,
    byClass: report.totals.byClass,
  });
  writeFileSync(
    HISTORY_PATH,
    `${JSON.stringify(history.slice(-HISTORY_MAX_POINTS), null, 2)}\n`,
  );
}

function print(report: LintDebtReport, args: Args, unclassified: string[]): void {
  const { totals } = report;
  const scope = [
    args.klass ? `class=${args.klass}` : null,
    args.rule ? `rule=${args.rule}` : null,
    args.pathPrefix ? `path=${args.pathPrefix}` : null,
  ].filter(Boolean);

  console.log("");
  console.log(`${BOLD}ESLint debt inventory${NC}${scope.length ? ` ${DIM}(${scope.join(", ")})${NC}` : ""}`);
  console.log(
    `${DIM}${totals.filesScanned} files linted · scoreboard /administration/reporting/lint-debt${NC}`,
  );
  console.log("");

  if (totals.errors === 0) {
    console.log(`${GREEN}No error-severity lint findings in scope.${NC}`);
    console.log("");
    return;
  }

  const real = totals.byClass.bug + totals.byClass.correctness;
  console.log(
    `  ${BOLD}${totals.errors}${NC} errors across ${totals.filesWithFindings} files — ` +
      `${real > 0 ? RED : GREEN}${real}${NC} are real bugs or correctness hazards`,
  );
  console.log("");
  for (const klass of LINT_DEBT_CLASSES) {
    const n = totals.byClass[klass];
    if (n === 0) continue;
    const color = klass === "bug" ? RED : klass === "correctness" ? YELLOW : DIM;
    console.log(`  ${color}${String(n).padStart(5)}${NC}  ${CLASS_TITLES[klass]}`);
  }

  console.log("");
  console.log(`${BOLD}By rule${NC}`);
  for (const bucket of report.byRule) {
    const color = bucket.klass === "bug" ? RED : bucket.klass === "correctness" ? YELLOW : DIM;
    console.log(
      `  ${String(bucket.count).padStart(5)}  ${color}${bucket.klass.padEnd(12)}${NC}${bucket.rule}`,
    );
  }

  console.log("");
  console.log(`${BOLD}Worst files${NC} ${DIM}(real-bug count first)${NC}`);
  for (const b of report.worstFiles.slice(0, 12)) {
    console.log(`  ${String(b.count).padStart(4)}  ${DIM}(${b.real} real)${NC}  ${b.key}`);
  }

  if (args.limit !== 0) {
    console.log("");
    console.log(`${BOLD}Findings${NC} ${DIM}(first ${args.limit})${NC}`);
    for (const f of report.findings.slice(0, args.limit)) {
      console.log(`  ${CYAN}${f.file}:${f.line}:${f.column}${NC}  ${DIM}${f.rule}${NC}`);
      console.log(`      ${f.message}`);
    }
    if (report.findings.length > args.limit) {
      console.log(`  ${DIM}… ${report.findings.length - args.limit} more (--limit=0 for all)${NC}`);
    }
  }

  if (unclassified.length > 0) {
    console.log("");
    console.log(
      `${YELLOW}${unclassified.length} rule(s) have no RULE_CLASS entry and defaulted to "style":${NC}`,
    );
    for (const rule of unclassified) console.log(`  ${rule}`);
    console.log(
      `${DIM}Classify them in scripts/lint-debt/types.ts — an unclassified rule silently joins the bottom of the backlog.${NC}`,
    );
  }

  console.log("");
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.write && (args.pathPrefix || args.rule || args.klass)) {
    console.error(
      `${RED}[lint-debt] --write refuses to run with a filter.${NC} ` +
        `report.json is the whole-repo baseline the scoreboard reads — its totals, ` +
        `rankings and trend all assume it. Writing a scoped run would shrink the page ` +
        `and add a false trend point, looking exactly like the campaign had been won.`,
    );
    process.exit(2);
  }

  const targets = args.pathPrefix ? [args.pathPrefix] : ["."];
  const { findings: all, filesScanned } = await scanRepo(ROOT, targets);

  const findings = all.filter(
    (f) =>
      (args.rule === null || f.rule === args.rule) &&
      (args.klass === null || classOf(f.rule) === args.klass) &&
      (args.pathPrefix === null || f.file.startsWith(`${args.pathPrefix}/`) || f.file === args.pathPrefix),
  );

  if ((args.rule || args.klass || args.pathPrefix) && all.length > 0 && findings.length === 0) {
    console.error(
      `${YELLOW}[lint-debt] the filter matched nothing${NC} — ${all.length} findings exist outside it. ` +
        `Check the spelling before reading this as "clean".`,
    );
  }

  const report = buildReport(findings, filesScanned, headCommit());
  const unclassified = unclassifiedRules(findings);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    print(report, args, unclassified);
  }

  if (args.write) {
    writeSnapshot(report);
    console.log(
      `${GREEN}Wrote scripts/lint-debt/report.json + history.json.${NC} Commit them — the scoreboard reads the snapshot.`,
    );
    console.log("");
  }

  // LOUD, NEVER BLOCKING.
  process.exit(args.strict && report.totals.errors > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(`${RED}[lint-debt] crashed:${NC}`, error);
  process.exit(2);
});

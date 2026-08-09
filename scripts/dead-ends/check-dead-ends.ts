#!/usr/bin/env tsx
/**
 * pnpm check:dead-ends — the No Dead Ends detector.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): if the UI names a thing
 * that has an identity in our system, the UI must let the user reach it.
 * Documentation was necessary and not sufficient — this repo's own history says
 * so. This is the scoreboard.
 *
 * LOUD, NEVER BLOCKING. Prints a ranked report and exits 0 (Arman's standing
 * rule: no check may block a build or a commit). `--strict` is for a human or
 * CI that explicitly wants a hard fail.
 *
 * Usage:
 *   pnpm check:dead-ends                 scan + ranked report
 *   pnpm check:dead-ends --write         also refresh scripts/dead-ends/report.json
 *                                        (+ append a history point) for the dashboard
 *   pnpm check:dead-ends --json          machine-readable report on stdout
 *   pnpm check:dead-ends --rule=<id>     only one rule
 *   pnpm check:dead-ends --path=<prefix> only files under a prefix
 *   pnpm check:dead-ends --limit=<n>     findings to print (default 40; 0 = all)
 *   pnpm check:dead-ends --strict        exit 1 when findings exist
 *
 * Admin dashboard: /administration/reporting/dead-ends
 * Contract + how to add a rule: scripts/dead-ends/FEATURE.md
 */

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { DEAD_END_ALLOWLIST } from "./allowlist";
import { describeFinding } from "./describe";
import { loadEntityTokens } from "./entity-tokens";
import { featureOf, scanFile, shouldScanFile } from "./scan";
import {
  RULE_DOCTRINE,
  RULE_TITLES,
  type DeadEndBucket,
  type DeadEndFinding,
  type DeadEndHistoryPoint,
  type DeadEndReport,
  type DeadEndRuleId,
} from "./types";

/**
 * The repo root, not the shell's cwd. Running from a subdirectory used to die
 * with an unhandled "the entity registry moved" stack trace when nothing had.
 */
const ROOT = repoRoot();

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
const SCAN_ROOTS = ["features", "components", "app", "lib"];
const REPORT_PATH = join(ROOT, "scripts/dead-ends/report.json");
const HISTORY_PATH = join(ROOT, "scripts/dead-ends/history.json");
/** Keep the trend readable and the file small — one point per refresh. */
const HISTORY_MAX_POINTS = 120;

/** Written out, not sliced from this file's own header — that drifted on every
 *  comment edit and leaked the first import line into the help text. */
const USAGE = `
pnpm check:dead-ends — the No Dead Ends Door Law detector.

  pnpm check:dead-ends                 scan + ranked report
  pnpm check:dead-ends:write           also refresh report.json + history.json
  pnpm check:dead-ends --json          machine-readable report on stdout
  pnpm check:dead-ends --rule=<id>     one rule (bare-id-text, unlinked-entity-name,
                                       unlinked-count, no-doors-in-file)
  pnpm check:dead-ends --path=<prefix> only files under a repo-relative prefix.
                                       Quote route groups: --path='app/(admin)'
  pnpm check:dead-ends --limit=<n>     findings to print (default 40; 0 = all)
  pnpm check:dead-ends --strict        exit 1 when findings exist

Always exits 0 unless --strict, a bad filter (exit 2), or a checker crash.
Doctrine:  common-docs/policies/no-dead-ends.md
Contract:  scripts/dead-ends/FEATURE.md
Dashboard: /administration/reporting/dead-ends
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
  rule: DeadEndRuleId | null;
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
  const limitRaw = valueOf("--limit");
  return {
    write: argv.includes("--write"),
    json: argv.includes("--json"),
    strict: argv.includes("--strict"),
    rule: (valueOf("--rule") as DeadEndRuleId | null) ?? null,
    pathPrefix: valueOf("--path"),
    // `--limit=0` means "print everything" — `Number("0") || 40` silently
    // turned that into 40.
    limit: limitRaw === null ? 40 : Math.max(0, Number(limitRaw) || 0),
  };
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".next")) continue;
    const full = join(dir, entry);
    let st;
    try {
      // lstat, not stat: `statSync` follows symlinks, so one symlinked
      // directory loop would recurse until the stack blows.
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    const rel = relative(ROOT, full).split(sep).join("/");
    if (shouldScanFile(rel)) out.push(full);
  }
  return out;
}

/** Allowlist match: exact file, optionally narrowed to one rule. */
function isAllowlisted(finding: DeadEndFinding): boolean {
  return DEAD_END_ALLOWLIST.some(
    (entry) =>
      entry.file === finding.file &&
      (entry.rule === undefined || entry.rule === finding.rule),
  );
}

function rank(findings: DeadEndFinding[], keyOf: (f: DeadEndFinding) => string): DeadEndBucket[] {
  const map = new Map<string, DeadEndBucket>();
  for (const f of findings) {
    const key = keyOf(f);
    const bucket = map.get(key) ?? { key, count: 0, high: 0 };
    bucket.count += 1;
    if (f.severity === "high") bucket.high += 1;
    map.set(key, bucket);
  }
  return [...map.values()].sort(
    (a, b) => b.high - a.high || b.count - a.count || a.key.localeCompare(b.key),
  );
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

const KNOWN_RULES = Object.keys(RULE_TITLES) as DeadEndRuleId[];

/**
 * A mistyped filter must never print a green tick. `--rule=bare-id` and
 * `--path=feature/notes` both reported "✓ No dead ends detected", which is the
 * worst thing a checker can do: lie clean.
 */
function assertFilters(rule: DeadEndRuleId | null, matchedFiles: number, pathPrefix: string | null): void {
  if (rule && !KNOWN_RULES.includes(rule)) {
    console.error(
      `${RED}[dead-ends] Unknown --rule=${rule}.${NC} Known rules: ${KNOWN_RULES.join(", ")}`,
    );
    process.exit(2);
  }
  if (pathPrefix && matchedFiles === 0) {
    console.error(
      `${RED}[dead-ends] --path=${pathPrefix} matched 0 files.${NC} ` +
        `Nothing was scanned — this is NOT a clean result. Check the prefix ` +
        `(repo-relative, e.g. features/notes). Route-group parentheses need ` +
        `shell quoting: --path='app/(admin)'`,
    );
    process.exit(2);
  }
}

function currentCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function main(): void {
  const args = parseArgs();
  const tokens = loadEntityTokens(ROOT);

  const files = SCAN_ROOTS.flatMap((r) => walk(join(ROOT, r))).filter((abs) => {
    if (!args.pathPrefix) return true;
    return relative(ROOT, abs).split(sep).join("/").startsWith(args.pathPrefix);
  });

  assertFilters(args.rule, files.length, args.pathPrefix);

  const raw: DeadEndFinding[] = [];
  for (const file of files) {
    try {
      raw.push(...scanFile(file, { repoRoot: ROOT, tokens }));
    } catch (err) {
      // A parse failure is a checker bug, not a silent zero. Scream and keep
      // going so one bad file can't hide the whole report.
      console.error(
        `${YELLOW}[dead-ends] failed to scan ${relative(ROOT, file)}: ${
          err instanceof Error ? err.message : String(err)
        }${NC}`,
      );
    }
  }

  const allowlisted = raw.filter(isAllowlisted).length;
  let findings = raw.filter((f) => !isAllowlisted(f));
  if (args.rule) findings = findings.filter((f) => f.rule === args.rule);

  findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );

  const byRule = {
    "bare-id-text": 0,
    "unlinked-entity-name": 0,
    "unlinked-count": 0,
    "no-doors-in-file": 0,
  } satisfies Record<DeadEndRuleId, number>;
  for (const f of findings) byRule[f.rule] += 1;

  const report: DeadEndReport = {
    generatedAt: new Date().toISOString(),
    commit: currentCommit(),
    totals: {
      findings: findings.length,
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
      filesWithFindings: new Set(findings.map((f) => f.file)).size,
      filesScanned: files.length,
      allowlisted,
    },
    byRule,
    worstFiles: rank(findings, (f) => f.file).slice(0, 50),
    worstFeatures: rank(findings, (f) => featureOf(f.file)).slice(0, 30),
    findings,
    allowlist: DEAD_END_ALLOWLIST,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, args.limit);
  }

  if (args.write) {
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    const history = readHistory();
    history.push({
      generatedAt: report.generatedAt,
      commit: report.commit,
      findings: report.totals.findings,
      high: report.totals.high,
      medium: report.totals.medium,
      low: report.totals.low,
      filesWithFindings: report.totals.filesWithFindings,
    });
    writeFileSync(
      HISTORY_PATH,
      `${JSON.stringify(history.slice(-HISTORY_MAX_POINTS), null, 2)}\n`,
    );
    if (!args.json) {
      console.log(
        `${DIM}  Wrote scripts/dead-ends/report.json + history.json — commit them so ` +
          `/administration/reporting/dead-ends shows this run.${NC}\n`,
      );
    }
  }

  // NEVER `process.exit()` here: stdout writes to a pipe are async, and exiting
  // truncated `--json | jq` at exactly one 64 KiB pipe buffer. Setting the code
  // lets node flush and exit on its own.
  process.exitCode = args.strict && findings.length > 0 ? 1 : 0;
}

/** Does this row satisfy the contract the dashboard's `parseHistory` enforces? */
function isHistoryPoint(row: unknown): row is DeadEndHistoryPoint {
  if (typeof row !== "object" || row === null) return false;
  const p = row as Record<string, unknown>;
  const numeric = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);
  return (
    typeof p.generatedAt === "string" &&
    (p.commit === null || typeof p.commit === "string") &&
    numeric(p.findings) &&
    numeric(p.high) &&
    numeric(p.medium) &&
    numeric(p.low) &&
    numeric(p.filesWithFindings)
  );
}

/**
 * The CLI is the only writer of history.json, so it is also the only place that
 * can HEAL it. The dashboard validates the same contract at import and throws —
 * i.e. a hand-edited or drifted point takes down /administration/reporting/dead-ends
 * on load. This used to cast the parsed array straight through, so `--write`
 * happily rewrote the bad point back and the page stayed broken.
 *
 * Now every point is checked against the same contract, bad ones are dropped,
 * and the drop SCREAMS (loud recovery — a recovery firing means a real bug got
 * past the proactive layer). One `--write` after the warning repairs the file.
 */
function readHistory(): DeadEndHistoryPoint[] {
  if (!existsSync(HISTORY_PATH)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(HISTORY_PATH, "utf8"));
  } catch {
    console.error(
      `${YELLOW}[dead-ends] history.json is unreadable — starting a new series.${NC}`,
    );
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error(
      `${YELLOW}[dead-ends] history.json is not an array — starting a new series.${NC}`,
    );
    return [];
  }
  const kept = parsed.filter(isHistoryPoint);
  if (kept.length !== parsed.length) {
    console.error(
      `${YELLOW}[dead-ends] history.json had ${parsed.length - kept.length} point(s) that do not ` +
        `match the history contract — dropped. The dashboard THROWS on these, so ` +
        `/administration/reporting/dead-ends is broken until you re-run with --write and commit.${NC}`,
    );
  }
  return kept;
}

function printReport(report: DeadEndReport, limit: number): void {
  const { totals } = report;
  console.log("");
  console.log(`${BOLD}  NO DEAD ENDS — Door Law detector${NC}`);
  console.log(
    `${DIM}  ${totals.filesScanned} files scanned · doctrine: common-docs/policies/no-dead-ends.md${NC}`,
  );
  console.log("");

  if (totals.findings === 0) {
    console.log(`${GREEN}  ✓ No dead ends detected.${NC}`);
    console.log(
      `${DIM}    (${totals.allowlisted} allowlisted finding(s) suppressed — see scripts/dead-ends/allowlist.ts)${NC}\n`,
    );
    return;
  }

  // Marker line the release-gate runner greps for so this check surfaces as a
  // loud advisory WARN instead of a silent [OK]. Keep it in sync with the
  // alternation in scripts/run-release-gates.sh.
  console.log(
    `  ${RED}DEAD ENDS FOUND${NC}: ${RED}${totals.high} high${NC} · ${YELLOW}${totals.medium} medium${NC} · ${totals.low} low` +
      `  ${DIM}across ${totals.filesWithFindings} file(s)${NC}`,
  );
  console.log("");

  console.log(`${BOLD}  By rule${NC}`);
  for (const [rule, count] of Object.entries(report.byRule) as [DeadEndRuleId, number][]) {
    if (count === 0) continue;
    console.log(`    ${String(count).padStart(4)}  ${RULE_TITLES[rule]}  ${DIM}(${rule})${NC}`);
    console.log(`          ${DIM}${RULE_DOCTRINE[rule]}${NC}`);
  }
  console.log("");

  console.log(`${BOLD}  Worst features${NC}`);
  for (const bucket of report.worstFeatures.slice(0, 10)) {
    console.log(
      `    ${String(bucket.count).padStart(4)}  ${bucket.key}  ${DIM}(${bucket.high} high)${NC}`,
    );
  }
  console.log("");

  console.log(`${BOLD}  Worst files${NC}`);
  for (const bucket of report.worstFiles.slice(0, 10)) {
    console.log(
      `    ${String(bucket.count).padStart(4)}  ${bucket.key}  ${DIM}(${bucket.high} high)${NC}`,
    );
  }
  console.log("");

  const shown = limit === 0 ? report.findings.length : Math.min(limit, report.findings.length);
  console.log(`${BOLD}  Findings${NC} ${DIM}(worst first, showing ${shown} of ${report.findings.length})${NC}`);
  for (const f of report.findings.slice(0, shown)) {
    const tag = f.severity === "high" ? `${RED}high${NC}` : f.severity === "medium" ? `${YELLOW}med ${NC}` : `${DIM}low ${NC}`;
    console.log(`    ${tag}  ${CYAN}${f.file}:${f.line}:${f.column}${NC}  ${DIM}[${f.rule}]${NC}`);
    console.log(`          ${f.entity}  ${DIM}·${NC}  ${describeFinding(f)}`);
  }
  if (report.findings.length > shown) {
    console.log(
      `${DIM}    … ${report.findings.length - shown} more. Use --limit=0 for all, --rule=<id> or --path=<prefix>.${NC}`,
    );
  }
  console.log("");
  console.log(
    `${DIM}  Fix recipe: invoke the \`no-dead-ends\` skill. The door primitive is\n` +
      `  <EntityRef token=… id=… name=… /> (components/official/entity-ref/EntityRef.tsx).\n` +
      `  A missing door is usually a missing hrefFor in features/scopes/registry/entityRegistry.ts.\n` +
      `  Deliberate exception? Add it WITH A REASON to scripts/dead-ends/allowlist.ts.\n` +
      `  Dashboard: /administration/reporting/dead-ends (refresh with --write, then commit).${NC}`,
  );
  console.log("");
}

main();

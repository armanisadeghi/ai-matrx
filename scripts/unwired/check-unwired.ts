#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scanUnwired } from "./scan";
import {
  DETECTOR_TITLES,
  UNWIRED_DETECTORS,
  type UnwiredAllowlistEntry,
  type UnwiredBucket,
  type UnwiredDetector,
  type UnwiredFinding,
  type UnwiredHistoryPoint,
  type UnwiredReport,
  type UnwiredRepository,
} from "./types";

const RED = "\u001b[0;31m";
const YELLOW = "\u001b[1;33m";
const GREEN = "\u001b[0;32m";
const CYAN = "\u001b[0;36m";
const BOLD = "\u001b[1m";
const NC = "\u001b[0m";

function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

const ROOT = repoRoot();
const REPORT_PATH = join(ROOT, "scripts/unwired/report.json");
const HISTORY_PATH = join(ROOT, "scripts/unwired/history.json");
const ALLOWLIST_PATH = join(ROOT, "scripts/unwired/allowlist.json");
const HISTORY_MAX_POINTS = 120;

interface Args {
  write: boolean;
  json: boolean;
  strict: boolean;
  limit: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`pnpm check:unwired — find purpose-built work that still needs runtime wiring

  pnpm check:unwired             advisory scan, size-ranked, exit 0
  pnpm check:unwired:write       refresh report.json and history.json
  pnpm check:unwired --json      emit the report contract
  pnpm check:unwired --limit=20  cap terminal detail (0 shows all)
  pnpm check:unwired --strict    opt-in exit 1 when findings exist

Law:        common-docs/policies/unfinished-work-alarm.md
Contract:   scripts/unwired/FEATURE.md
Scoreboard: /administration/reporting/unwired`);
    process.exit(0);
  }
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const limitRaw = limitArg?.slice("--limit=".length);
  if (limitRaw !== undefined && (!/^\d+$/.test(limitRaw) || Number(limitRaw) < 0)) {
    console.error(`${RED}[unwired] --limit must be a non-negative integer.${NC}`);
    process.exit(2);
  }
  const known = new Set(["--write", "--json", "--strict", ...(limitArg ? [limitArg] : [])]);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    console.error(`${RED}[unwired] unknown argument(s): ${unknown.join(", ")}.${NC} Run --help.`);
    process.exit(2);
  }
  return {
    write: argv.includes("--write"),
    json: argv.includes("--json"),
    strict: argv.includes("--strict"),
    limit: limitRaw === undefined ? 40 : Number(limitRaw),
  };
}

function headCommit(): string | null {
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

function allowlist(): UnwiredAllowlistEntry[] {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as { entries?: unknown[] };
  if (!Array.isArray(raw.entries)) throw new Error("scripts/unwired/allowlist.json needs an entries array");
  return raw.entries.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) throw new Error(`allowlist entry ${index} is not an object`);
    const row = entry as Record<string, unknown>;
    const repository = row.repository;
    const detector = row.detector;
    const file = row.file;
    const symbol = row.symbol;
    const reason = row.reason;
    if (
      (repository !== "matrx-frontend" && repository !== "aidream") ||
      typeof detector !== "string" ||
      !UNWIRED_DETECTORS.includes(detector as UnwiredDetector) ||
      typeof file !== "string" ||
      typeof symbol !== "string" ||
      typeof reason !== "string" ||
      reason.trim().length === 0
    ) {
      throw new Error(`allowlist entry ${index} is incomplete; repository, detector, file, symbol, and reason are required`);
    }
    return {
      repository,
      detector: detector as UnwiredDetector,
      file,
      symbol,
      reason,
    };
  });
}

function keyOf(finding: Pick<UnwiredFinding, "repository" | "detector" | "file" | "symbol">): string {
  return `${finding.repository}|${finding.detector}|${finding.file}|${finding.symbol}`;
}

function rank(findings: UnwiredFinding[]): UnwiredBucket[] {
  const map = new Map<string, UnwiredBucket>();
  for (const finding of findings) {
    const key = `${finding.repository}:${finding.file}`;
    const bucket = map.get(key) ?? { key, findings: 0, lines: 0 };
    bucket.findings += 1;
    bucket.lines += finding.lines;
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => b.lines - a.lines || b.findings - a.findings || a.key.localeCompare(b.key)).slice(0, 50);
}

function buildReport(): { report: UnwiredReport; stale: UnwiredAllowlistEntry[] } {
  const scan = scanUnwired(ROOT);
  const entries = allowlist();
  const byKey = new Map(entries.map((entry) => [keyOf(entry), entry]));
  const used = new Set<string>();
  const findings = scan.findings.filter((finding) => {
    const key = keyOf(finding);
    if (!byKey.has(key)) return true;
    used.add(key);
    return false;
  });
  const byDetector = Object.fromEntries(UNWIRED_DETECTORS.map((detector) => [detector, 0])) as Record<UnwiredDetector, number>;
  const byRepository: Record<UnwiredRepository, number> = { "matrx-frontend": 0, aidream: 0 };
  const files = new Set<string>();
  for (const finding of findings) {
    byDetector[finding.detector] += 1;
    byRepository[finding.repository] += 1;
    files.add(`${finding.repository}:${finding.file}`);
  }
  return {
    report: {
      generatedAt: new Date().toISOString(),
      commit: headCommit(),
      aidreamCommit: scan.aidreamCommit,
      totals: {
        findings: findings.length,
        lines: findings.reduce((sum, finding) => sum + finding.lines, 0),
        filesWithFindings: files.size,
        filesScanned: scan.filesScanned,
        suppressed: scan.findings.length - findings.length,
        byDetector,
        byRepository,
      },
      partial: scan.partial,
      worstFiles: rank(findings),
      findings,
      allowlist: entries,
    },
    stale: entries.filter((entry) => !used.has(keyOf(entry))),
  };
}

function writeSnapshot(report: UnwiredReport): void {
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  let history: UnwiredHistoryPoint[] = [];
  if (existsSync(HISTORY_PATH)) {
    try {
      const parsed = JSON.parse(readFileSync(HISTORY_PATH, "utf8")) as unknown;
      if (Array.isArray(parsed)) history = parsed as UnwiredHistoryPoint[];
    } catch {
      console.error(`${YELLOW}[unwired] history snapshot was unreadable; the trend restarts from this scan.${NC}`);
    }
  }
  history.push({
    generatedAt: report.generatedAt,
    commit: report.commit,
    findings: report.totals.findings,
    lines: report.totals.lines,
    filesWithFindings: report.totals.filesWithFindings,
  });
  writeFileSync(HISTORY_PATH, `${JSON.stringify(history.slice(-HISTORY_MAX_POINTS), null, 2)}\n`);
}

function printReport(report: UnwiredReport, stale: UnwiredAllowlistEntry[], limit: number): void {
  for (const note of report.partial) {
    console.log(`${YELLOW}[unwired/partial] ${note}${NC}`);
  }
  if (report.partial.length > 0) console.log("");
  if (report.findings.length === 0) {
    console.log(`${GREEN}[unwired] No unfinished wiring found by the rules that completed.${NC}`);
    console.log(`${YELLOW}A clean static report is not proof; read scripts/unwired/FEATURE.md → Known limits.${NC}`);
    return;
  }
  console.log(`${RED}${BOLD}PURPOSE-BUILT WORK APPEARS UNFINISHED — FINISH THE WIRING${NC}`);
  console.log(`${BOLD}${report.totals.findings} finding(s), ${report.totals.lines.toLocaleString()} implicated lines, ranked largest first.${NC}`);
  console.log("Someone built each artifact on purpose and was interrupted before its runtime path was complete.");
  console.log("The permitted response is to hunt its intent and finish it. Never recommend discarding a finding.");
  console.log("Law: common-docs/policies/unfinished-work-alarm.md\n");
  const shown = limit === 0 ? report.findings : report.findings.slice(0, limit);
  for (const finding of shown) {
    console.log(`${CYAN}${BOLD}[${finding.lines.toLocaleString()} lines] ${finding.repository} · ${DETECTOR_TITLES[finding.detector]}${NC}`);
    console.log(`  ${finding.file}:${finding.line} · ${finding.symbol}`);
    console.log(`  appears unfinished: ${finding.evidence}`);
    console.log(`  built on purpose:  ${finding.intent}`);
    console.log(`  WHAT REMAINS:      ${finding.remains}\n`);
  }
  if (shown.length < report.findings.length) {
    console.log(`${YELLOW}${report.findings.length - shown.length} more finding(s) are in the full report; use --limit=0.${NC}\n`);
  }
  if (report.totals.suppressed > 0) {
    console.log(`[unwired/allowlisted] ${report.totals.suppressed} known-wired artifact(s), each with a committed reason.`);
  }
  if (stale.length > 0) {
    console.log(`${YELLOW}[unwired/allowlist-stale] ${stale.length} entry(ies) matched no current finding; review their keys and reasons.${NC}`);
  }
  console.log(`${RED}${BOLD}Finish the work. Do not turn this report into a disposal list.${NC}`);
  console.log(`Scoreboard: /administration/reporting/unwired`);
}

const args = parseArgs();
const { report, stale } = buildReport();
if (args.write) writeSnapshot(report);
if (args.json) console.log(JSON.stringify(report, null, 2));
else printReport(report, stale, args.limit);
if (args.write) console.log(`${GREEN}[unwired] committed snapshot files refreshed.${NC}`);
process.exitCode = args.strict && report.totals.findings > 0 ? 1 : 0;

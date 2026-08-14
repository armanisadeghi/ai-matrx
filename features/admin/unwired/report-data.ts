import "server-only";

import rawHistory from "@/scripts/unwired/history.json";
import rawReport from "@/scripts/unwired/report.json";
import {
  UNWIRED_DETECTORS,
  type UnwiredAllowlistEntry,
  type UnwiredBucket,
  type UnwiredDetector,
  type UnwiredFinding,
  type UnwiredHistoryPoint,
  type UnwiredReport,
  type UnwiredRepository,
} from "@/scripts/unwired/types";

let source = "scripts/unwired/report.json";
const REGENERATE = "pnpm check:unwired:write (then commit the snapshot)";

function fail(message: string): never {
  throw new Error(`[unwired] ${source} violates its contract: ${message}. Regenerate it with ${REGENERATE}.`);
}

function object(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${where} is not an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(`${where} is not an array`);
  return value;
}

function string(value: unknown, where: string): string {
  if (typeof value !== "string") fail(`${where} is not a string`);
  return value;
}

function number(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${where} is not a finite number`);
  return value;
}

function nullableString(value: unknown, where: string): string | null {
  if (value === null || value === undefined) return null;
  return string(value, where);
}

function repository(value: unknown, where: string): UnwiredRepository {
  if (value !== "matrx-frontend" && value !== "aidream") fail(`${where} is not a known repository`);
  return value;
}

function detector(value: unknown, where: string): UnwiredDetector {
  if (typeof value !== "string" || !UNWIRED_DETECTORS.includes(value as UnwiredDetector)) {
    fail(`${where} is not a known detector`);
  }
  return value as UnwiredDetector;
}

function finding(value: unknown, index: number): UnwiredFinding {
  const row = object(value, `findings[${index}]`);
  return {
    repository: repository(row.repository, `findings[${index}].repository`),
    detector: detector(row.detector, `findings[${index}].detector`),
    file: string(row.file, `findings[${index}].file`),
    line: number(row.line, `findings[${index}].line`),
    column: number(row.column, `findings[${index}].column`),
    symbol: string(row.symbol, `findings[${index}].symbol`),
    lines: number(row.lines, `findings[${index}].lines`),
    title: string(row.title, `findings[${index}].title`),
    evidence: string(row.evidence, `findings[${index}].evidence`),
    intent: string(row.intent, `findings[${index}].intent`),
    remains: string(row.remains, `findings[${index}].remains`),
    feature: string(row.feature, `findings[${index}].feature`),
  };
}

function bucket(value: unknown, index: number): UnwiredBucket {
  const row = object(value, `worstFiles[${index}]`);
  return {
    key: string(row.key, `worstFiles[${index}].key`),
    findings: number(row.findings, `worstFiles[${index}].findings`),
    lines: number(row.lines, `worstFiles[${index}].lines`),
  };
}

function allowlistEntry(value: unknown, index: number): UnwiredAllowlistEntry {
  const row = object(value, `allowlist[${index}]`);
  return {
    repository: repository(row.repository, `allowlist[${index}].repository`),
    detector: detector(row.detector, `allowlist[${index}].detector`),
    file: string(row.file, `allowlist[${index}].file`),
    symbol: string(row.symbol, `allowlist[${index}].symbol`),
    reason: string(row.reason, `allowlist[${index}].reason`),
  };
}

function detectorCounts(value: unknown): Record<UnwiredDetector, number> {
  const row = object(value, "totals.byDetector");
  return Object.fromEntries(
    UNWIRED_DETECTORS.map((name) => [name, number(row[name] ?? 0, `totals.byDetector.${name}`)]),
  ) as Record<UnwiredDetector, number>;
}

function parseReport(value: unknown): UnwiredReport {
  const row = object(value, "report");
  const totals = object(row.totals, "totals");
  const repositories = object(totals.byRepository, "totals.byRepository");
  return {
    generatedAt: string(row.generatedAt, "generatedAt"),
    commit: nullableString(row.commit, "commit"),
    aidreamCommit: nullableString(row.aidreamCommit, "aidreamCommit"),
    totals: {
      findings: number(totals.findings, "totals.findings"),
      lines: number(totals.lines, "totals.lines"),
      filesWithFindings: number(totals.filesWithFindings, "totals.filesWithFindings"),
      filesScanned: number(totals.filesScanned, "totals.filesScanned"),
      suppressed: number(totals.suppressed, "totals.suppressed"),
      byDetector: detectorCounts(totals.byDetector),
      byRepository: {
        "matrx-frontend": number(repositories["matrx-frontend"], "totals.byRepository.matrx-frontend"),
        aidream: number(repositories.aidream, "totals.byRepository.aidream"),
      },
    },
    partial: array(row.partial, "partial").map((note, index) => string(note, `partial[${index}]`)),
    worstFiles: array(row.worstFiles, "worstFiles").map(bucket),
    findings: array(row.findings, "findings").map(finding),
    allowlist: array(row.allowlist, "allowlist").map(allowlistEntry),
  };
}

function parseHistory(value: unknown): UnwiredHistoryPoint[] {
  source = "scripts/unwired/history.json";
  return array(value, "history").map((item, index) => {
    const row = object(item, `history[${index}]`);
    return {
      generatedAt: string(row.generatedAt, `history[${index}].generatedAt`),
      commit: nullableString(row.commit, `history[${index}].commit`),
      findings: number(row.findings, `history[${index}].findings`),
      lines: number(row.lines, `history[${index}].lines`),
      filesWithFindings: number(row.filesWithFindings, `history[${index}].filesWithFindings`),
    };
  });
}

export function reconcileUnwiredReport(report: UnwiredReport): string[] {
  const problems: string[] = [];
  const files = new Set(report.findings.map((item) => `${item.repository}:${item.file}`));
  const lines = report.findings.reduce((sum, item) => sum + item.lines, 0);
  if (report.totals.findings !== report.findings.length) problems.push(`headline says ${report.totals.findings} findings; rows hold ${report.findings.length}`);
  if (report.totals.lines !== lines) problems.push(`headline says ${report.totals.lines} lines; rows sum to ${lines}`);
  if (report.totals.filesWithFindings !== files.size) problems.push(`headline says ${report.totals.filesWithFindings} files; rows name ${files.size}`);
  return problems;
}

export const UNWIRED_REPORT = parseReport(rawReport);
export const UNWIRED_HISTORY = parseHistory(rawHistory);
export const UNWIRED_REPORT_PROBLEMS = reconcileUnwiredReport(UNWIRED_REPORT);

import "server-only";

/**
 * Loads the committed dead-ends snapshot and VALIDATES it against the report
 * contract instead of casting.
 *
 * `resolveJsonModule` types a JSON import from its literal, so `severity` comes
 * back as `string`, not `"high" | "medium" | "low"`. The tempting fix is
 * `as unknown as DeadEndReport` — a type hatch that would also let a drifted or
 * hand-edited snapshot render silently wrong. This module parses instead: every
 * finding is rebuilt through a checked constructor, and anything that does not
 * match the contract throws with the exact command that regenerates it.
 *
 * Cost is one pass over ~170 rows per request on a dynamic admin page.
 */

import rawReport from "@/scripts/dead-ends/report.json";
import rawHistory from "@/scripts/dead-ends/history.json";
import {
  RULE_TITLES,
  type DeadEndAllowlistEntry,
  type DeadEndBucket,
  type DeadEndFinding,
  type DeadEndHistoryPoint,
  type DeadEndReport,
  type DeadEndRuleId,
  type DeadEndSeverity,
} from "@/scripts/dead-ends/types";

const REGENERATE = "pnpm check:dead-ends:write (then commit the snapshot)";

function fail(what: string): never {
  throw new Error(
    `[dead-ends] scripts/dead-ends/report.json does not match the report contract: ${what}. ` +
      `Regenerate it — ${REGENERATE} — or fix scripts/dead-ends/types.ts and the dashboard together.`,
  );
}

const SEVERITIES = new Set<string>(["high", "medium", "low"]);
const RULES = new Set<string>(Object.keys(RULE_TITLES));

function asRule(value: unknown, where: string): DeadEndRuleId {
  if (typeof value !== "string" || !RULES.has(value)) fail(`${where} has unknown rule ${String(value)}`);
  return value as DeadEndRuleId;
}

function asSeverity(value: unknown, where: string): DeadEndSeverity {
  if (typeof value !== "string" || !SEVERITIES.has(value)) {
    fail(`${where} has unknown severity ${String(value)}`);
  }
  return value as DeadEndSeverity;
}

function str(value: unknown, where: string): string {
  if (typeof value !== "string") fail(`${where} is not a string`);
  return value;
}

function num(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${where} is not a number`);
  return value;
}

function nullableStr(value: unknown, where: string): string | null {
  if (value === null || value === undefined) return null;
  return str(value, where);
}

function toFinding(row: unknown, index: number): DeadEndFinding {
  if (typeof row !== "object" || row === null) fail(`findings[${index}] is not an object`);
  const f = row as Record<string, unknown>;
  const where = `findings[${index}]`;
  return {
    file: str(f.file, `${where}.file`),
    line: num(f.line, `${where}.line`),
    column: num(f.column, `${where}.column`),
    rule: asRule(f.rule, where),
    severity: asSeverity(f.severity, where),
    entity: str(f.entity, `${where}.entity`),
    entityHasRoute: Boolean(f.entityHasRoute),
    expression: str(f.expression, `${where}.expression`),
    feature: str(f.feature, `${where}.feature`),
    route: nullableStr(f.route, `${where}.route`),
  };
}

function toBucket(row: unknown, where: string): DeadEndBucket {
  if (typeof row !== "object" || row === null) fail(`${where} is not an object`);
  const b = row as Record<string, unknown>;
  return {
    key: str(b.key, `${where}.key`),
    count: num(b.count, `${where}.count`),
    high: num(b.high, `${where}.high`),
  };
}

function toAllowlistEntry(row: unknown, index: number): DeadEndAllowlistEntry {
  if (typeof row !== "object" || row === null) fail(`allowlist[${index}] is not an object`);
  const e = row as Record<string, unknown>;
  const rule = e.rule === undefined || e.rule === null ? undefined : asRule(e.rule, `allowlist[${index}]`);
  return {
    file: str(e.file, `allowlist[${index}].file`),
    ...(rule ? { rule } : {}),
    reason: str(e.reason, `allowlist[${index}].reason`),
    addedBy: str(e.addedBy, `allowlist[${index}].addedBy`),
    addedOn: str(e.addedOn, `allowlist[${index}].addedOn`),
  };
}

function parseReport(raw: unknown): DeadEndReport {
  if (typeof raw !== "object" || raw === null) fail("the file is not an object");
  const r = raw as Record<string, unknown>;
  const totals = r.totals as Record<string, unknown> | undefined;
  if (!totals) fail("missing `totals`");
  const byRuleRaw = (r.byRule ?? {}) as Record<string, unknown>;

  const byRule = {} as Record<DeadEndRuleId, number>;
  for (const rule of Object.keys(RULE_TITLES) as DeadEndRuleId[]) {
    byRule[rule] = num(byRuleRaw[rule] ?? 0, `byRule.${rule}`);
  }

  return {
    generatedAt: str(r.generatedAt, "generatedAt"),
    commit: nullableStr(r.commit, "commit"),
    totals: {
      findings: num(totals.findings, "totals.findings"),
      high: num(totals.high, "totals.high"),
      medium: num(totals.medium, "totals.medium"),
      low: num(totals.low, "totals.low"),
      filesWithFindings: num(totals.filesWithFindings, "totals.filesWithFindings"),
      filesScanned: num(totals.filesScanned, "totals.filesScanned"),
      allowlisted: num(totals.allowlisted, "totals.allowlisted"),
    },
    byRule,
    worstFiles: asArray(r.worstFiles, "worstFiles").map((b, i) => toBucket(b, `worstFiles[${i}]`)),
    worstFeatures: asArray(r.worstFeatures, "worstFeatures").map((b, i) =>
      toBucket(b, `worstFeatures[${i}]`),
    ),
    findings: asArray(r.findings, "findings").map(toFinding),
    allowlist: asArray(r.allowlist, "allowlist").map(toAllowlistEntry),
  };
}

function parseHistory(raw: unknown): DeadEndHistoryPoint[] {
  return asArray(raw, "history").map((row, index) => {
    if (typeof row !== "object" || row === null) fail(`history[${index}] is not an object`);
    const p = row as Record<string, unknown>;
    return {
      generatedAt: str(p.generatedAt, `history[${index}].generatedAt`),
      commit: nullableStr(p.commit, `history[${index}].commit`),
      findings: num(p.findings, `history[${index}].findings`),
      high: num(p.high, `history[${index}].high`),
      medium: num(p.medium, `history[${index}].medium`),
      low: num(p.low, `history[${index}].low`),
      filesWithFindings: num(p.filesWithFindings, `history[${index}].filesWithFindings`),
    };
  });
}

function asArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(`${where} is not an array`);
  return value;
}

export const DEAD_END_REPORT: DeadEndReport = parseReport(rawReport);
export const DEAD_END_HISTORY: DeadEndHistoryPoint[] = parseHistory(rawHistory);

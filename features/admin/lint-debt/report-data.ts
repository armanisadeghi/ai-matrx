import "server-only";

/**
 * Loads the committed lint-debt snapshot and VALIDATES it against the report
 * contract instead of casting.
 *
 * Same reasoning as `features/admin/dead-ends/report-data.ts`:
 * `resolveJsonModule` types a JSON import from its literal, so a drifted or
 * hand-edited snapshot would render silently wrong behind an `as` cast. This
 * module rebuilds every row through a checked constructor and throws with the
 * exact command that regenerates the file.
 *
 * One difference worth stating: this report holds ~2.5k findings, not ~150. The
 * parse is still one linear pass and the file is a static import resolved at
 * build time, but the console must NOT try to render all of them at once — see
 * LintDebtConsole's paging note.
 */

import rawReport from "@/scripts/lint-debt/report.json";
import rawHistory from "@/scripts/lint-debt/history.json";
import {
  LINT_DEBT_CLASSES,
  RULE_CLASS,
  classOf,
  type LintDebtBucket,
  type LintDebtClass,
  type LintDebtFinding,
  type LintDebtHistoryPoint,
  type LintDebtReport,
  type LintDebtRuleBucket,
} from "@/scripts/lint-debt/types";

const REGENERATE = "pnpm check:lint-debt:write (then commit the snapshot)";

/** Which committed file the current parse is reading, so `fail()` sends the
 *  operator to regenerate the right one. */
let parsingSource = "scripts/lint-debt/report.json";

function fail(what: string): never {
  throw new Error(
    `[lint-debt] ${parsingSource} does not match the report contract: ${what}. ` +
      `Regenerate it — ${REGENERATE} — or fix scripts/lint-debt/types.ts and the scoreboard together.`,
  );
}

const CLASSES = new Set<string>(LINT_DEBT_CLASSES);

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

function asArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(`${where} is not an array`);
  return value;
}

function asClass(value: unknown, where: string): LintDebtClass {
  if (typeof value !== "string" || !CLASSES.has(value)) {
    fail(`${where} has unknown class ${String(value)}`);
  }
  return value as LintDebtClass;
}

function toFinding(row: unknown, index: number): LintDebtFinding {
  if (typeof row !== "object" || row === null) fail(`findings[${index}] is not an object`);
  const f = row as Record<string, unknown>;
  const where = `findings[${index}]`;
  return {
    file: str(f.file, `${where}.file`),
    line: num(f.line, `${where}.line`),
    column: num(f.column, `${where}.column`),
    rule: str(f.rule, `${where}.rule`),
    feature: str(f.feature, `${where}.feature`),
    route: nullableStr(f.route, `${where}.route`),
    message: str(f.message, `${where}.message`),
  };
}

function toBucket(row: unknown, where: string): LintDebtBucket {
  if (typeof row !== "object" || row === null) fail(`${where} is not an object`);
  const b = row as Record<string, unknown>;
  return {
    key: str(b.key, `${where}.key`),
    count: num(b.count, `${where}.count`),
    real: num(b.real, `${where}.real`),
  };
}

function toRuleBucket(row: unknown, index: number): LintDebtRuleBucket {
  if (typeof row !== "object" || row === null) fail(`byRule[${index}] is not an object`);
  const b = row as Record<string, unknown>;
  return {
    rule: str(b.rule, `byRule[${index}].rule`),
    count: num(b.count, `byRule[${index}].count`),
    klass: asClass(b.klass, `byRule[${index}].klass`),
  };
}

function toByClass(raw: unknown, where: string): Record<LintDebtClass, number> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Record<LintDebtClass, number>;
  for (const klass of LINT_DEBT_CLASSES) {
    out[klass] = num(source[klass] ?? 0, `${where}.${klass}`);
  }
  return out;
}

function parseReport(raw: unknown): LintDebtReport {
  if (typeof raw !== "object" || raw === null) fail("the file is not an object");
  const r = raw as Record<string, unknown>;
  const totals = r.totals as Record<string, unknown> | undefined;
  if (!totals) fail("missing `totals`");

  return {
    generatedAt: str(r.generatedAt, "generatedAt"),
    commit: nullableStr(r.commit, "commit"),
    totals: {
      errors: num(totals.errors, "totals.errors"),
      filesWithFindings: num(totals.filesWithFindings, "totals.filesWithFindings"),
      filesScanned: num(totals.filesScanned, "totals.filesScanned"),
      byClass: toByClass(totals.byClass, "totals.byClass"),
    },
    byRule: asArray(r.byRule, "byRule").map(toRuleBucket),
    worstFiles: asArray(r.worstFiles, "worstFiles").map((b, i) => toBucket(b, `worstFiles[${i}]`)),
    worstFeatures: asArray(r.worstFeatures, "worstFeatures").map((b, i) =>
      toBucket(b, `worstFeatures[${i}]`),
    ),
    findings: asArray(r.findings, "findings").map(toFinding),
  };
}

function parseHistory(raw: unknown): LintDebtHistoryPoint[] {
  parsingSource = "scripts/lint-debt/history.json";
  return asArray(raw, "history").map((row, index) => {
    if (typeof row !== "object" || row === null) fail(`history[${index}] is not an object`);
    const p = row as Record<string, unknown>;
    return {
      generatedAt: str(p.generatedAt, `history[${index}].generatedAt`),
      commit: nullableStr(p.commit, `history[${index}].commit`),
      errors: num(p.errors, `history[${index}].errors`),
      filesWithFindings: num(p.filesWithFindings, `history[${index}].filesWithFindings`),
      byClass: toByClass(p.byClass, `history[${index}].byClass`),
    };
  });
}

/**
 * Do the headline numbers agree with the rows underneath them, and is every
 * rule in the snapshot classified?
 *
 * Returns sentences; it does NOT throw. The rows are still usable and worth
 * showing, so the console renders these loudly beside the data (loud recovery)
 * rather than taking the scoreboard down — the same call `reconcileReport` in
 * the dead-ends loader had to be walked back to.
 */
export function reconcileReport(report: LintDebtReport): string[] {
  const problems: string[] = [];
  const { findings, totals } = report;

  const byClass = { bug: 0, correctness: 0, doctrine: 0, style: 0 } as Record<
    LintDebtClass,
    number
  >;
  const files = new Set<string>();
  const unclassified = new Set<string>();
  for (const f of findings) {
    byClass[classOf(f.rule)] += 1;
    files.add(f.file);
    if (!(f.rule in RULE_CLASS)) unclassified.add(f.rule);
  }

  const compare = (label: string, claimed: number, actual: number): void => {
    if (claimed !== actual) {
      problems.push(`${label} says ${claimed}, the findings list holds ${actual}`);
    }
  };

  compare("totals.errors", totals.errors, findings.length);
  compare("totals.filesWithFindings", totals.filesWithFindings, files.size);
  for (const klass of LINT_DEBT_CLASSES) {
    compare(`totals.byClass.${klass}`, totals.byClass[klass], byClass[klass]);
  }

  if (unclassified.size > 0) {
    problems.push(
      `${unclassified.size} rule(s) have no RULE_CLASS entry and defaulted to "style" — ` +
        `${[...unclassified].sort().join(", ")}. Classify them in scripts/lint-debt/types.ts.`,
    );
  }

  return problems;
}

export const LINT_DEBT_REPORT: LintDebtReport = parseReport(rawReport);
export const LINT_DEBT_HISTORY: LintDebtHistoryPoint[] = parseHistory(rawHistory);
export const LINT_DEBT_REPORT_PROBLEMS: string[] = reconcileReport(LINT_DEBT_REPORT);

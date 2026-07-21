/**
 * Heading-structure evaluation — deterministic outline checks. Mirror of
 * `matrx_scraper/audit_metrics.py` `evaluate_heading_structure` (thresholds +
 * issue strings byte-identical).
 */

import type { AuditIssue } from "./types";
import { issuesOk } from "./types";

/** Headings longer than this read as paragraphs, not structure. */
export const HEADING_MAX_CHARS = 70;

export interface HeadingEntryInput {
  text: string;
  level: number;
}

/**
 * Build evaluator inputs from the RAW `headings.all` JSON array. Mirrors the
 * Python entry filter exactly (dict + integer level 1-6; non-string text →
 * "") — do NOT feed the display parser's output, it drops empty-text
 * headings that the evaluator must count.
 */
export function headingInputsFromRaw(all: unknown): HeadingEntryInput[] {
  if (!Array.isArray(all)) return [];
  return all.flatMap((entry): HeadingEntryInput[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const level = record.level;
    if (typeof level !== "number" || !Number.isInteger(level)) return [];
    if (level < 1 || level > 6) return [];
    return [
      { text: typeof record.text === "string" ? record.text : "", level },
    ];
  });
}

export interface HeadingStructureEvaluation {
  /** No error-severity issues (warnings allowed). */
  ok: boolean;
  total: number;
  h1Count: number;
  firstLevel: number | null;
  /** Number of downward transitions that skip a level (e.g. H2 → H4). */
  skippedLevels: number;
  emptyCount: number;
  /** Headings longer than HEADING_MAX_CHARS. */
  longCount: number;
  issues: AuditIssue[];
}

function codePointCount(text: string): number {
  return Array.from(text).length;
}

export function evaluateHeadingStructure(
  headings: HeadingEntryInput[],
): HeadingStructureEvaluation {
  const total = headings.length;
  const h1Count = headings.filter((entry) => entry.level === 1).length;
  const firstLevel = total > 0 ? headings[0].level : null;
  const emptyCount = headings.filter((entry) => !entry.text.trim()).length;
  const longCount = headings.filter(
    (entry) => codePointCount(entry.text.trim()) > HEADING_MAX_CHARS,
  ).length;

  let skippedLevels = 0;
  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i].level > headings[i - 1].level + 1) skippedLevels += 1;
  }

  const issues: AuditIssue[] = [];
  if (total === 0) {
    issues.push({
      severity: "error",
      message: "No headings at all — the page has no structural outline",
    });
  } else if (h1Count === 0) {
    issues.push({
      severity: "error",
      message: "No H1 heading — every page needs exactly one H1",
    });
  }
  if (h1Count > 1)
    issues.push({
      severity: "warning",
      message: `${h1Count} H1 headings — expected exactly 1`,
    });
  if (firstLevel !== null && firstLevel !== 1)
    issues.push({
      severity: "warning",
      message: `First heading is an H${firstLevel} — pages should open with the H1`,
    });
  if (skippedLevels > 0)
    issues.push({
      severity: "warning",
      message: `${skippedLevels} skipped heading level(s) (e.g. an H2 followed by an H4)`,
    });
  if (emptyCount > 0)
    issues.push({
      severity: "warning",
      message: `${emptyCount} empty heading(s) — remove or fill them`,
    });
  if (longCount > 0)
    issues.push({
      severity: "warning",
      message: `${longCount} heading(s) longer than ${HEADING_MAX_CHARS} characters`,
    });

  return {
    ok: issuesOk(issues),
    total,
    h1Count,
    firstLevel,
    skippedLevels,
    emptyCount,
    longCount,
    issues,
  };
}

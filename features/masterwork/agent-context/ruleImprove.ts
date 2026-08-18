import type { RulebookRule, RulebookSections, RuleSeverity } from "../types";

/**
 * The Improve verb — the third core review verb (Approve / Reject / Improve;
 * Arman, 2026-08-17). The Expert speaks feedback, the `masterwork.rule_improver`
 * Mandate rewrites that ONE rule with the full Rulebook as context, and the
 * rewrite lands as a DRAFT revision (keeping its id) through the canonical
 * `saveRules` CAS — never auto-approved. The same Mandate drafts a brand-new
 * rule from the Expert's own words (the Add-rule window's "With AI" tab):
 * `rule_json` is simply empty then.
 *
 * This module is the validation/merge half, sibling of ruleCleanup.ts.
 */

export const MASTERWORK_RULE_IMPROVER_MANDATE = "masterwork.rule_improver";

export interface RuleImproveResult {
  name: string;
  statement: string;
  rationale: string;
  detection: string;
  severity: RuleSeverity;
  section: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(
  value: Record<string, unknown>,
  key: keyof RuleImproveResult,
): string {
  const field = value[key];
  if (typeof field !== "string") {
    throw new Error(`The AI returned an invalid ${key} field.`);
  }
  return field;
}

/**
 * Validate the structured rewrite. Unlike cleanup, the improver MAY change
 * severity and section (the Expert's feedback can ask for exactly that) — but
 * a section code the Rulebook doesn't declare falls back to the current one,
 * never an invented section.
 */
export function coerceRuleImproveResult(
  value: unknown,
  opts: { sections: RulebookSections; fallbackSection: string },
): RuleImproveResult {
  if (!isRecord(value)) {
    throw new Error("The AI did not return a rule.");
  }
  const severity = requireString(value, "severity");
  if (severity !== "critical" && severity !== "major" && severity !== "minor") {
    throw new Error("The AI returned an invalid severity field.");
  }
  const rawSection = requireString(value, "section");
  const section = Object.hasOwn(opts.sections, rawSection)
    ? rawSection
    : opts.fallbackSection;

  const result: RuleImproveResult = {
    name: requireString(value, "name"),
    statement: requireString(value, "statement"),
    rationale: requireString(value, "rationale"),
    detection: requireString(value, "detection"),
    severity,
    section,
  };
  if (!result.name.trim() || !result.statement.trim()) {
    throw new Error("The AI dropped the rule name or the rule itself.");
  }
  return result;
}

/**
 * Merge the rewrite onto the existing rule: the id and the verbatim source
 * evidence (`quote`, `source_ref`) are mechanically untouchable; the result is
 * ALWAYS a draft awaiting the explicit Approve, and the feedback that drove
 * the rewrite is consumed (rejected/feedback cleared).
 */
export function applyRuleImprove(
  current: RulebookRule,
  result: RuleImproveResult,
): RulebookRule {
  const next: RulebookRule = {
    ...current,
    name: result.name.trim(),
    statement: result.statement.trim(),
    rationale: result.rationale.trim() || undefined,
    detection: result.detection.trim() || undefined,
    severity: result.severity,
    section: result.section,
    draft: true,
  };
  delete next.rejected;
  delete next.feedback;
  return next;
}

import type { RulebookDraftSnapshot } from "./rulebookSurfaceScope";
import type { RulebookRule, RulebookSections, RuleSeverity } from "../types";

/**
 * The Improve verb — the third core review verb (Approve / Reject / Improve;
 * Arman, 2026-08-17). The Expert speaks feedback, the `masterwork.rule_improver`
 * Mandate rewrites that ONE rule with the full Rulebook as context, and the
 * rewrite lands as a DRAFT revision (keeping its id) through the canonical
 * `saveRules` CAS — never auto-approved. The same Mandate covers all three
 * shapes of the job, selected purely by which variables are empty:
 *
 * - `rule_json` + `expert_input`: apply the Expert's feedback to that rule.
 * - empty `rule_json`: draft a brand-new rule from the Expert's own words
 *   (the Add-rule window's "With AI" tab).
 * - empty `expert_input`: TIDY — polish the rule's wording without changing
 *   its meaning (the editor's "Clean up with AI"). Absorbed from the retired
 *   `masterwork.rule_cleanup` sibling Mandate (2026-08-17): one job, one
 *   Mandate; the doctrine's verbs are exactly Approve / Reject / Improve.
 *
 * This module is the validation/merge half for every consumer.
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

/**
 * The TIDY apply — the editor's "Clean up with AI" (empty `expert_input`).
 * Without feedback, nothing authorized touching the Expert's classifications:
 * `severity` and `section` stay mechanically frozen alongside the verbatim
 * `quote`, whatever the agent returned. Only the authored prose moves. The
 * result stays in the editor form for review — the existing `saveRules`
 * funnel remains the only write.
 */
export function applyRuleTidy(
  current: RulebookDraftSnapshot,
  result: RuleImproveResult,
): RulebookDraftSnapshot {
  const next: RulebookDraftSnapshot = {
    ...current,
    name: result.name.trim(),
    statement: result.statement.trim(),
    rationale: result.rationale.trim(),
    detection: result.detection.trim(),
  };
  if (!next.name || !next.statement) {
    throw new Error("AI cleanup removed the rule name or the rule statement.");
  }
  return next;
}

/**
 * Restore the Rule Editor's persisted wizard draft (fields + the pre-tidy
 * snapshot behind "Undo AI cleanup") — only when it belongs to the same
 * Rulebook version, mode, and rule. Anything else returns null and the editor
 * starts from the live rule.
 */
export function readRuleEditorDraft(
  value: unknown,
  expected: {
    rulebookVersion: number;
    mode: RulebookDraftSnapshot["mode"];
    ruleId: string | null;
  },
): {
  fields: RulebookDraftSnapshot;
  beforeTidy: RulebookDraftSnapshot | null;
} | null {
  if (!isRecord(value) || value.baseVersion !== expected.rulebookVersion) {
    return null;
  }

  const readSnapshot = (candidate: unknown): RulebookDraftSnapshot | null => {
    if (!isRecord(candidate)) return null;
    const mode = candidate.mode;
    const ruleId = candidate.rule_id;
    const severity = candidate.severity;
    if (
      (mode !== "new" && mode !== "edit") ||
      mode !== expected.mode ||
      (ruleId !== null && typeof ruleId !== "string") ||
      ruleId !== expected.ruleId ||
      typeof candidate.name !== "string" ||
      typeof candidate.statement !== "string" ||
      typeof candidate.rationale !== "string" ||
      typeof candidate.detection !== "string" ||
      typeof candidate.quote !== "string" ||
      (severity !== "critical" && severity !== "major" && severity !== "minor") ||
      typeof candidate.section !== "string"
    ) {
      return null;
    }
    return {
      mode,
      rule_id: ruleId,
      name: candidate.name,
      statement: candidate.statement,
      rationale: candidate.rationale,
      detection: candidate.detection,
      quote: candidate.quote,
      severity,
      section: candidate.section,
    };
  };

  const fields = readSnapshot(value.fields);
  if (!fields) return null;
  return {
    fields,
    beforeTidy: readSnapshot(value.beforeTidy),
  };
}

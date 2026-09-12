import type { RulebookDraftSnapshot } from "./rulebookSurfaceScope";
import {
  mergeRuleFieldValues,
  POLICY_ACTION_KINDS,
  POLICY_LEVELS,
  type PolicyActionKind,
  type PolicyLevel,
  type RuleFieldValues,
  type RulebookRule,
  type RulebookSections,
  type RuleSeverity,
} from "../types";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

/**
 * The Improve verb — the third core review verb (Approve / Reject / Improve;
 * Arman, 2026-08-17). The Expert speaks feedback, the `masterwork.rule_improver`
 * Mandate rewrites that ONE rule with the full Rulebook as context, and the
 * rewrite lands as a DRAFT revision (keeping its id) through the canonical
 * `saveRules` CAS — never auto-approved. The same Mandate covers all three
 * shapes of the job, selected purely by which variables are empty:
 *
 * - `rule` + `expert_input`: apply the Expert's feedback to that rule.
 * - empty `rule`: draft a brand-new rule from the Expert's own words
 *   (the Add-rule window's "With AI" tab).
 * - empty `expert_input`: TIDY — polish the rule's wording without changing
 *   its meaning (the editor's "Clean up with AI"). Absorbed from the retired
 *   `masterwork.rule_cleanup` sibling Mandate (2026-08-17): one job, one
 *   Mandate; the doctrine's verbs are exactly Approve / Reject / Improve.
 *
 * This module is the validation/merge half for every consumer.
 */

export const MASTERWORK_RULE_IMPROVER_MANDATE = MANDATE_KEYS.masterwork__rule_improver;

export interface RuleImproveResult {
  name: string;
  statement: string;
  rationale: string;
  detection: string;
  severity: RuleSeverity;
  section: string;
  /**
   * The decision shape (W58), when the rewrite carries one. A decision rule
   * handed to the Mandate comes back WITH its precondition / next action /
   * cost / risk — the rewrite is of the judgment, not only of the sentence
   * describing it. Absent on an ordinary rule.
   */
  policy?: RuleImprovePolicy;
}

/** The decision fields of a rewritten rule — the same closed sets the editor offers. */
export interface RuleImprovePolicy {
  precondition: string;
  next_action: string;
  action_kind: PolicyActionKind;
  cost: PolicyLevel;
  risk: PolicyLevel;
}

const POLICY_RESULT_KEYS = [
  "precondition",
  "next_action",
  "action_kind",
  "cost",
  "risk",
] as const;

function isActionKind(value: unknown): value is PolicyActionKind {
  return POLICY_ACTION_KINDS.some((option) => option.value === value);
}

function isPolicyLevel(value: unknown): value is PolicyLevel {
  return POLICY_LEVELS.some((option) => option.value === value);
}

/**
 * Read the decision fields off the Mandate's reply. `kind: "policy"` or any
 * of the five decision keys present means the agent is returning a decision
 * rule, and then every one of the five must be there and valid — a rewrite
 * that names a precondition but drops the cost would land a half-judgment the
 * Expert cannot review. Nothing present means an ordinary rule (`undefined`).
 */
function readPolicyResult(value: Record<string, unknown>): RuleImprovePolicy | undefined {
  const declared = value.kind === "policy";
  const present = POLICY_RESULT_KEYS.filter(
    (key) => value[key] !== undefined && value[key] !== null && value[key] !== "",
  );
  if (!declared && present.length === 0) return undefined;
  const missing = POLICY_RESULT_KEYS.filter((key) => !present.includes(key));
  if (missing.length > 0) {
    throw new Error(
      `The AI returned a decision rule without its ${missing.join(", ")} field(s).`,
    );
  }
  const precondition = value.precondition;
  const nextAction = value.next_action;
  if (typeof precondition !== "string" || typeof nextAction !== "string") {
    throw new Error("The AI returned an invalid precondition or next_action field.");
  }
  if (!isActionKind(value.action_kind)) {
    throw new Error("The AI returned an action_kind outside the allowed set.");
  }
  if (!isPolicyLevel(value.cost) || !isPolicyLevel(value.risk)) {
    throw new Error("The AI returned a cost or risk outside low / medium / high.");
  }
  if (!precondition.trim() || !nextAction.trim()) {
    throw new Error("The AI dropped the decision rule's precondition or next action.");
  }
  return {
    precondition: precondition.trim(),
    next_action: nextAction.trim(),
    action_kind: value.action_kind,
    cost: value.cost,
    risk: value.risk,
  };
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

  const policy = readPolicyResult(value);
  const result: RuleImproveResult = {
    name: requireString(value, "name"),
    statement: requireString(value, "statement"),
    rationale: requireString(value, "rationale"),
    detection: requireString(value, "detection"),
    severity,
    section,
    ...(policy ? { policy } : {}),
  };
  if (!result.name.trim() || !result.statement.trim()) {
    throw new Error("The AI dropped the rule name or the rule itself.");
  }
  return result;
}

/**
 * The decision fields the rewrite lands with. The reply's decision shape wins
 * when it carries one; a reply with none leaves a decision rule's stored
 * judgment exactly as it was (a prose-only rewrite never demotes a decision
 * rule to a statement), and an ordinary rule stays ordinary.
 */
function policyFieldsAfterImprove(
  current: Pick<RulebookRule, "kind" | "precondition" | "next_action" | "action_kind" | "cost" | "risk">,
  result: RuleImproveResult,
): Pick<RulebookRule, "kind" | "precondition" | "next_action" | "action_kind" | "cost" | "risk"> {
  if (result.policy) {
    return {
      kind: "policy",
      precondition: result.policy.precondition,
      next_action: result.policy.next_action,
      action_kind: result.policy.action_kind,
      cost: result.policy.cost,
      risk: result.policy.risk,
    };
  }
  if (current.kind === "policy") {
    return {
      kind: "policy",
      precondition: current.precondition,
      next_action: current.next_action,
      action_kind: current.action_kind,
      cost: current.cost,
      risk: current.risk,
    };
  }
  return {};
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
    ...policyFieldsAfterImprove(current, result),
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
    // A decision rule's precondition and next action are prose too, so a tidy
    // may polish them — but its action kind, cost and risk are the Expert's
    // classifications and stay frozen exactly like severity and section. A
    // tidy never adds or removes the decision shape.
    ...(current.isPolicy && result.policy
      ? {
          precondition: result.policy.precondition,
          nextAction: result.policy.next_action,
        }
      : {}),
  };
  if (!next.name || !next.statement) {
    throw new Error("AI cleanup removed the rule name or the rule statement.");
  }
  // No second guard on the decision prose: a reply that CARRIES a decision
  // shape has already been refused by `readPolicyResult` when either field is
  // blank, and a reply that carries none leaves the form's own values exactly
  // as they were — including the empty fields of a decision rule the Expert
  // has only just toggled on and not yet written (Bugbot, round 6).
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
    /**
     * The saved rule's form values. A draft carries only the keys it was
     * written with, so anything it omits — the W58 decision fields on a draft
     * written before they existed — reads from the live rule instead of being
     * silently blanked.
     */
    fallback: RuleFieldValues;
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
    // The decision fields (W58) ride the same snapshot as the prose. Each is
    // taken only when the stored value is one this form can actually produce;
    // anything else falls back to the saved rule.
    const policy: Partial<RuleFieldValues> = {};
    if (typeof candidate.isPolicy === "boolean") {
      policy.isPolicy = candidate.isPolicy;
    }
    if (typeof candidate.precondition === "string") {
      policy.precondition = candidate.precondition;
    }
    if (typeof candidate.nextAction === "string") {
      policy.nextAction = candidate.nextAction;
    }
    if (
      POLICY_ACTION_KINDS.some((option) => option.value === candidate.actionKind)
    ) {
      policy.actionKind = candidate.actionKind as PolicyActionKind;
    }
    if (POLICY_LEVELS.some((option) => option.value === candidate.cost)) {
      policy.cost = candidate.cost as PolicyLevel;
    }
    if (POLICY_LEVELS.some((option) => option.value === candidate.risk)) {
      policy.risk = candidate.risk as PolicyLevel;
    }

    return {
      mode,
      rule_id: ruleId,
      ...mergeRuleFieldValues(expected.fallback, {
        name: candidate.name,
        statement: candidate.statement,
        rationale: candidate.rationale,
        detection: candidate.detection,
        quote: candidate.quote,
        severity,
        section: candidate.section,
        ...policy,
      }),
    };
  };

  const fields = readSnapshot(value.fields);
  if (!fields) return null;
  return {
    fields,
    beforeTidy: readSnapshot(value.beforeTidy),
  };
}

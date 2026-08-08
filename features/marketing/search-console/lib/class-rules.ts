/**
 * Pattern-rule vocabulary for keyword classification — the pure, testable
 * layer under the rules panel (mirrors `lib/dig-rules.ts` for dig rules).
 * Matching itself is SERVER-side (`gsc_keyword_class_review` p_pattern/
 * p_match) — never re-implement a client matcher.
 */

import type { Database } from "@/types/database.types";
import type { GscTrafficClass } from "@/features/marketing/search-console/types";

export type KeywordClassRuleRow =
  Database["seo"]["Tables"]["keyword_class_rule"]["Row"];

export type ClassRuleMatchKind =
  | "contains"
  | "exact"
  | "starts_with"
  | "ends_with"
  | "word";

export const CLASS_RULE_MATCH_KINDS: readonly {
  key: ClassRuleMatchKind;
  label: string;
  description: string;
}[] = [
  { key: "contains", label: "Contains", description: "The phrase appears anywhere in the keyword." },
  { key: "word", label: "Contains word", description: "The phrase appears as a whole word (\"guide\" matches \"buyers guide\", not \"guidelines\")." },
  { key: "exact", label: "Exactly matches", description: "The keyword is exactly this phrase." },
  { key: "starts_with", label: "Starts with", description: "The keyword begins with the phrase." },
  { key: "ends_with", label: "Ends with", description: "The keyword ends with the phrase." },
];

export function isClassRuleMatchKind(value: unknown): value is ClassRuleMatchKind {
  return CLASS_RULE_MATCH_KINDS.some((k) => k.key === value);
}

export type ClassRuleTargetClass = Exclude<GscTrafficClass, "unclassified">;

export interface ClassRuleDraft {
  name: string;
  description: string;
  pattern: string;
  matchKind: ClassRuleMatchKind;
  targetClass: ClassRuleTargetClass;
  notes: string;
  autoApply: boolean;
}

export function ruleToDraft(rule: KeywordClassRuleRow): ClassRuleDraft {
  return {
    name: rule.name,
    description: rule.description ?? "",
    pattern: rule.pattern,
    matchKind: isClassRuleMatchKind(rule.match_kind) ? rule.match_kind : "contains",
    targetClass: (["money", "educational", "brand", "mismatch"] as const).includes(
      rule.target_class as ClassRuleTargetClass,
    )
      ? (rule.target_class as ClassRuleTargetClass)
      : "educational",
    notes: rule.notes ?? "",
    autoApply: rule.auto_apply,
  };
}

export function validateClassRule(draft: ClassRuleDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Name is required.");
  if (!draft.pattern.trim()) errors.push("Pattern is required.");
  if (draft.pattern.trim().length < 2) errors.push("Pattern must be at least 2 characters.");
  if (draft.targetClass === "mismatch" && !draft.notes.trim()) {
    errors.push("A mismatch rule must carry its reasoning in notes — every ruling it applies inherits it.");
  }
  return errors;
}

/** One-line human description, e.g. `starts with "how to" → Educational`. */
export function classRuleSummary(rule: {
  pattern: string;
  match_kind: string;
  target_class: string;
}): string {
  const kind = CLASS_RULE_MATCH_KINDS.find((k) => k.key === rule.match_kind);
  return `${(kind?.label ?? rule.match_kind).toLowerCase()} “${rule.pattern}” → ${rule.target_class}`;
}

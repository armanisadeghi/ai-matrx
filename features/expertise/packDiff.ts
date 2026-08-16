import type { PackPrinciple } from "./types";

/**
 * Rule-level diff between two states of one pack — the answer to "my desk was
 * built from v3, what changed since?".
 *
 * Only the COMPILED set matters for a desk: the aidream compiler
 * (services/expertise_desks/compile.py) drops every `draft` and `retired` rule
 * before authoring the auditors, so a new draft is not drift and a retired rule
 * IS. Drafts are reported separately as "waiting on you", never mixed into the
 * drift count — a badge that counts unapproved rules would tell the expert to
 * recompile for rules the desk would ignore anyway.
 *
 * Pure: no React, no supabase. The service fetches the two states; this decides
 * what changed.
 */

/** A rule the desk actually enforces: approved and not retired. */
export function isCompiled(rule: PackPrinciple): boolean {
  return rule.draft !== true && rule.retired !== true;
}

/** The fields that change what an auditor enforces. Cosmetic edits are not drift. */
const ENFORCED_FIELDS = [
  "statement",
  "detection",
  "severity",
  "section",
  "name",
] as const;

export type EnforcedField = (typeof ENFORCED_FIELDS)[number];

export interface RuleFieldChange {
  field: EnforcedField;
  before: string;
  after: string;
}

export interface ChangedRule {
  id: string;
  name: string;
  changes: RuleFieldChange[];
}

export interface PackDiff {
  /** Rules the desk would gain by recompiling. */
  added: PackPrinciple[];
  /** Rules the desk still enforces but the pack has retired or deleted. */
  removed: PackPrinciple[];
  /** Rules whose enforced wording changed under the desk's feet. */
  changed: ChangedRule[];
  /** Drafts awaiting approval — not drift, but the reason drift is coming. */
  pendingDrafts: PackPrinciple[];
  /** Total changes that would alter what the desk enforces. */
  driftCount: number;
}

function fieldValue(rule: PackPrinciple, field: EnforcedField): string {
  const value = rule[field];
  return typeof value === "string" ? value.trim() : "";
}

export function diffPrinciples(
  before: PackPrinciple[],
  after: PackPrinciple[],
): PackDiff {
  const beforeCompiled = new Map(
    before.filter(isCompiled).map((r) => [r.id, r] as const),
  );
  const afterCompiled = new Map(
    after.filter(isCompiled).map((r) => [r.id, r] as const),
  );

  const added: PackPrinciple[] = [];
  const changed: ChangedRule[] = [];
  for (const [id, rule] of afterCompiled) {
    const prior = beforeCompiled.get(id);
    if (!prior) {
      added.push(rule);
      continue;
    }
    const changes: RuleFieldChange[] = [];
    for (const field of ENFORCED_FIELDS) {
      const a = fieldValue(prior, field);
      const b = fieldValue(rule, field);
      if (a !== b) changes.push({ field, before: a, after: b });
    }
    if (changes.length > 0) {
      changed.push({ id, name: rule.name || id, changes });
    }
  }

  const removed: PackPrinciple[] = [];
  for (const [id, rule] of beforeCompiled) {
    if (!afterCompiled.has(id)) removed.push(rule);
  }

  const pendingDrafts = after.filter((r) => r.draft === true);

  return {
    added,
    removed,
    changed,
    pendingDrafts,
    driftCount: added.length + removed.length + changed.length,
  };
}

export const FIELD_LABELS: Record<EnforcedField, string> = {
  statement: "The rule",
  detection: "How a break is spotted",
  severity: "How serious",
  section: "Section",
  name: "Name",
};

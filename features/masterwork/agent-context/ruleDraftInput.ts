/**
 * `rule_draft` — the ONE validator for the Rulebook surface's write target.
 *
 * Shared because the Rulebook surface is mounted by more than one component:
 * `RulebookDetailPage` (the full workspace) and `RulebookLaneRoute` (every
 * `/masterwork/[id]/<lane>` route, including the Conductor's `/conduct`).
 * Both register the `rule_draft` handler, so both validate the agent's value
 * through this function — a second copy would drift into two contracts for one
 * declared target.
 *
 * Validate-then-apply: every check throws BEFORE any state is staged, so a bad
 * value reaches the agent verbatim (the writeback seam turns a throw into the
 * error envelope it reads) and nothing half-lands in the editor.
 */

import type { Rulebook, RulebookRule } from "../types";
import type { RulebookDraftSnapshot } from "./rulebookSurfaceScope";

export function requireRuleDraftInput(
  value: unknown,
  rulebook: Rulebook,
): {
  draft: Partial<RulebookDraftSnapshot>;
  initial: RulebookRule | undefined;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Rule draft must be an object.");
  }
  const input = value as Record<string, unknown>;
  if (input.mode !== "new" && input.mode !== "edit") {
    throw new Error('Rule draft mode must be "new" or "edit".');
  }

  const initial =
    input.mode === "edit"
      ? rulebook.rules.find(
          (rule) => rule.id === String(input.rule_id ?? "").trim(),
        )
      : undefined;
  if (input.mode === "edit" && !initial) {
    throw new Error(
      "Edit mode needs a rule_id that exists in the open Rulebook.",
    );
  }

  const draft: Partial<RulebookDraftSnapshot> = {
    mode: input.mode,
    rule_id: initial?.id ?? null,
  };
  for (const key of [
    "name",
    "statement",
    "rationale",
    "detection",
    "quote",
  ] as const) {
    const field = input[key];
    if (field === undefined) continue;
    if (typeof field !== "string") {
      throw new Error(`Rule draft ${key} must be text.`);
    }
    draft[key] = field;
  }
  if (input.severity !== undefined) {
    if (
      input.severity !== "critical" &&
      input.severity !== "major" &&
      input.severity !== "minor"
    ) {
      throw new Error("Rule draft severity must be critical, major, or minor.");
    }
    draft.severity = input.severity;
  }
  if (input.section !== undefined) {
    if (
      typeof input.section !== "string" ||
      !Object.hasOwn(rulebook.sections, input.section)
    ) {
      throw new Error(
        "Rule draft section must be one of the section codes in this Rulebook.",
      );
    }
    draft.section = input.section;
  }
  return { draft, initial };
}

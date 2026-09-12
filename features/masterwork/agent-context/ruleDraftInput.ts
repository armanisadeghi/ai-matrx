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

import {
  POLICY_ACTION_KINDS,
  POLICY_LEVELS,
  type Rulebook,
  type RulebookRule,
} from "../types";
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
  // MODE IS REQUIRED AND IT IS THE FIRST THING CHECKED.
  //
  // Wall W49-adjacent (2026-09-12): the Masterwork Conductor sent a complete,
  // well-reasoned rule with no `mode` at all and got back only
  // 'Rule draft mode must be "new" or "edit".' — a sentence that reads like a
  // wrong VALUE, not a missing FIELD, so it re-sent the same shape. An omission
  // and a bad value are different mistakes and now get different sentences,
  // each naming the field and stating what each mode needs. The tool's own
  // description (see the `rule_draft` target in
  // features/surfaces/manifests/masterwork-rulebook.manifest.ts) states the
  // same requirement, so a model should never reach either of these.
  if (input.mode === undefined || input.mode === null || input.mode === "") {
    throw new Error(
      'Rule draft is missing the required field "mode". Send mode: "new" to ' +
        'propose a new rule, or mode: "edit" together with a rule_id that ' +
        "already exists in this Rulebook.",
    );
  }
  if (input.mode !== "new" && input.mode !== "edit") {
    throw new Error(
      'Rule draft field "mode" must be exactly "new" or "edit" — got ' +
        `${JSON.stringify(input.mode)}.`,
    );
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
  // Every TEXT field of the ONE form set (`RuleFieldValues`), the W58 decision
  // fields included: a draft that only sends `precondition` / `nextAction`
  // used to be dropped on the floor, so the Conductor could not stage a
  // decision rule at all (Bugbot, ca7e6aba).
  for (const key of [
    "name",
    "statement",
    "rationale",
    "detection",
    "quote",
    "precondition",
    "nextAction",
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
  if (input.isPolicy !== undefined) {
    if (typeof input.isPolicy !== "boolean") {
      throw new Error(
        "Rule draft isPolicy must be true (a decision rule: precondition → " +
          "next action) or false (an ordinary rule).",
      );
    }
    draft.isPolicy = input.isPolicy;
  }
  if (input.actionKind !== undefined) {
    const kinds = POLICY_ACTION_KINDS.map((entry) => entry.value);
    if (
      typeof input.actionKind !== "string" ||
      !kinds.includes(input.actionKind as (typeof kinds)[number])
    ) {
      throw new Error(
        `Rule draft actionKind must be one of ${kinds.join(", ")}.`,
      );
    }
    draft.actionKind = input.actionKind as (typeof kinds)[number];
  }
  for (const key of ["cost", "risk"] as const) {
    const field = input[key];
    if (field === undefined) continue;
    const levels = POLICY_LEVELS.map((entry) => entry.value);
    if (
      typeof field !== "string" ||
      !levels.includes(field as (typeof levels)[number])
    ) {
      throw new Error(
        `Rule draft ${key} must be one of ${levels.join(", ")} — the ${key} OF THE ACTION, not of the situation.`,
      );
    }
    draft[key] = field as (typeof levels)[number];
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

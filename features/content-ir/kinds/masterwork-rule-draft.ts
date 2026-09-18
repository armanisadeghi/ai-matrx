/**
 * `masterwork_rule_draft` — THE VALUE CONTRACT for the Rulebook surface's
 * `rule_draft` write target.
 *
 * ## Why this kind exists
 *
 * `rule_draft` is a structured (`valueType: "object"`) write target: an agent
 * that reaches it is proposing a rule into the Expert's own Add/Edit Rule
 * dialog. Until this kind was registered the target had no `valueKind`, so the
 * only thing standing between a malformed value and the Expert's editor was
 * the page handler's own throw, and the only thing telling the model what to
 * send was prose. That is exactly the gap `pnpm check:surface-drift` counts
 * (the VALUE-CONTRACT RATCHET), and the gap this kind closes: the registered
 * `emitted_json_schema` is now advertised on the wire (the `apply_surface_write`
 * inline spec prints `[kind=masterwork_rule_draft {…}]`) and ENFORCED at the
 * seam (`applySurfaceWrite` → `validateAgainstKind`) before the Expert is ever
 * asked to approve.
 *
 * Opened as residue 2 of `aidream/docs/handoffs/delegated-surface-tools-2026-09-12.md`
 * (wall W49).
 *
 * ## THE CONTRACT IS DERIVED FROM THE VALIDATOR, NOT FROM A NICER IDEA
 *
 * The ONE validator both Rulebook mounts share is
 * `features/masterwork/agent-context/ruleDraftInput.ts`
 * (`requireRuleDraftInput`). Every field below mirrors what that function
 * actually accepts, and NOTHING here is stricter than it, because a contract
 * that refuses a value the page would have accepted is a new defect wearing a
 * schema:
 *
 *  - `mode` is the ONLY required field (the validator's first check, and the
 *    field whose absence produced the W49-adjacent wall).
 *  - every other field is OPTIONAL — a partial draft is legal and stages what
 *    it carries; the Expert fills the rest.
 *  - the enums are the live constants (`RULE_ACTION_KINDS`,
 *    `RULE_POLICY_LEVELS`), imported rather than retyped so they cannot drift.
 *
 * Two of the validator's checks are deliberately NOT expressible here and stay
 * with the validator, where they belong: `rule_id` in `mode: "edit"` must name
 * a rule that exists IN THE OPEN Rulebook, and `section` must be one of THAT
 * Rulebook's section codes. Both are facts about the page's live data, not
 * about the shape — a schema cannot know them.
 *
 * ## Data-only, on purpose
 *
 * A rule draft is an INPUT to a dialog, never a rendered artifact: the
 * approval card shows the proposed value and the editor shows the staged form.
 * The registered component (a `source='db'` output card, registered in the
 * same migration as this kind) exists so the shape renders honestly wherever a
 * `masterwork_rule_draft` payload surfaces in content — and because the
 * activation dual gate's render leg is not optional for a kind in this family.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { RULE_ACTION_KINDS, RULE_POLICY_LEVELS } from "@/features/masterwork/types";

/** The registered kind slug — named once, never spelled by hand elsewhere. */
export const MASTERWORK_RULE_DRAFT_KIND = "masterwork_rule_draft";

export const masterworkRuleDraftKindSchema: KindSchema = {
  kind: MASTERWORK_RULE_DRAFT_KIND,
  fields: {
    mode: {
      type: "enum",
      values: ["new", "edit"],
      required: true,
      description:
        'REQUIRED. "new" proposes a rule that does not exist yet; "edit" revises one that does and must carry rule_id.',
    },
    rule_id: {
      type: "string",
      description:
        'With mode "edit": the id of a rule that already exists in the open Rulebook. Ignored in mode "new".',
    },
    name: {
      type: "string",
      description: "The rule's short name, as it will read in the Rulebook.",
    },
    statement: {
      type: "string",
      description: "The rule itself, in one or two sentences.",
    },
    rationale: { type: "string", description: "Why the rule matters." },
    detection: {
      type: "string",
      description: "How you would catch someone breaking it.",
    },
    quote: {
      type: "string",
      description:
        "The Expert's own verbatim words this rule came from, when there are any.",
    },
    severity: {
      type: "enum",
      values: ["critical", "major", "minor"],
      description: "How bad breaking this rule is.",
    },
    section: {
      type: "string",
      description:
        "One of the section codes of the Rulebook that is open right now. The page refuses a code it does not have.",
    },
    isPolicy: {
      type: "boolean",
      description:
        "true for a DECISION rule — expert judgment under uncertainty, which carries precondition, nextAction, actionKind, cost and risk. false (or absent) for an ordinary rule.",
    },
    precondition: {
      type: "string",
      description:
        "DECISION rules: what is already known at the moment this rule applies.",
    },
    nextAction: {
      type: "string",
      description: "DECISION rules: the ONE next move to make.",
    },
    actionKind: {
      type: "enum",
      values: [...RULE_ACTION_KINDS],
      description: "DECISION rules: what kind of move the next action is.",
    },
    cost: {
      type: "enum",
      values: [...RULE_POLICY_LEVELS],
      description:
        "DECISION rules: the cost OF THE ACTION, not of the situation.",
    },
    risk: {
      type: "enum",
      values: [...RULE_POLICY_LEVELS],
      description:
        "DECISION rules: the risk OF THE ACTION, not of the situation.",
    },
  },
};

/**
 * Schema-only compiled definition (the `masterwork_checkup_rule` pattern): the
 * repo owns the SHAPE, the registry owns the row, and the rendering component
 * is a `source='db'` card rather than a compiled block — nothing in this repo
 * routes a rule draft through `block-dispatch`, and a compiled block nothing
 * reaches would be a dangling key, not a component.
 */
export const MASTERWORK_RULE_DRAFT_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: MASTERWORK_RULE_DRAFT_KIND,
    schemaSource: "system",
    tier: "eager",
    schema: masterworkRuleDraftKindSchema,
  },
];

/**
 * buildSurfaceWriteApprovalChange — the ONE place that turns an
 * `applySurfaceWrite` proposal into the `ApprovalChange` the inline approval
 * card renders.
 *
 * ## Why this is its own module
 *
 * It is pure: a proposal in, a descriptor out, no redux, no React, no network.
 * That lets the guard (`pnpm check:surface-approval-render`) run the REAL
 * builder over EVERY write target declared in `features/surfaces/manifests/**`
 * instead of a lookalike — the seam a census can only guard if it can call it.
 *
 * ## THE DEFECT THIS EXISTS TO PREVENT (cold walk 3, finding 4 — 2026-09-16)
 *
 * The Masterwork Conductor proposed a rule and the Expert was shown a card
 * headed "MASTERWORK CONDUCTOR · UPDATE · Rule draft" whose body was a
 * pretty-printed JSON block — `"__kind": "masterwork_rule_draft"`, `"mode"`,
 * `"statement"`, `"severity"` — with Apply / Keep as is underneath. The seam
 * did this:
 *
 *     fields: [{ label: "Proposed value", after: JSON.stringify(value, null, 2) }]
 *
 * That was not a fallback firing because nothing could render the value. It
 * was unconditional: `masterwork_rule_draft` is a REGISTERED, ACTIVE kind with
 * a component, and the target names it as its `valueKind` — but no renderer
 * ever read `valueKind`. Its only consumers were the model-facing tool spec and
 * the drift check. The machine was talking to itself in front of a person.
 *
 * ## THE RULE NOW
 *
 * A non-string proposed value NEVER becomes a string here. It travels as data
 * on `ApprovalChange.proposedValue`, and `<ApprovalCard>` renders it through
 * the ONE pipeline — `KindInstanceRender` → the kind registry → the kind's
 * component — exactly as the same payload renders in chat, in a run readout,
 * and on the Rulebook page. One shape, one component (streaming law 2).
 *
 * ## THE FALLBACK IS A DOCUMENT, NEVER A PAYLOAD
 *
 * When the value carries no `valueKind`, or names a kind nothing render-trusts
 * yet, the card still refuses to print JSON at a person. It falls to
 * `StructuredValueView` — the platform's structured floor, which renders any
 * JSON value as a labelled human document (humanized keys, prose through the
 * markdown renderer, uniform object arrays as a real table) and says in its own
 * muted footer that no custom view is registered, with the raw data one click
 * away. That is the best-in-class answer and the one THE FOURTH LAW allows: a
 * screen is absent or honest, never a developer artifact wearing a card.
 * Linear and Stripe show a human diff of a change; neither has ever shown the
 * request body. We already own that renderer — the defect was that this seam
 * ignored it, not that it did not exist (THE INVENTORY LAW).
 *
 * A STRING value keeps the text field it always had: a string proposed into a
 * text target is already prose, and `<ChangeDiff>` gives it a real word-level
 * diff that a document view cannot.
 */

import type { SurfaceWriteApprovalProposal } from "@/features/surfaces/runtime/surface-writeback";
import type { ApprovalChange } from "@/features/agents/ui-first-tools/ui/approval-types";

/**
 * What approving the write will actually do, in the user's terms. Stated per
 * `mode` because "approve" means three genuinely different things.
 */
function timingSentence(
  mode: SurfaceWriteApprovalProposal["target"]["mode"],
): string {
  if (mode === "entity") return "This saves immediately if approved.";
  if (mode === "draft") {
    return "Approval only stages it in the editor; you still review and save.";
  }
  return "Approval changes the current interface state.";
}

export function buildSurfaceWriteApprovalChange(
  proposal: SurfaceWriteApprovalProposal,
): ApprovalChange {
  const { target, value } = proposal;
  const who = proposal.actorLabel?.trim() || "The agent";
  const actor = proposal.actorLabel?.trim();

  const change: ApprovalChange = {
    verb: target.name.startsWith("append") ? "append" : "update",
    entity: "proposed change",
    title: target.label,
    description: `${who} proposed this change. ${target.description} ${timingSentence(target.mode)}`,
    ...(actor ? { actor } : {}),
    fields: [],
  };

  // A string is prose — the diff field renders it better than a document view.
  if (typeof value === "string") {
    return {
      ...change,
      fields: [
        {
          label: change.verb === "append" ? "Text to append" : target.label,
          ...(proposal.currentValue !== undefined
            ? { before: proposal.currentValue }
            : {}),
          after: value,
          block: true,
        },
      ],
    };
  }

  // Nothing proposed. Say so in words; an empty JSON literal is not an answer.
  if (value == null) {
    return {
      ...change,
      fields: [{ label: "Proposed value", after: null, block: true }],
    };
  }

  // THE FIX: structured values travel as DATA to the card, which renders them
  // through the kind pipeline (registered kind → its component) or the
  // structured floor. Never stringified here, and never stripped of `__kind`
  // — the marker stays in the payload (`check:kind-marker-law`); only its
  // PRESENTATION changes.
  return {
    ...change,
    proposedValue: {
      value,
      ...(target.valueKind ? { kind: target.valueKind } : {}),
    },
  };
}

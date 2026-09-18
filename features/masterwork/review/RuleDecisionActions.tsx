"use client";

// features/masterwork/review/RuleDecisionActions.tsx
//
// 🚨 THE FOUR VERBS — the ONE decision contract for every surface in the
// platform that puts an AI-proposed rule (or rule-shaped suggestion) in front
// of a human. Arman's standing law, restated 2026-08-18: "whenever a change is
// made or an enhancement is made, that enhancement needs to be made every
// single place that that code or logic exists." The Final Checkup shipped
// without Improve/Edit while the rule-review loop already had them — this
// component exists so that class of gap cannot happen again.
//
//   Approve — the ONLY thing that approves. Never a side effect of saving.
//   Reject  — with a written reason (transient; consumed by the rewrite).
//   Improve — the Expert says what should change and the
//             `masterwork.rule_improver` Mandate rewrites it, landing as a
//             DRAFT awaiting an explicit Approve (`useRuleImproveRun`).
//   Edit    — the Expert's own hand. Saving an edit is NEVER approving.
//
// Every handler is REQUIRED. A surface that cannot wire one of the four has
// not finished thinking about its own review loop — that is the point. Labels
// are overridable because a pre-save surface says "Add as a draft" where the
// review queue says "Approve"; the VERBS are not overridable.
//
// Full state matrix: features/masterwork/FEATURE.md § The review-verb matrix.
//
// 🚨 THE EXPERT'S WORDING (2026-09-15). `vocabulary="ownership"` relabels the
// SAME verbs as "Mine / Not mine / Mine but wrong" — doctrine CORE.md §5. The
// verbs, their handlers and the statuses they write are untouched; only the
// words change, and which word each verb wears is declared in ONE place
// (`./vocabulary.ts`), never typed into a surface. `request changes` is the
// third ownership word, so the row accepts an OPTIONAL `onRequestChanges` and
// renders it beside the other four when a surface supplies it — a surface that
// keeps the change request in an expanded panel simply omits it.

import {
  CheckCircle2,
  MessageSquareText,
  MessageSquareWarning,
  Pencil,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  REVIEW_VOCABULARY_LABELS,
  REVIEW_VOCABULARY_TITLES,
  type ReviewVocabulary,
} from "./vocabulary";

export type RuleDecisionVerb =
  | "approve"
  | "improve"
  | "reject"
  | "edit"
  | "requestChanges";

export interface RuleDecisionActionsProps {
  onApprove: () => void;
  /** Opens this surface's Improve path — never a second rewrite path. */
  onImprove: () => void;
  /** Opens this surface's reason-capture; a reason is mandatory downstream. */
  onReject: () => void;
  onEdit: () => void;
  /**
   * "Mine but wrong" / "Request changes". OPTIONAL because a surface may keep
   * it in an expanded panel; when supplied it renders in the row, which is
   * what the ownership wording needs (all three ownership words together).
   */
  onRequestChanges?: () => void;
  /** Which words the four verbs wear. Defaults to the standard set. */
  vocabulary?: ReviewVocabulary;
  /** Disable everything (a save in flight, an agent mid-run). */
  disabled?: boolean;
  /** Disable individual verbs that are momentarily impossible. */
  disabledVerbs?: Partial<Record<RuleDecisionVerb, boolean>>;
  /** Per-surface wording. The verb, its icon and its order never change. */
  labels?: Partial<Record<RuleDecisionVerb, string>>;
  size?: "sm" | "default";
  className?: string;
}

function defaultLabels(
  vocabulary: ReviewVocabulary,
): Record<RuleDecisionVerb, string> {
  const words = REVIEW_VOCABULARY_LABELS[vocabulary];
  return {
    approve: words.approve,
    improve: words.improve,
    reject: words.reject,
    edit: words.edit,
    requestChanges: words.requestChanges,
  };
}

function titles(vocabulary: ReviewVocabulary): Record<RuleDecisionVerb, string> {
  const words = REVIEW_VOCABULARY_TITLES[vocabulary];
  return {
    approve: words.approve,
    improve:
      "Say what should change — the AI rewrites it and it comes back as a draft for your approval.",
    reject: words.reject,
    edit: "Change it yourself. Saving an edit does not approve it.",
    requestChanges: words.requestChanges,
  };
}

/**
 * The four verbs, always in this order, always all four. Icons rely on the
 * Button's own `gap-2` — never add `mr-*` to a button icon (icon + gap +
 * margin was the "giant gap" defect).
 */
export function RuleDecisionActions({
  onApprove,
  onImprove,
  onReject,
  onEdit,
  onRequestChanges,
  vocabulary = "standard",
  disabled = false,
  disabledVerbs,
  labels,
  size = "default",
  className,
}: RuleDecisionActionsProps) {
  const fallbackLabels = defaultLabels(vocabulary);
  const verbTitles = titles(vocabulary);
  const label = (verb: RuleDecisionVerb) =>
    labels?.[verb] ?? fallbackLabels[verb];
  const off = (verb: RuleDecisionVerb) =>
    disabled || disabledVerbs?.[verb] === true;
  const heightClass = size === "sm" ? "h-7" : undefined;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        size={size}
        className={heightClass}
        onClick={onApprove}
        disabled={off("approve")}
        title={verbTitles.approve}
      >
        <CheckCircle2 className="h-4 w-4" />
        {label("approve")}
      </Button>
      {/* "Mine but wrong" sits where the Expert reads it — between "mine" and
          "not mine" — and only when the surface handed us the handler. */}
      {onRequestChanges ? (
        <Button
          size={size}
          variant="outline"
          className={heightClass}
          onClick={onRequestChanges}
          disabled={off("requestChanges")}
          title={verbTitles.requestChanges}
        >
          <MessageSquareWarning className="h-4 w-4" />
          {label("requestChanges")}
        </Button>
      ) : null}
      <Button
        size={size}
        variant="outline"
        className={heightClass}
        onClick={onImprove}
        disabled={off("improve")}
        title={verbTitles.improve}
      >
        <MessageSquareText className="h-4 w-4" />
        {label("improve")}
      </Button>
      <Button
        size={size}
        variant="outline"
        className={heightClass}
        onClick={onReject}
        disabled={off("reject")}
        title={verbTitles.reject}
      >
        <XCircle className="h-4 w-4" />
        {label("reject")}
      </Button>
      <Button
        size={size}
        variant="outline"
        className={heightClass}
        onClick={onEdit}
        disabled={off("edit")}
        title={verbTitles.edit}
      >
        <Pencil className="h-4 w-4" />
        {label("edit")}
      </Button>
    </div>
  );
}

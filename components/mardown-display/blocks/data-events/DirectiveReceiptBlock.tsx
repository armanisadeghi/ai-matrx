"use client";
import React from "react";
import { AlertTriangle, Check, CircleSlash, Clock, RotateCcw } from "lucide-react";

/**
 * DirectiveReceiptBlock — what the directive actually DID, in a sentence.
 *
 * WHY IT EXISTS. Observed live 2026-09-12 (walk K-1): an agent wrote one project
 * and four tasks into a user's organization, and the only thing on screen was
 * the request re-rendered as a card badged `Ready` — the same card, the same
 * badge, whether the write had just landed, whether the identical re-send had
 * been deduped to nothing, or whether nothing had been applied at all. A person
 * who sent the same request twice saw two identical cards and could not tell
 * that the second one wrote nothing.
 *
 * 🚨 THE SENTENCE IS THE SERVER'S, VERBATIM. `message` is authored by
 * `aidream/services/output_directives/receipt_words.py` and rides the
 * `directive_apply.*` receipt event. This component never composes, guesses,
 * pluralizes or "improves" it: only the server knows whether the ledger
 * replayed, what the write-tree touched, or what the handler called it. If this
 * card ever reads wrong, the fix is in that module — not here.
 *
 * The outcome only chooses the icon and the tone.
 *
 * 🚨 AND NOTHING ELSE IS COMPOSED HERE EITHER (V-19, 2026-09-12). The first cut
 * of this card printed a second line — "{N} {resource_kind}s affected" — from
 * `resource_ids.length`. For the real `create_project_with_tasks` receipt that
 * reads **"5 projects affected"** for one project and four tasks, because the
 * five ids all ride under `resource_kind: "project"`. That is the exact
 * derivation the server-side design rejected as a confident lie, reintroduced
 * on the client, under a sentence that was already correct. A screen never
 * lies: the sentence is the whole card. `resourceIds` is kept only as data on
 * the element, for linking later.
 */

export type DirectiveReceiptOutcome =
  | "proposed"
  | "applied"
  | "already_applied"
  | "failed"
  | "blocked";

export interface DirectiveReceiptBlockProps {
  /** The directive SLUG — the one identity. */
  directive: string;
  outcome: DirectiveReceiptOutcome;
  /** The server's own sentence. Rendered verbatim, and it is the ONLY prose. */
  message: string;
  /** Carried for linking/diagnostics — NEVER counted into a sentence. */
  resourceKind?: string;
  resourceIds?: string[];
}

const OUTCOME_STYLE: Record<
  DirectiveReceiptOutcome,
  { Icon: typeof Check; tone: string; label: string }
> = {
  applied: { Icon: Check, tone: "text-primary", label: "Done" },
  already_applied: {
    Icon: RotateCcw,
    tone: "text-muted-foreground",
    label: "Already done",
  },
  proposed: { Icon: Clock, tone: "text-amber-600 dark:text-amber-500", label: "Waiting for you" },
  failed: { Icon: AlertTriangle, tone: "text-destructive", label: "Failed" },
  blocked: { Icon: CircleSlash, tone: "text-destructive", label: "Not applied" },
};

const DirectiveReceiptBlock: React.FC<DirectiveReceiptBlockProps> = ({
  directive,
  outcome,
  message,
  resourceKind,
  resourceIds,
}) => {
  const style = OUTCOME_STYLE[outcome] ?? OUTCOME_STYLE.applied;
  const { Icon } = style;

  return (
    <div
      className="my-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
      data-directive={directive}
      data-outcome={outcome}
      data-resource-kind={resourceKind || undefined}
      data-resource-count={resourceIds?.length ?? undefined}
    >
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${style.tone}`} />
        {/* The server's sentence, verbatim — the whole point of the card. */}
        <span className="min-w-0 flex-1 text-foreground">{message}</span>
        <span className={`shrink-0 text-xs ${style.tone}`}>{style.label}</span>
      </div>
    </div>
  );
};

export default DirectiveReceiptBlock;

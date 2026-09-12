"use client";

// features/masterwork/components/detail/RuleEvidenceDisclosure.tsx
//
// 🚨 THE EVIDENCE STANDING, the Expert's half (2026-09-12).
//
// On 2026-09-12 the body-of-work lane turned 20 published pieces into 416
// per-piece draft rules plus 4 synthesized cross-piece rules, and every one of
// the 420 landed as "Waiting on you". Nobody reviews 416 rules one at a time,
// and the page offered only Approve-all or one-by-one — so the Expert pressed
// Approve-all, which is the failure the review lane exists to prevent.
//
// Per-piece rules are now EVIDENCE: the proof behind the pattern, reached from
// the synthesized rule that cites them, never a queue of questions. This is the
// door to them. It is a disclosure, closed by default, exactly the shape of
// `@ai-matrx/design-system`'s `ArchivedDisclosure` — deliberately not that
// component, whose icon and vocabulary say "archived", which this is not. There
// is no new list shell here: the rows are plain statements with one verb.
//
// THE NO-DEAD-ENDS RULE: every count on this control is the true number, and a
// zero renders nothing rather than an empty promise.

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { evidenceSupport, type RulebookRule } from "../../types";

export function RuleEvidenceDisclosure({
  evidence,
  canEdit,
  onPromote,
  label = "Proven by",
  className,
}: {
  /** The evidence rules behind this pattern. Empty renders nothing. */
  evidence: readonly RulebookRule[];
  canEdit: boolean;
  /**
   * Raise one observation to a rule the Expert is asked about. It changes
   * standing only — the rule stays a draft awaiting their Approve, and not one
   * word of it changes.
   */
  onPromote: (rule: RulebookRule) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (evidence.length === 0) return null;
  const pieces = new Set(
    evidence
      .map((rule) => rule.source_ref?.corpus_piece)
      .filter((piece): piece is string => Boolean(piece)),
  ).size;
  return (
    <div className={cn("space-y-1.5", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <FileText className="h-3.5 w-3.5" />
        {label} {pieces} {pieces === 1 ? "piece" : "pieces"} — see{" "}
        {evidence.length === 1 ? "it" : "them"}
      </button>
      {open ? (
        <ul className="space-y-1.5 border-l-2 border-border pl-3">
          {evidence.map((rule) => (
            <li
              key={rule.id}
              className="flex items-start justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-xs text-foreground">{rule.statement}</p>
                <p className="text-[11px] text-muted-foreground">
                  {rule.source_ref?.corpus_piece ?? "this body of work"}
                  {evidenceSupport(rule) > 1
                    ? ` · seen in ${evidenceSupport(rule)} pieces`
                    : null}
                </p>
              </div>
              {canEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 px-2 text-[11px]"
                  onClick={() => onPromote(rule)}
                  title="Make this a rule of its own, waiting for your approval. Nothing about it changes."
                >
                  <Plus className="h-3 w-3" />
                  Make it a rule
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

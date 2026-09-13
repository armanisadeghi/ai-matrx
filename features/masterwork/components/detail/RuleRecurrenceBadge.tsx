"use client";

// features/masterwork/components/detail/RuleRecurrenceBadge.tsx
//
// 🚨 RECURRENCE IS A BADGE, NEVER A GATE (2026-09-12).
//
// This file replaces `RuleEvidenceDisclosure`, which existed for a few hours
// and hid every rule a single piece of a body of work produced until the same
// judgment recurred across three pieces. That answer was the wrong class: a
// judgment stated once is a rule, and treating the non-consensus one as
// not-yet-real is the consensus trap the whole lane exists to avoid.
//
// What survives is the honest half — how often the author repeats a judgment
// across their own work is genuinely useful to an Expert scanning a long
// Rulebook. So it is shown, and it decides nothing. The threshold comes from
// `masterwork_distillation.recurrence_badge_pieces` (the renamed promotion
// knob); an organization can badge more or fewer rules, and no setting of it
// can hide one.
//
// THE NO-DEAD-ENDS RULE: the count is the true number of DISTINCT pieces, and
// below the threshold this renders nothing rather than a badge that says "1".

import { useEffect, useState } from "react";
import { Repeat } from "lucide-react";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { cn } from "@/lib/utils";
import { recurrencePieces, type RulebookRule } from "../../types";

export const RECURRENCE_KNOB_FEATURE = "masterwork_distillation";
export const RECURRENCE_KNOB_KEY = "recurrence_badge_pieces";

/**
 * The badge threshold, or `null` while it is still loading or if the register
 * could not be reached. `null` renders NO badge — a stand-in number here would
 * be an opinion nobody set.
 */
export function useRecurrenceThreshold(): number | null {
  const [threshold, setThreshold] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void knobInt(RECURRENCE_KNOB_FEATURE, RECURRENCE_KNOB_KEY)
      .then((value) => {
        if (!cancelled) setThreshold(value);
      })
      .catch(() => {
        // A knob the register cannot answer for shows no badge at all. It
        // never hides a rule, so there is nothing to announce to the Expert.
        if (!cancelled) setThreshold(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return threshold;
}

export function RuleRecurrenceBadge({
  rule,
  threshold,
  className,
}: {
  rule: RulebookRule;
  /** From `useRecurrenceThreshold`. `null` renders nothing. */
  threshold: number | null;
  className?: string;
}) {
  const pieces = recurrencePieces(rule);
  if (threshold === null || pieces < threshold) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
        className,
      )}
      title={`This judgment appears in ${pieces} different pieces of this source. It is shown so you can see what the author repeats — it changes nothing about the rule.`}
    >
      <Repeat className="h-3 w-3" />
      Seen in {pieces} pieces
    </span>
  );
}

/**
 * The OTHER ways this rule's own source stated the same judgment, kept when a
 * second piece repeated it. Neither expression wins, so both are readable.
 */
export function RuleKeptExpressions({ rule }: { rule: RulebookRule }) {
  const kept = rule.source_ref?.quotes ?? [];
  if (kept.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">
        Also said, in another piece
      </div>
      <ul className="space-y-1 border-l-2 border-border pl-3">
        {kept.map((expression, index) => (
          <li key={`${expression.piece ?? index}-${index}`}>
            <p className="text-xs text-foreground">{expression.statement}</p>
            {expression.quote ? (
              <blockquote className="text-[11px] italic text-muted-foreground">
                “{expression.quote}”
              </blockquote>
            ) : null}
            {expression.piece ? (
              <p className="text-[11px] text-muted-foreground">
                {expression.piece}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

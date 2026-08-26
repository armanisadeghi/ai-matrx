"use client";

// features/masterwork/encore/AuditionProof.tsx
//
// THE PROOF, in Operator words.
//
// Encore's whole pitch is "this runs with a real expert's judgment built in".
// The Audition is the only thing that makes that checkable: the Masterwork's
// output was judged, rule by rule, against work the Expert actually published,
// and — when the three-way harness ran — against a raw model with no Rulebook
// at all. Until 2026-08-19 an Operator never saw a word of it.
//
// Honest by construction: no audition, no line (never "unproven" theatre, never
// a reassuring badge with nothing behind it). The scale is stated because a
// bare "25" reads as a failure when 50 is parity with a published expert.

import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";

export interface AuditionProofProps {
  /** 0-100, judged against the Expert's own reference. 50 = parity. */
  score: number | null;
  /** The judge's plain sentence about the vanilla-AI arm, when there was one. */
  verdict?: string | null;
  /** When the audition ran — a score with no date is not evidence. */
  auditionedAt?: string | null;
  /** `line` for a card; `panel` for the run page (adds the verdict + date). */
  variant?: "line" | "panel";
  className?: string;
}

export function AuditionProof({
  score,
  verdict = null,
  auditionedAt = null,
  variant = "line",
  className,
}: AuditionProofProps) {
  if (score === null) return null;

  const rounded = Math.round(score);
  const headline = `Expert match ${rounded}/100`;

  if (variant === "line") {
    return (
      <p
        className={cn(
          "flex items-center gap-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{headline}</span>
      </p>
    );
  }

  return (
    <div className={cn("mt-3", className)}>
      <p
        className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground"
        title="50 means it matched the expert's published work"
      >
        <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{headline}</span>
        {auditionedAt ? (
          <span className="font-normal text-muted-foreground">
            · {formatRelativeTime(auditionedAt)}
          </span>
        ) : null}
      </p>
      {/* The judge's own sentence is the strongest thing on this page — it is
          the head-to-head against a plain AI with none of this expertise. */}
      {verdict ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {verdict}
        </p>
      ) : null}
    </div>
  );
}

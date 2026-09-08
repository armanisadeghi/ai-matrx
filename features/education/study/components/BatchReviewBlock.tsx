"use client";

// features/education/study/components/BatchReviewBlock.tsx
//
// THE render for an end-of-session review — the `batch_review` kind the
// `flashcards.review_batch` / `education.spoken_practice_review` mandates emit
// (summary, strengths, weaknesses, revisit ids, secondary score, reorder),
// drawn by the kind's registered component (`batch_review_professor_panel`)
// through the canonical kind render path (KindInstanceRender →
// applyIrKindRoute). One shape, one component: the coach panel, the spoken-
// practice summary and the study-deck completion screen all mount THIS —
// each used to carry its own hand-built card that showed a different subset
// of the same object (THE CANONICAL COMPONENT LAW, content-ir FEATURE.md).
//
// The host keeps only STATE chrome around it (pending face, read-aloud
// control); the kind owns the frame, the score ring and the sections.

import { cn } from "@/lib/utils";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import type { BatchReview } from "@/features/content-ir/kinds/generated/kinds.generated";
import type { ParsedSessionReview } from "../utils/parseSessionReview";

export const BATCH_REVIEW_KIND = "batch_review" as const;

/** The parsed review, back in the kind's own wire shape (derived, never re-declared). */
export function batchReviewValue(review: ParsedSessionReview): BatchReview {
  return {
    __kind: BATCH_REVIEW_KIND,
    summary: review.summary,
    strengths: review.strengths,
    weaknesses: review.weaknesses,
    revisit_card_ids: review.revisitCardIds,
    reorder: review.reorder,
    ...(review.secondaryScore != null
      ? { secondary_score: review.secondaryScore }
      : {}),
  };
}

export function BatchReviewBlock({
  review,
  className,
}: {
  review: ParsedSessionReview;
  className?: string;
}) {
  return (
    <div className={cn("w-full text-left", className)}>
      <KindInstanceRender
        kind={BATCH_REVIEW_KIND}
        value={batchReviewValue(review)}
        variant="bare"
        showRoutingNote={false}
        // Registry floor: a held/cold component must never put a JSON
        // document in front of a learner who just finished a session.
        unroutableFallback={<PlainReview review={review} />}
      />
    </div>
  );
}

function PlainReview({ review }: { review: ParsedSessionReview }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 text-sm">
      <p className="leading-relaxed text-foreground">{review.summary}</p>
      {review.strengths.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Strengths</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground">
            {review.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {review.weaknesses.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Areas to improve
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-foreground">
            {review.weaknesses.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

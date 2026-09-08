"use client";

// features/education/assessment/components/GradedAnswerBlock.tsx
//
// THE verdict render for a graded assessment answer — the `answer_grade` kind
// (typed, handwritten and objective paths all land in the same `GradedAnswer`),
// drawn by the kind's registered component (`answer_grade_verdict`) through
// the canonical kind render path (KindInstanceRender → applyIrKindRoute).
// Mounted by the take-assessment feedback block and the standalone grade-work
// surface, which used to carry two field-for-field copies of the same verdict
// pill + misconception + explanation + transcription (THE CANONICAL COMPONENT
// LAW, content-ir FEATURE.md). Spoken answers have the same block in
// flashcards (`AnswerGradeBlock`) — same kind, same component.
//
// The per-step breakdown (`steps`) is not part of the kind; the host renders
// `StepBreakdown` beneath this block.

import { cn } from "@/lib/utils";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import type { AnswerGrade } from "@/features/content-ir/kinds/generated/kinds.generated";
import type { GradedAnswer } from "../data/grading";

export const ANSWER_GRADE_KIND = "answer_grade" as const;

/** The graded answer, back in the kind's own wire shape (derived, never re-declared). */
export function gradedAnswerValue(graded: GradedAnswer): AnswerGrade {
  return {
    __kind: ANSWER_GRADE_KIND,
    result: graded.result,
    correct: graded.result === "correct",
    partial: graded.result === "partial",
    score: graded.scoreValue,
    explanation: graded.explanation,
    misconception: graded.misconception,
    transcript: graded.transcription ?? null,
  };
}

export function GradedAnswerBlock({
  graded,
  className,
}: {
  graded: GradedAnswer;
  className?: string;
}) {
  return (
    <div className={cn("w-full text-left", className)}>
      <KindInstanceRender
        kind={ANSWER_GRADE_KIND}
        value={gradedAnswerValue(graded)}
        variant="bare"
        showRoutingNote={false}
        // Registry floor: a held/cold component must never put a JSON
        // document in front of a learner who just answered.
        unroutableFallback={<PlainGrade graded={graded} />}
      />
    </div>
  );
}

const RESULT_LABEL: Record<GradedAnswer["result"], string> = {
  correct: "Correct",
  partial: "Partial credit",
  incorrect: "Incorrect",
};

function PlainGrade({ graded }: { graded: GradedAnswer }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="w-fit rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground">
        {RESULT_LABEL[graded.result]}
      </span>
      {graded.misconception && (
        <p className="text-amber-700 dark:text-amber-300">
          <span className="font-medium">Watch out:</span> {graded.misconception}
        </p>
      )}
      {graded.explanation && (
        <p className="text-muted-foreground">{graded.explanation}</p>
      )}
      {graded.transcription && (
        <details className="rounded-lg border border-border bg-muted/40 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-muted-foreground">
            What we read from your photo
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-foreground">
            {graded.transcription}
          </pre>
        </details>
      )}
    </div>
  );
}

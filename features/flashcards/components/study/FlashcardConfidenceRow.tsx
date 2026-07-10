// features/flashcards/components/study/FlashcardConfidenceRow.tsx
//
// The one-tap 1–5 CONFIDENCE rating row (Brainscape's most loved interaction,
// on our stronger FSRS engine). Each tap is a self-rated recall confidence —
// 1 "No idea" → 5 "Knew it cold" — which the study spine turns into an FSRS
// grade (uniquely reaching Easy(4)) via `studyService.recordAttempt({ confidence })`.
// Presentational only: it emits the raw 1–5 value; the driver owns persistence.
//
// Shares the study surface with the 3-way <FlashcardGradeButtonRow/>; the deck
// lets the learner pick which they prefer (StudyDeck's grade-style toggle).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import type { Confidence } from "@/lib/srs/fsrs";
import { cn } from "@/lib/utils";

/** The 5 confidence steps, low → high, with their tap label + color treatment. */
const CONFIDENCE_STEPS: {
  value: Confidence;
  label: string;
  hint: string;
  classes: string;
}[] = [
  {
    value: 1,
    label: "No idea",
    hint: "Blanked — didn't recall it",
    classes:
      "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60",
  },
  {
    value: 2,
    label: "Barely",
    hint: "Guessed / very unsure",
    classes:
      "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-950/60",
  },
  {
    value: 3,
    label: "Shaky",
    hint: "Half-remembered",
    classes:
      "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60",
  },
  {
    value: 4,
    label: "Knew it",
    hint: "Recalled it with some effort",
    classes:
      "border-lime-300 bg-lime-50 text-lime-700 hover:bg-lime-100 dark:border-lime-800 dark:bg-lime-950/40 dark:text-lime-300 dark:hover:bg-lime-950/60",
  },
  {
    value: 5,
    label: "Knew it cold",
    hint: "Instant, effortless",
    classes:
      "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300 dark:hover:bg-green-950/60",
  },
];

export const FLASHCARD_CONFIDENCE_STEPS = CONFIDENCE_STEPS;

/**
 * The canonical 1–5 confidence rating row. Tapping a step reports its value;
 * keyboard 1–5 is wired by the deck (which owns focus + the flip gate).
 */
export function FlashcardConfidenceRow({
  onRate,
  disabled = false,
  className,
}: {
  onRate: (confidence: Confidence) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex items-center justify-between px-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
        <span>How well did you know it?</span>
      </div>
      <div className="flex min-w-0 items-stretch gap-0.5 sm:gap-1">
        {CONFIDENCE_STEPS.map((step) => (
          <button
            key={step.value}
            type="button"
            onClick={() => onRate(step.value)}
            disabled={disabled}
            title={`${step.value} — ${step.label}: ${step.hint}`}
            aria-label={`Confidence ${step.value}: ${step.label}`}
            className={cn(
              "inline-flex min-h-11 flex-1 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 font-medium transition-colors disabled:opacity-50",
              step.classes,
            )}
          >
            <span className="text-sm font-semibold tabular-nums">
              {step.value}
            </span>
            <span className="truncate text-[10px] leading-tight">
              {step.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

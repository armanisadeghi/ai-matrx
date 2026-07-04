"use client";

import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewResult } from "../../types";

export const FLASHCARD_GRADE_RESULTS: ReviewResult[] = [
  "incorrect",
  "partial",
  "correct",
];

const GRADE_CONFIG: Record<
  ReviewResult,
  { label: string; icon: typeof XCircle; classes: string }
> = {
  incorrect: {
    label: "Again",
    icon: XCircle,
    classes:
      "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60",
  },
  partial: {
    label: "Partial",
    icon: AlertCircle,
    classes:
      "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60",
  },
  correct: {
    label: "Correct",
    icon: CheckCircle2,
    classes:
      "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300 dark:hover:bg-green-950/60",
  },
};

export type FlashcardGradeButtonSize = "default" | "compact" | "embedded";

const SIZE_CLASSES: Record<FlashcardGradeButtonSize, string> = {
  default: "min-h-9 flex-1 min-w-0 px-2 py-1.5 text-xs rounded-lg gap-1",
  compact: "h-7 flex-1 min-w-0 px-1.5 text-[11px] rounded-md gap-0.5",
  embedded:
    "flex-1 min-w-0 px-1.5 py-1 text-[11px] rounded-md gap-0.5 border-0",
};

const EMBEDDED_OVERRIDES: Record<ReviewResult, string> = {
  incorrect:
    "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60",
  partial:
    "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60",
  correct:
    "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60",
};

export function FlashcardGradeButton({
  result,
  onGrade,
  disabled = false,
  size = "default",
  className,
}: {
  result: ReviewResult;
  onGrade: (r: ReviewResult) => void;
  disabled?: boolean;
  size?: FlashcardGradeButtonSize;
  className?: string;
}) {
  const { label, icon: Icon, classes } = GRADE_CONFIG[result];

  return (
    <button
      type="button"
      onClick={() => onGrade(result)}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center border font-medium whitespace-nowrap transition-colors disabled:opacity-50",
        SIZE_CLASSES[size],
        size === "embedded" ? EMBEDDED_OVERRIDES[result] : classes,
        className,
      )}
    >
      <Icon
        className={cn(
          "shrink-0",
          size === "default" ? "h-3.5 w-3.5" : "h-3 w-3",
        )}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Canonical row of Again / Partial / Correct grade actions. */
export function FlashcardGradeButtonRow({
  onGrade,
  disabled = false,
  size = "default",
  className,
}: {
  onGrade: (r: ReviewResult) => void;
  disabled?: boolean;
  size?: FlashcardGradeButtonSize;
  className?: string;
}) {
  return (
    <div
      className={cn("flex min-w-0 items-stretch gap-0.5 sm:gap-1", className)}
    >
      {FLASHCARD_GRADE_RESULTS.map((result) => (
        <FlashcardGradeButton
          key={result}
          result={result}
          onGrade={onGrade}
          disabled={disabled}
          size={size}
        />
      ))}
    </div>
  );
}

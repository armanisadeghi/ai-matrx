"use client";

// features/education/library/components/StudyProgressBar.tsx
//
// How much of an artifact the learner has actually worked through, and how well
// it went. Two facts in one bar: FILL = coverage (items attempted ÷ items),
// COLOUR = accuracy on what they attempted. A learner reads "I'm halfway
// through and doing fine" without parsing two numbers.
//
// Renders nothing when the artifact has never been studied — an empty 0% bar on
// a brand-new deck reads as failure rather than as "not started".

import { cn } from "@/lib/utils";

interface Props {
  /** Items attempted at least once. */
  studied: number;
  /** Items in the artifact. Null when the format has no countable unit. */
  total: number | null;
  /** Lifetime correct ÷ attempts, 0–1. Null until the first attempt. */
  accuracy: number | null;
  className?: string;
}

/**
 * Accuracy bands. Deliberately generous at the bottom: a student who is at 45%
 * on new material is learning, not failing, and colouring that red is how a
 * study app teaches someone to avoid it.
 */
function accuracyTone(accuracy: number): string {
  if (accuracy >= 0.8) return "bg-emerald-500";
  if (accuracy >= 0.5) return "bg-sky-500";
  return "bg-amber-500";
}

export function StudyProgressBar({ studied, total, accuracy, className }: Props) {
  if (studied <= 0) return null;
  const coverage =
    total && total > 0 ? Math.min(1, studied / total) : 1;
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(coverage * 100)}
      aria-label={
        total
          ? `${studied} of ${total} studied`
          : `${studied} items studied`
      }
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width]",
          accuracy == null ? "bg-sky-500" : accuracyTone(accuracy),
        )}
        style={{ width: `${Math.max(4, coverage * 100)}%` }}
      />
    </div>
  );
}

"use client";

// features/education/study/components/CoachReviewPanel.tsx
//
// Shared Coach's review card — summary, optional strengths/weaknesses, and the
// canonical read-aloud control (SpeakerButton). Used on the FastFire scoreboard
// and the persisted session detail view.
//
// The waiting face is never a bare spinner: either the run is streaming in the
// floating window (`watching`) and this says so, or nothing is running and the
// card offers the one-click way to produce it (`onGenerate`) — no dead end.

import { GraduationCap, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpeakerButton } from "@/features/tts/components/SpeakerButton";
import type { ParsedSessionReview } from "../utils/parseSessionReview";

export function CoachReviewPanel({
  review,
  pending = false,
  watching = false,
  onGenerate,
  generating = false,
}: {
  review: ParsedSessionReview | null;
  /** The session should have a review and doesn't yet. */
  pending?: boolean;
  /** A run is live and streaming in the floating window right now. */
  watching?: boolean;
  /** Run it now — offered when nothing is live and no review landed. */
  onGenerate?: () => void;
  generating?: boolean;
}) {
  if (pending && !review) {
    return (
      <section className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-200">
          <GraduationCap className="h-4 w-4" />
          Coach&apos;s review
        </div>
        {watching || generating ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-blue-900/80 dark:text-blue-200/80">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Writing your review — watch it in the run window.
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-xs text-blue-900/80 dark:text-blue-200/80">
              Your review hasn&apos;t been written yet.
            </p>
            {onGenerate && (
              <Button size="sm" className="h-7 px-2.5 text-xs" onClick={onGenerate}>
                <PenLine className="mr-1 h-3.5 w-3.5" />
                Write my review
              </Button>
            )}
          </div>
        )}
      </section>
    );
  }

  if (!review) return null;

  return (
    <section className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xl font-medium text-blue-900 dark:text-blue-200">
          <GraduationCap className="h-8 w-8" />
          Coach&apos;s review
          {review.secondaryScore != null && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-lg font-semibold tabular-nums text-blue-800 dark:bg-blue-900/60 dark:text-blue-100 border border-blue-200 dark:border-blue-900">
              {review.secondaryScore}%
            </span>
          )}
        </div>
        <SpeakerButton text={review.speakText} />
      </div>

      <p className="text-sm leading-relaxed text-blue-900/90 dark:text-blue-200/90">
        {review.summary}
      </p>

      {review.strengths.length > 0 && (
        <div className="mt-3">
          <p className="text-lg font-medium text-blue-900 dark:text-blue-200">
            Strengths
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-blue-900/85 dark:text-blue-200/85">
            {review.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {review.weaknesses.length > 0 && (
        <div className="mt-3">
          <p className="text-lg font-medium text-blue-900 dark:text-blue-200">
            Areas to improve
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-blue-900/85 dark:text-blue-200/85">
            {review.weaknesses.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

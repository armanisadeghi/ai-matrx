"use client";

// features/education/study/components/CoachReviewPanel.tsx
//
// Shared Coach's review — the `batch_review` kind drawn by ITS component
// (`BatchReviewBlock`), plus the canonical read-aloud control (SpeakerButton).
// Used on the FastFire scoreboard and the persisted session detail view. This
// host owns only state chrome; the kind owns the frame, score and sections.
//
// The waiting face is never a bare spinner: either the run is streaming in the
// floating window (`watching`) and this says so, or nothing is running and the
// card offers the one-click way to produce it (`onGenerate`) — no dead end.

import { GraduationCap, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpeakerButton } from "@/features/tts/components/SpeakerButton";
import type { ParsedSessionReview } from "../utils/parseSessionReview";
import { BatchReviewBlock } from "./BatchReviewBlock";

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
    <section className="mb-4">
      <div className="mb-1.5 flex items-center justify-end">
        <SpeakerButton text={review.speakText} />
      </div>
      <BatchReviewBlock review={review} />
    </section>
  );
}

"use client";

/**
 * The overlay frame for "Review what goes in" — wraps the canonical
 * `SourceReview`, never a copy. The package Dialog is a non-blocking,
 * draggable window on desktop and becomes a bottom sheet on a phone by
 * itself, so one frame serves every host.
 *
 * Settles the opener's promise exactly once: applied / add_more from the
 * body, cancelled from Cancel, the close control, or any other close.
 */

import { useRef } from "react";
import type { SourceSet } from "@ai-matrx/agents/sources";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@ai-matrx/design-system";
import { SourceReview } from "./SourceReview";
import { settleSourceReview } from "./openSourceReview";
import type { SourceReviewOptions, SourceReviewOutcome } from "./types";

export interface SourceReviewWindowProps {
  isOpen: boolean;
  onClose: () => void;
  callbackId: string | null;
  sourceSet: SourceSet | null;
  options: SourceReviewOptions;
}

export default function SourceReviewWindow({
  isOpen,
  onClose,
  callbackId,
  sourceSet,
  options,
}: SourceReviewWindowProps) {
  const settled = useRef(false);

  const finish = (outcome: SourceReviewOutcome) => {
    if (!settled.current && callbackId) {
      settled.current = true;
      settleSourceReview(callbackId, outcome);
    }
    onClose();
  };

  if (!sourceSet) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && finish({ status: "cancelled" })}>
      <DialogContent className="flex h-[85dvh] max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 px-4 pt-4">
          <DialogTitle>Review what goes in</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <SourceReview
            sourceSet={sourceSet}
            options={options}
            onApply={(set) => finish({ status: "applied", sourceSet: set })}
            onAddMore={(set) => finish({ status: "add_more", sourceSet: set })}
            onCancel={() => finish({ status: "cancelled" })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

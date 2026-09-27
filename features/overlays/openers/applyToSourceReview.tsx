"use client";

/**
 * Opener for the `applyToSourceReview` overlay — an agent window's answer
 * reviewed (diff → apply) against the text the window was launched from.
 *
 * - `applyToSourceReviewAction()` — the plain action for the rich-document
 *   "Apply to source" handler.
 * - `useOpenApplyToSourceReview()` — imperative hook.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "applyToSourceReview" as const;

export interface OpenApplyToSourceReviewOptions {
  /** The target registered in rich-document/review/applyTargets. */
  applyTargetId: string;
  /** The answer being applied. */
  proposal: string;
}

export function applyToSourceReviewAction(opts: OpenApplyToSourceReviewOptions) {
  return openOverlay({
    overlayId: OVERLAY_ID,
    data: { applyTargetId: opts.applyTargetId, proposal: opts.proposal },
  });
}

export function useOpenApplyToSourceReview() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenApplyToSourceReviewOptions) => {
      dispatch(applyToSourceReviewAction(opts));
    },
    [dispatch],
  );
}

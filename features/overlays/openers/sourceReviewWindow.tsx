"use client";

/**
 * Opener for the `sourceReviewWindow` overlay — "Review what goes in".
 *
 * The canonical opener is the plain async function `openSourceReview` (it
 * works from handlers and non-React hosts and resolves with the person's
 * choice); this file is its home in the openers directory, plus the hook form
 * the overlay convention expects.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import {
  openSourceReview,
  type SourceReviewOptions,
  type SourceReviewOutcome,
} from "@/features/resource-manager/source-input/review/openSourceReview";

export { openSourceReview, type SourceReviewOptions, type SourceReviewOutcome };

/** Hook form: returns `openSourceReview` itself (stable, no per-render state). */
export function useOpenSourceReviewWindow(): typeof openSourceReview {
  return openSourceReview;
}

"use client";

/**
 * openSourceReview — open "Review what goes in" from ANY host and await the
 * person's choice.
 *
 *   const outcome = await openSourceReview(sourceSet, {
 *     targetModelId, purpose: "your flashcard deck", reason: "large",
 *   });
 *   if (outcome.status === "applied") setSourceSet(outcome.sourceSet);
 *
 * A plain function (not a hook) so it works from event handlers, thunks and
 * non-React hosts alike. It rides the ONE overlay system: the overlay
 * `sourceReviewWindow` is dispatched through the store and the promise's
 * resolver waits in `callbackManager` — only its id travels through Redux
 * (functions never do). Opening a second review while one is open resolves
 * the first as `cancelled` (the overlay is a singleton).
 *
 * The window renders `SourceReviewWindow`, which wraps the canonical
 * `SourceReview` body — the same component a page can render inline.
 */

import type { SourceSet } from "@ai-matrx/agents/sources";
import { getStore } from "@/lib/redux/store-singleton";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import { callbackManager } from "@/utils/callbackManager";
import type { SourceReviewOptions, SourceReviewOutcome } from "./types";

export type { SourceReviewOptions, SourceReviewOutcome } from "./types";

export const SOURCE_REVIEW_OVERLAY_ID = "sourceReviewWindow";

/** What travels through Redux — serialisable only. Named `callbackGroupId` to match the
 *  platform's callback-window convention (see agentPickerWindow and siblings), so the
 *  window-address census recognizes this as a callback window and does not demand a
 *  deep-linkable address for it — a review session is not a durable, shareable subject. */
export interface SourceReviewWindowData {
  callbackGroupId: string;
  sourceSet: SourceSet;
  options: SourceReviewOptions;
}

let openCallbackId: string | null = null;

/** Settle the open review's promise (idempotent — a settled id is a no-op). */
export function settleSourceReview(
  callbackId: string,
  outcome: SourceReviewOutcome,
): void {
  if (openCallbackId === callbackId) openCallbackId = null;
  callbackManager.trigger<SourceReviewOutcome>(callbackId, outcome);
}

export function openSourceReview(
  sourceSet: SourceSet,
  options: SourceReviewOptions = {},
): Promise<SourceReviewOutcome> {
  const store = getStore();
  if (!store) {
    // Never silent: a host calling this before the app store exists is a bug
    // in that host, and the person would otherwise click and see nothing.
    return Promise.reject(
      new Error(
        "openSourceReview: the app store is not ready yet — call it from a mounted client component.",
      ),
    );
  }
  if (openCallbackId) settleSourceReview(openCallbackId, { status: "cancelled" });

  return new Promise<SourceReviewOutcome>((resolve) => {
    const callbackId = callbackManager.register<SourceReviewOutcome>((outcome) =>
      resolve(outcome),
    );
    openCallbackId = callbackId;
    const data: SourceReviewWindowData = { callbackGroupId: callbackId, sourceSet, options };
    store.dispatch(openOverlay({ overlayId: SOURCE_REVIEW_OVERLAY_ID, data }));
  });
}

/** Close the review from the window itself after settling. */
export function closeSourceReviewOverlay(): void {
  getStore()?.dispatch(closeOverlay({ overlayId: SOURCE_REVIEW_OVERLAY_ID }));
}

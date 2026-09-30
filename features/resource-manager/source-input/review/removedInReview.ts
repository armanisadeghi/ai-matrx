// features/resource-manager/source-input/review/removedInReview.ts
//
// What the person removed in "Review what goes in". The review hands back the
// Sources to use; applying that answer only rewrites the pointers it names, so
// a Source removed there stayed on the page (verify-4 V4-F #3). The host
// removes exactly these — the Sources that went INTO the review and did not
// come back. A Source that landed while the review was open is never in
// `reviewed`, so it is never removed by it.

import type { SourceSet } from "@ai-matrx/agents/sources";
import { sourceKey } from "@ai-matrx/agents/sources/runtime";

export function removedInReview(reviewed: SourceSet, answer: SourceSet): Set<string> {
  const kept = new Set(answer.sources.map(sourceKey));
  return new Set(reviewed.sources.map(sourceKey).filter((k) => !kept.has(k)));
}

/** The part of the Source set the review's answer touches. */
export interface ReviewAnswerTarget {
  applySourceSet(set: SourceSet): void;
  getState(): { cards: ReadonlyArray<{ id: string; draft: { ref?: { resource_type: string; resource_id: string } | null } }> };
  remove(id: string): void;
}

/**
 * Apply the review's answer: the kept Sources take their new pointers, and
 * every Source removed in the review leaves the page — bound by its own id.
 */
export function applyReviewAnswer(set: ReviewAnswerTarget, reviewed: SourceSet, answer: SourceSet): void {
  set.applySourceSet(answer);
  const removed = removedInReview(reviewed, answer);
  if (!removed.size) return;
  for (const card of set.getState().cards) {
    if (card.draft.ref && removed.has(sourceKey(card.draft.ref))) set.remove(card.id);
  }
}

"use client";

/**
 * The review's two limits — `platform.feature_knob` rows (feature `sources`),
 * read through the one runtime reader. A missing row raises: no constant here
 * pretends to be the knob.
 *
 * - `review_threshold_chars` — above this many characters of Sources, a host
 *   opens "Review what goes in" by itself (Arman, 2026-09-27: "shown when the
 *   inputs are over 100,000 characters").
 * - `review_default_context_tokens` — the window the budget is judged against
 *   when the target model is unknown; the screen labels it as a default.
 */

import { knobInt } from "@/lib/knobs/featureKnobs";

export const SOURCES_KNOB_FEATURE = "sources";

export function reviewThresholdChars(): Promise<number> {
  return knobInt(SOURCES_KNOB_FEATURE, "review_threshold_chars");
}

export function reviewDefaultContextTokens(): Promise<number> {
  return knobInt(SOURCES_KNOB_FEATURE, "review_default_context_tokens");
}

/**
 * Should the host open the review by itself? `totalChars` is the manifest's
 * total (`totalChars(manifest)` from `@ai-matrx/agents/sources`).
 */
export async function shouldOpenSourceReview(totalChars: number): Promise<boolean> {
  return totalChars > (await reviewThresholdChars());
}

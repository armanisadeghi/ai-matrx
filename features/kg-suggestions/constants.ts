// features/kg-suggestions/constants.ts
//
// Shared tuning constants for the KG suggestion surfaces.

import type { KgSuggestionRow } from "@/features/kg-suggestions/types";

/**
 * Confidence floor (0..1) below which a suggestion is treated as LOW-QUALITY.
 * The producer's sub-50% proposals are mostly noise in practice, so they're
 * deliberately de-emphasized everywhere:
 *   - excluded from the global new-suggestion notifier,
 *   - hidden from the drawer's normal list (folded into a "view N low-quality
 *     in the manager" banner instead),
 *   - pulled out of the manager's main table into a collapsed, muted section.
 * They are never deleted or hidden outright — the user can always review and
 * dismiss them; we just stop putting them front and center.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

/** True when a row scored below the low-quality floor. */
export function isLowConfidence(
  row: Pick<KgSuggestionRow, "confidence">,
): boolean {
  return (row.confidence ?? 0) < LOW_CONFIDENCE_THRESHOLD;
}

// features/kg-suggestions/constants.ts
//
// Shared tuning constants for the KG suggestion surfaces.

import type {
  KgSuggestionRow,
  KgSuggestionStage,
  KgSuggestionStatus,
} from "@/features/kg-suggestions/types";

/**
 * The status vocabulary the manager's filter chips offer, in display order.
 * Canonical: the filter bar RENDERS from this and the surface write handler
 * for `suggestions_filter` VALIDATES against it, so an agent can never be
 * offered a status the UI does not actually have.
 */
export const KG_SUGGESTION_STATUSES: {
  value: KgSuggestionStatus;
  label: string;
}[] = [
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "deferred", label: "Deferred" },
  { value: "expired", label: "Expired" },
];

/** The stage filter's vocabulary — the two ledgers plus the "any" sentinel. */
export const KG_SUGGESTION_STAGE_FILTERS: {
  value: KgSuggestionStage | "all";
  label: string;
}[] = [
  { value: "all", label: "Any stage" },
  { value: "value", label: "Field value" },
  { value: "association", label: "Scope link" },
];

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

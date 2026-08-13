/**
 * ONE issue count for a `SurfaceDriftReport`, shared by every surface that
 * shows a drift total.
 *
 * This exists because the count kept going stale. `ManifestDriftDialog` had to
 * be fixed once already — `surfaceLabelDrifts` and `valueGroupsDrifts` were
 * computed, returned, and counted by nothing, so a workspace whose only drift
 * was a renamed label got a green "Everything is in sync". `ManifestSyncDialog`
 * then repeated the mistake independently for its "Remaining drift" line, and
 * adding the write-target and client-tool categories would have made both wrong
 * again. Two hand-maintained sums over the same object is the bug, not the
 * omissions.
 *
 * So it does NOT enumerate categories. Every field of `SurfaceDriftReport` is
 * an array of drift entries, so summing the lengths of all array-valued fields
 * is exhaustive BY CONSTRUCTION: a category added to the report type is counted
 * the moment it is returned, with no second edit to remember. Non-array fields
 * (should the report ever grow one) are ignored rather than guessed at.
 *
 * Reporting a healthy state for a problem you already detected is worse than
 * not checking at all — it actively tells the operator to stop looking.
 */
import type { SurfaceDriftReport } from "@/features/surfaces/types";

export function countDriftIssues(
  report: SurfaceDriftReport | null | undefined,
): number {
  if (!report) return 0;
  let total = 0;
  for (const value of Object.values(report)) {
    if (Array.isArray(value)) total += value.length;
  }
  return total;
}

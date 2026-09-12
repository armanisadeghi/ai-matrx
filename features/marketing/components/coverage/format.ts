/**
 * Shared human-readable formatters for the coverage matrix workspace —
 * consumed by every Copy button on the page (per-tile hover copy, the whole
 * matrix header pair, the groomer). One summary per shape; never duplicate
 * these at a callsite.
 */

// THE count voice: @ai-matrx/kit/format owns grouped integers with an
// em-dash for unknown. Collapsed 2026-09-12 (kit 0.12.x).
import { formatCount } from "@ai-matrx/kit/format";
export { formatCount };

export function humanCoverageTile(
  label: string,
  value: number | null | undefined,
  description: string,
  siteDomain: string,
): string {
  return `${label}: ${formatCount(value)} — ${description} (${siteDomain})`;
}

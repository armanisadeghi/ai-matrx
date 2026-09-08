/**
 * Shared formatters for the Observational Memory UI.
 *
 * All values are admin-debug facing, so we lean toward precision over
 * prettified rounding — fractional cents and exact token counts matter.
 */

import { parseTimestamp } from "@/utils/datetime";
// `formatDurationMs` used to be re-implemented here, under the package's own
// name (census H1). It is now imported straight from `@ai-matrx/kit/format` by
// its callers; the one display change is that seconds under ten keep one
// decimal instead of two (`5.2s`, not `5.23s`).
// `formatRelativeTime` is THE package formatter (`@ai-matrx/kit/format`,
// census H1 2026-09-07). This surface previously carried a local copy.
export { formatRelativeTime } from "@ai-matrx/kit/format";

export function formatCostUsd(
  cost: number | null | undefined,
  fractionDigits = 4,
): string {
  if (cost == null || Number.isNaN(cost)) return "—";
  if (cost === 0) return "$0.0000";
  if (cost < 0.0001) return `$${cost.toExponential(2)}`;
  return `$${cost.toFixed(fractionDigits)}`;
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString();
}


export function formatDateTime(iso: string | null | undefined): string {
  const d = parseTimestamp(iso);
  if (!d) return iso ?? "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}


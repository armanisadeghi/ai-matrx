/**
 * Shared human-readable formatters for the coverage matrix workspace —
 * consumed by every Copy button on the page (per-tile hover copy, the whole
 * matrix header pair, the groomer). One summary per shape; never duplicate
 * these at a callsite.
 */

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : Intl.NumberFormat("en").format(value);
}

export function humanCoverageTile(
  label: string,
  value: number | null | undefined,
  description: string,
  siteDomain: string,
): string {
  return `${label}: ${formatCount(value)} — ${description} (${siteDomain})`;
}

const FULL_METRIC_NUMBER = new Intl.NumberFormat("en-US");
const COMPACT_METRIC_NUMBER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Keep ordinary counts exact, then abbreviate at the first value that no
 * longer fits comfortably in the dashboard's two-column phone cards.
 */
export function formatMetricNumber(value: number): string {
  const formatter =
    Math.abs(value) >= 100_000 ? COMPACT_METRIC_NUMBER : FULL_METRIC_NUMBER;
  return formatter.format(value);
}

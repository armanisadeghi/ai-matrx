/**
 * features/files/utils/format.ts
 *
 * Display formatters — file size, relative time, absolute time.
 */

// `formatFileSize` moved to `@ai-matrx/kit/format` (census H1, 2026-09-07).
// This module keeps the historical specifier working for its callers; NEW
// code should import from kit directly.
export { formatFileSize } from "@ai-matrx/kit/format";

/**
 * "2m ago", "3h ago", "5d ago", etc. Falls back to absolute date after 1 year.
 *
 * Delegates to the canonical {@link parseTimestamp} so naive (zone-less)
 * UTC timestamps from `timestamp without time zone` columns aren't parsed
 * as local time. (cld_* columns are timestamptz and were always fine, but
 * routing through one parser keeps every surface consistent.)
 */
export { formatRelativeTime, formatAbsoluteDate } from "@/utils/datetime";

/**
 * Truncate a filename at its stem while preserving the extension.
 * "a-very-long-report-2026.pdf" → "a-very-long-re….pdf"
 */
export function truncateFilename(name: string, maxLength = 24): string {
  if (name.length <= maxLength) return name;
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return `${name.slice(0, maxLength - 1)}…`;
  const ext = name.slice(dotIdx);
  const stem = name.slice(0, dotIdx);
  const keep = Math.max(1, maxLength - ext.length - 1);
  return `${stem.slice(0, keep)}…${ext}`;
}

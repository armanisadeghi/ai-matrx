/**
 * features/files/utils/format.ts
 *
 * Display formatters — file size, relative time, absolute time.
 */

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatFileSize(bytes: number | null | undefined): string {
  // Null / undefined / NaN / negative / non-finite all collapse to a
  // single em-dash. Without these guards a malformed `fileSize` from the
  // backend (corrupt row, race-condition mid-upload) would render as
  // "NaN B" or "Infinity GB" — visible garbage in the file table.
  if (
    bytes == null ||
    !Number.isFinite(bytes) ||
    Number.isNaN(bytes) ||
    bytes < 0
  )
    return "—";
  if (bytes === 0) return "0 B";
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    SIZE_UNITS.length - 1,
  );
  const value = bytes / Math.pow(1024, exp);
  // Keep a single decimal for KB+, whole numbers for B.
  const formatted = exp === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${SIZE_UNITS[exp]}`;
}

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

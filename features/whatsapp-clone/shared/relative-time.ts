import {
  format,
  isThisWeek,
  isToday,
  isYesterday,
  differenceInCalendarDays,
} from "date-fns";
import { parseTimestamp } from "@/utils/datetime";
// THE package duration formatter (`@ai-matrx/kit/format`, census H1
// 2026-09-07). THE UNIT LAW: the unit is in the name.
import { formatDurationSeconds } from "@ai-matrx/kit/format";

/** Parse a backend timestamp, treating naive (zone-less) strings as UTC. */
function toDate(iso: string | null | undefined): Date {
  return parseTimestamp(iso) ?? new Date(NaN);
}

export function formatConversationTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = toDate(iso);
    if (isToday(d)) return format(d, "h:mm a");
    if (isYesterday(d)) return "Yesterday";
    if (isThisWeek(d)) return format(d, "EEEE");
    return format(d, "MM/dd/yyyy");
  } catch {
    return "";
  }
}

export function formatBubbleTime(iso: string): string {
  try {
    return format(toDate(iso), "h:mm a");
  } catch {
    return "";
  }
}

export function formatDateSeparator(iso: string): string {
  try {
    const d = toDate(iso);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    const days = differenceInCalendarDays(new Date(), d);
    if (days < 7) return format(d, "EEEE");
    return format(d, "MMMM d, yyyy");
  } catch {
    return "";
  }
}

export function formatLinkTime(iso: string): string {
  try {
    return format(toDate(iso), "M/d/yy, h:mm a");
  } catch {
    return "";
  }
}

export function formatMonthHeader(iso: string): string {
  try {
    return format(toDate(iso), "MMMM");
  } catch {
    return "";
  }
}

export function formatRangeHeader(startIso: string, endIso: string): string {
  try {
    const a = format(toDate(startIso), "MMM d, yyyy");
    const b = format(toDate(endIso), "MMM d, yyyy");
    return `${a} – ${b}`;
  } catch {
    return "";
  }
}

// `formatFileSize` moved to `@ai-matrx/kit/format` (census H1, 2026-09-07).
// This module keeps the historical specifier working for its callers; NEW
// code should import from kit directly.
export { formatFileSize } from "@ai-matrx/kit/format";

/** A voice-note length. Empty string, not an em-dash, when there isn't one. */
export function formatDuration(seconds: number | undefined): string {
  return formatDurationSeconds(seconds, { fallback: "" });
}

import {
  format,
  isThisWeek,
  isToday,
  isYesterday,
  differenceInCalendarDays,
} from "date-fns";
import { parseTimestamp } from "@/utils/datetime";

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

export function formatFileSize(bytes: number): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds && seconds !== 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// features/transcripts/utils/dateFormatting.ts

import { parseTimestamp } from "@/utils/datetime";
// THE package duration formatter (`@ai-matrx/kit/format`, census H1
// 2026-09-07). THE UNIT LAW: the unit is in the name, because the fleet's
// ~35 twins variously took ms, seconds and minutes behind one signature.

/**
 * A transcript's age in the sidebar's own CALENDAR-INFLECTED long voice:
 * "Just now", "5 minutes ago", "Yesterday", "3 weeks ago".
 *
 * Deliberately NOT `@ai-matrx/kit/format`'s `formatRelativeTime` and not named
 * like it (census H1, 2026-09-07). The package answers "how long ago?" in a
 * uniform elapsed-time voice — `1d ago` / `1 day ago`. This list answers it the
 * way a person browsing their own recordings reads it, which means "Yesterday"
 * is a word and not a number. Same distinction, same session, as
 * `features/user-lists/calendar-age.ts`. The PARSING is still the package's,
 * through `@/utils/datetime`.
 */
export function formatTranscriptAge(dateString: string): string {
  // parseTimestamp treats naive (zone-less) UTC strings correctly instead
  // of as local time. Falls back to the raw `new Date` only if unparseable.
  const date = parseTimestamp(dateString) ?? new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInSeconds < 60) {
    return "Just now";
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} ${diffInMinutes === 1 ? "minute" : "minutes"} ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours} ${diffInHours === 1 ? "hour" : "hours"} ago`;
  } else if (diffInDays === 1) {
    return "Yesterday";
  } else if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  } else if (diffInDays < 365) {
    const months = Math.floor(diffInDays / 30);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  } else {
    const years = Math.floor(diffInDays / 365);
    return `${years} ${years === 1 ? "year" : "years"} ago`;
  }
}

/**
 * Format a date string to a readable date (e.g., "Jan 15, 2024")
 */
export function formatReadableDate(dateString: string): string {
  const date = parseTimestamp(dateString) ?? new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a date string to a readable date and time (e.g., "Jan 15, 2024 at 3:45 PM")
 */
export function formatReadableDateTime(dateString: string): string {
  const date = parseTimestamp(dateString) ?? new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "1:23:45" / "12:34" from seconds — THE package clock formatter. */
// The clock formatter is the package's `formatDurationSeconds`, imported
// under its own name (2026-09-12): an alias of a collapsed export puts its
// call sites outside the guards that judge that export, and THE UNIT LAW
// puts the unit in the name — a bare `formatDuration` hides whether the
// number is seconds or milliseconds at every call site.
export { formatDurationSeconds } from "@ai-matrx/kit/format";

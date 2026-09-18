// features/exports/format.ts
//
// The words BRING YOUR EXPORT uses for numbers. Plain English, never a raw
// byte count or a bare integer with no noun.

/**
 * THE PACKAGE FUNCTIONS THEMSELVES, re-exported under the names this feature's
 * call sites already use. The bodies that used to be here — a 1024 cascade and
 * a bare `toLocaleString()` — were found by the byte-size and count shape lanes
 * of `check:package-twins`. The byte one is gone from this module entirely: its
 * two callers now import `formatFileSize` by its own name, because a re-export
 * under a SECOND name takes every call site outside the guards that judge the
 * package function.
 */
export { formatCount } from "@ai-matrx/kit/format";

/** "12,433 messages" / "1 message". */
export function countWithNoun(n: number, singular: string, plural?: string): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** A date the way a person says it: "14 Mar 2019". Never an ISO string. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "6 years 2 months" from a span in days — the shape of an archive, not a number. */
export function formatSpan(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days) || days < 0) {
    return "—";
  }
  if (days < 1) return "less than a day";
  if (days < 62) return countWithNoun(Math.round(days), "day");
  const months = Math.round(days / 30.44);
  if (months < 24) return countWithNoun(months, "month");
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0
    ? countWithNoun(years, "year")
    : `${countWithNoun(years, "year")} ${countWithNoun(rest, "month")}`;
}

/** Turn a raw stored word into the words on screen. */
export function directionLabel(direction: string): string {
  if (direction === "outbound") return "Sent by you";
  if (direction === "inbound") return "Received";
  if (direction === "unknown") return "Unknown";
  return direction;
}

/** The biggest entries of a `{ value: count }` map, largest first. */
export function topCounts(
  counts: Record<string, number> | null | undefined,
  limit: number,
): { value: string; count: number }[] {
  if (!counts) return [];
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

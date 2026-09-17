// features/exports/format.ts
//
// The words BRING YOUR EXPORT uses for numbers. Plain English, never a raw
// byte count or a bare integer with no noun.

const KB = 1024;

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < KB) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / KB;
  let unit = 0;
  while (value >= KB && unit < units.length - 1) {
    value /= KB;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

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

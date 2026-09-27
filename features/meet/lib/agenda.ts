// features/meet/lib/agenda.ts
//
// THE UPCOMING LIST'S ARITHMETIC — occurrences grouped by the day they fall on
// in the VIEWER's zone (a 5 PM Monday meeting in Los Angeles is a Tuesday row
// for a reader in Tokyo), "Today" / "Tomorrow" named, and the list scoped to the
// meetings that are the reader's own. Pure; tested without a DOM.

import type { UpcomingOccurrence } from "@ai-matrx/meet";
import { utcToZoned } from "@/features/meet/lib/zoned-time";

/** Whose meetings the list shows. RLS decides what EXISTS; this decides what is shown. */
export type AgendaScope = "mine" | "hosting" | "invited";

export interface AgendaDay<T> {
  /** `YYYY-MM-DD` in the viewer's zone. */
  readonly key: string;
  /** "Today", "Tomorrow", or "Thursday, October 8". */
  readonly label: string;
  readonly items: readonly T[];
}

export interface OccurrenceLike {
  readonly occurrenceStart: string;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** The label for one day key, relative to `now` in `zone`. */
export function dayLabel(
  key: string,
  zone: string,
  now: Date,
  locale?: string,
): string {
  const today = utcToZoned(now.toISOString(), zone).date;
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  if (key === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return new Date(Date.UTC(y!, m! - 1, d!, 12)).toLocaleDateString(
    locale ?? "en-US",
    {
      timeZone: "UTC",
      weekday: "long",
      month: "long",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    },
  );
}

/** Occurrences grouped by their day in `zone`, earliest first within and across days. */
export function groupByDay<T extends OccurrenceLike>(
  items: readonly T[],
  zone: string,
  now: Date = new Date(),
  locale?: string,
): AgendaDay<T>[] {
  const sorted = [...items].sort(
    (a, b) =>
      new Date(a.occurrenceStart).getTime() -
      new Date(b.occurrenceStart).getTime(),
  );
  const days = new Map<string, T[]>();
  for (const item of sorted) {
    const key = utcToZoned(item.occurrenceStart, zone).date;
    const bucket = days.get(key);
    if (bucket) bucket.push(item);
    else days.set(key, [item]);
  }
  return [...days.entries()].map(([key, dayItems]) => ({
    key,
    label: dayLabel(key, zone, now, locale),
    items: dayItems,
  }));
}

/** When an occurrence is over. A meeting with no length is over an hour after it starts. */
export function occurrenceEnd(
  item: Pick<UpcomingOccurrence, "occurrenceStart" | "durationMinutes">,
): number {
  const minutes =
    item.durationMinutes && item.durationMinutes > 0
      ? item.durationMinutes
      : 60;
  return new Date(item.occurrenceStart).getTime() + minutes * 60_000;
}

/** Happening now: started and not yet over. */
export function isLive(
  item: Pick<UpcomingOccurrence, "occurrenceStart" | "durationMinutes">,
  now: Date = new Date(),
): boolean {
  const start = new Date(item.occurrenceStart).getTime();
  return start <= now.getTime() && occurrenceEnd(item) > now.getTime();
}

/** Starts within the next `minutes` (Join becomes the row's main action). */
export function startsSoon(
  item: Pick<UpcomingOccurrence, "occurrenceStart">,
  now: Date = new Date(),
  minutes = 15,
): boolean {
  const start = new Date(item.occurrenceStart).getTime();
  return start > now.getTime() && start - now.getTime() <= minutes * 60_000;
}

/** Does this occurrence belong in the reader's list under `scope`? */
export function inScope(
  item: Pick<UpcomingOccurrence, "myRole">,
  scope: AgendaScope,
): boolean {
  if (item.myRole === null) return false;
  if (scope === "hosting")
    return item.myRole === "host" || item.myRole === "cohost";
  if (scope === "invited") return item.myRole === "invitee";
  return true;
}

/** Case-insensitive title match; an empty query matches everything. */
export function matchesQuery(title: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || title.toLowerCase().includes(q);
}

/**
 * The Upcoming list: the reader's own occurrences, not over yet, matching the
 * search, whole-meeting cancellations out (they live on the Cancelled tab), and
 * a cancelled single occurrence KEPT — it shows struck through, as Google
 * Calendar does, so a person can see the gap and restore it.
 */
export function upcomingRows(
  items: readonly UpcomingOccurrence[],
  options: { scope: AgendaScope; query: string; now?: Date },
): UpcomingOccurrence[] {
  const now = options.now ?? new Date();
  return items.filter(
    (item) =>
      !item.meetingCancelled &&
      inScope(item, options.scope) &&
      matchesQuery(item.title, options.query) &&
      occurrenceEnd(item) > now.getTime(),
  );
}

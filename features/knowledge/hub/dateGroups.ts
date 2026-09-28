/**
 * features/knowledge/hub/dateGroups.ts — the list's date sections (Granola,
 * Apple Notes, ChatGPT's history): Today · Yesterday · Previous 7 days ·
 * Previous 30 days · then one section per month ("August 2026"). Inside a
 * section the row's date says only what the header does not: the time for
 * Today and Yesterday, the day for everything older.
 *
 * Pure: `now` is passed in, local time throughout.
 */

export type DateGroupKey = "today" | "yesterday" | "week" | "month" | `m:${number}-${number}` | "undated";

export interface DateGroup {
  key: DateGroupKey;
  label: string;
}

const DAY = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dateGroupOf(iso: string | null | undefined, now: Date): DateGroup {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return { key: "undated", label: "No date" };
  const today = startOfDay(now);
  if (t >= today) return { key: "today", label: "Today" };
  if (t >= today - DAY) return { key: "yesterday", label: "Yesterday" };
  if (t >= today - 7 * DAY) return { key: "week", label: "Previous 7 days" };
  if (t >= today - 30 * DAY) return { key: "month", label: "Previous 30 days" };
  const d = new Date(t);
  const label = d.toLocaleDateString("en-US", {
    month: "long",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  return { key: `m:${d.getFullYear()}-${d.getMonth()}`, label };
}

/** The row's date inside its section: "3:42 PM" today and yesterday, "Sep 12" older, "Sep 12, 2025" in another year. */
export function dateInGroup(iso: string | null | undefined, group: DateGroup, now: Date): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  if (group.key === "today" || group.key === "yesterday")
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export type DatedItem<T> = { kind: "header"; group: DateGroup; count: number } | { kind: "row"; item: T; group: DateGroup };

/** Items, newest first (the page sorts them) → a header wherever the section changes, then its rows. */
export function groupByDate<T>(items: T[], whenOf: (item: T) => string | null | undefined, now: Date): DatedItem<T>[] {
  const out: DatedItem<T>[] = [];
  let header: { kind: "header"; group: DateGroup; count: number } | null = null;
  for (const item of items) {
    const group = dateGroupOf(whenOf(item), now);
    if (!header || header.group.key !== group.key) {
      header = { kind: "header", group, count: 0 };
      out.push(header);
    }
    header.count += 1;
    out.push({ kind: "row", item, group });
  }
  return out;
}

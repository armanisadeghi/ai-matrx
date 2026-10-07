/**
 * features/notifications/badge.ts — THE BELL'S ARITHMETIC, in one pure place.
 *
 * Arman, 2026-10-07: "once you open it and see what it wanted to show you before, it doesn't show a
 * count anymore and only shows a count for when there is something new" — and nothing hard to do
 * may sit in a count the person cannot clear.
 *
 *   badge  = unseen Needs-you + For-you notices (server `seen_at`, cleared by opening the bell)
 *          + for each counting source the person has not hidden: what is NEW since the bell was
 *            last opened (its count above `sourcesSeen`).
 *   a source's number in the bell = its count above `sourcesCleared` (one click clears it; the
 *            work itself lives on the source's own page).
 *
 * Marks are counts, so when a source's count falls (items handled elsewhere) the mark falls with it
 * (`lowerMarks`) and the next new item counts again.
 */

export type SourceMarks = Readonly<Record<string, number>>;

/** How much of `count` is above `mark`; an unreadable count adds nothing. */
export function above(count: number | null | undefined, mark: number | undefined): number {
  if (count === null || count === undefined) return 0;
  return Math.max(0, count - (mark ?? 0));
}

export interface BadgeInput {
  unseenNeedsYou: number;
  unseenDirect: number;
  /** Counting sources (needs-you work): key → current count (null = unreadable). */
  sources: Readonly<Record<string, number | null>>;
  seen: SourceMarks;
  hidden: readonly string[];
}

export function bellBadge(input: BadgeInput): number {
  let n = input.unseenNeedsYou + input.unseenDirect;
  for (const [key, count] of Object.entries(input.sources)) {
    if (input.hidden.includes(key)) continue;
    n += above(count, input.seen[key]);
  }
  return n;
}

/** Marks every readable source at its current count — what opening the bell (or Clear) records. */
export function markAt(marks: SourceMarks, counts: Readonly<Record<string, number | null>>): Record<string, number> {
  const next: Record<string, number> = { ...marks };
  for (const [key, count] of Object.entries(counts)) {
    if (count !== null) next[key] = count;
  }
  return next;
}

/** Marks above a source's current count fall to it; null when nothing changes. */
export function lowerMarks(
  marks: SourceMarks,
  counts: Readonly<Record<string, number | null>>,
): Record<string, number> | null {
  let changed = false;
  const next: Record<string, number> = { ...marks };
  for (const [key, count] of Object.entries(counts)) {
    if (count !== null && (marks[key] ?? 0) > count) {
      next[key] = count;
      changed = true;
    }
  }
  return changed ? next : null;
}

/** Equal as records (a write that changes nothing is never sent). */
export function sameMarks(a: SourceMarks, b: SourceMarks): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if ((a[key] ?? 0) !== (b[key] ?? 0)) return false;
  return true;
}

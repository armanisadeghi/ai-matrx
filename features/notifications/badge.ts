/**
 * features/notifications/badge.ts — THE BELL'S ARITHMETIC, in one pure place.
 *
 * Arman, 2026-10-07: "once you open it and see what it wanted to show you before, it doesn't show a
 * count anymore and only shows a count for when there is something new" — and nothing hard to do
 * may sit in a count the person cannot clear.
 *
 *   badge  = unseen Needs-you + For-you notices (server `seen_at`, cleared by opening the bell)
 *          + for each counting place the person has not hidden: what is NEW since the bell was last
 *            opened.
 *   a place's number in the bell = what is new since the person last cleared it (one click clears
 *            it; the work itself lives on the place's own page).
 *
 * WHAT "NEW" MEANS PER PLACE.
 *   - A place that answers with ids (workflows waiting) is compared by id: an item is new when its
 *     id was not there at the last open/clear. One handled + one new shows 1.
 *   - A place that answers only with a count (approvals, record-store work, assists) is compared by
 *     count: new = count above the mark. KNOWN LIMIT: one handled + one new between two opens reads
 *     as 0 until the count passes the mark. The doors behind these places return counts only.
 *
 * A mark moves ONLY when the person opens the bell (seen) or clears (cleared) — never on a refetch,
 * so a read that briefly answers low can never make the real items reappear as "new".
 */

/** What a place reads: its count, and its item ids when it has them. null count = unreadable. */
export interface PlaceReading {
  count: number | null;
  ids?: readonly string[] | null;
}

export interface PlaceMarks {
  counts: Readonly<Record<string, number>>;
  ids: Readonly<Record<string, readonly string[]>>;
}

export const NO_MARKS: PlaceMarks = { counts: {}, ids: {} };

/** How much of `count` is above `mark`; an unreadable count adds nothing. */
export function above(count: number | null | undefined, mark: number | undefined): number {
  if (count === null || count === undefined) return 0;
  return Math.max(0, count - (mark ?? 0));
}

/** What is new in one place since its marks were set. */
export function newIn(key: string, reading: PlaceReading | undefined, marks: PlaceMarks): number {
  if (!reading || reading.count === null) return 0;
  const seenIds = marks.ids[key];
  if (reading.ids && seenIds) {
    const seen = new Set(seenIds);
    return reading.ids.filter((id) => !seen.has(id)).length;
  }
  return above(reading.count, marks.counts[key]);
}

export interface BadgeInput {
  unseenNeedsYou: number;
  unseenDirect: number;
  /** Counting places (needs-you work): key → what it reads. */
  places: Readonly<Record<string, PlaceReading>>;
  seen: PlaceMarks;
  hidden: readonly string[];
}

export function bellBadge(input: BadgeInput): number {
  let n = input.unseenNeedsYou + input.unseenDirect;
  for (const [key, reading] of Object.entries(input.places)) {
    if (input.hidden.includes(key)) continue;
    n += newIn(key, reading, input.seen);
  }
  return n;
}

/**
 * Marks every READABLE place at what it reads now — what opening the bell (seen) or Clear (cleared)
 * records. An unreadable place keeps its old mark. This is the ONLY way a mark moves.
 */
export function markPlaces(marks: PlaceMarks, places: Readonly<Record<string, PlaceReading>>): PlaceMarks {
  const counts: Record<string, number> = { ...marks.counts };
  const ids: Record<string, readonly string[]> = { ...marks.ids };
  for (const [key, reading] of Object.entries(places)) {
    if (reading.count === null) continue;
    counts[key] = reading.count;
    if (reading.ids) ids[key] = [...reading.ids];
  }
  return { counts, ids };
}

/** Equal as marks (a write that changes nothing is never sent). */
export function sameMarks(a: PlaceMarks, b: PlaceMarks): boolean {
  const keys = new Set([...Object.keys(a.counts), ...Object.keys(b.counts)]);
  for (const key of keys) if ((a.counts[key] ?? 0) !== (b.counts[key] ?? 0)) return false;
  const idKeys = new Set([...Object.keys(a.ids), ...Object.keys(b.ids)]);
  for (const key of idKeys) {
    const x = a.ids[key] ?? [];
    const y = new Set(b.ids[key] ?? []);
    if (x.length !== y.size || x.some((id) => !y.has(id))) return false;
  }
  return true;
}

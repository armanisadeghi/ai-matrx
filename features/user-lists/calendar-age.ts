/**
 * features/user-lists/calendar-age.ts
 *
 * The list cards' age label — a CALENDAR-DAY voice, deliberately not the
 * platform's elapsed-time formatter.
 *
 * `@ai-matrx/kit/format`'s `formatRelativeTime` answers "how long ago?" and
 * says "5h ago" for something saved this morning. These cards answer "which
 * day?" and say "Today", which is the reading a person scanning a list of
 * their own lists actually wants. The two are different questions, so this is
 * not a re-grown twin of the package formatter — but it WAS duplicated
 * byte-for-byte between `ListCard.tsx` and `MobileListGrid.tsx` (the desktop
 * and mobile renderings of the same card), so it lives here once.
 */

/** `"Today"` · `"Yesterday"` · `"3d ago"` · `"2w ago"` · `"5mo ago"` · `"2y ago"`. */
export function listCalendarAge(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) return "";
  const days = Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

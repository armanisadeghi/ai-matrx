// lib/detail/listContext.ts
//
// 🚨 NEW-7 — THE LIST A RECORD WAS OPENED FROM IS BOUNDED BEFORE IT RIDES A URL.
//
// The page presentation carries its list context in the query string
// (`?l=type.id,…&i=<n>`) so the arrows and `[` / `]` keep working after a record
// is opened as a page. Uncapped, a 500-row list produced a >20 KB href — past
// every practical request-line limit — and `switchTo("page")` from a window
// carried whatever list the opener handed it (VERIFY-U-P1-R2, break attempt 5).
//
// The cap is a KNOB, not a constant: every ceiling on this platform is a row an
// admin can change (`ui.detail.list_context_max_ids`, default 200, organization-
// overridable — `migrations/detail_list_context_max_knob.sql`). Beyond it the URL
// carries the WINDOW AROUND THE CURRENT RECORD, because the far ends of a long
// list are not what the arrows are for, and the detail SAYS the list was trimmed
// (`trimmedFrom`) rather than quietly presenting a 200-row list as the whole
// thing. Nothing here talks to the settings ladder: the host resolves the knob
// and passes the number in, so the module stays package-shaped.

import type { DetailListContext } from "./types";

/**
 * The list as it may travel, plus what was left behind. Returns the same list
 * when it already fits, and `null` for no list at all.
 */
export function trimListContext(
  list: DetailListContext | null | undefined,
  max: number,
): DetailListContext | null {
  if (!list || list.items.length === 0) return null;
  const cap = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1;
  const total = list.items.length;
  const index = list.index >= 0 && list.index < total ? list.index : 0;
  if (total <= cap) return { items: list.items, index, ...(list.trimmedFrom ? { trimmedFrom: list.trimmedFrom } : {}) };
  const half = Math.floor(cap / 2);
  const start = Math.min(Math.max(index - half, 0), total - cap);
  return {
    items: list.items.slice(start, start + cap),
    index: index - start,
    trimmedFrom: total,
  };
}

// lib/detail/listContext.ts
//
// 🚨 NEW-7 / NEW-12 — THE LIST A RECORD WAS OPENED FROM IS BOUNDED BEFORE IT
// RIDES ANY URL, BY RECORDS *AND* BY BYTES, IN ONE PLACE.
//
// The page presentation carries its list context in the query string
// (`?l=type.id,…&i=<n>`) and a detail WINDOW carries the same list in its
// `?panels=detail:…` token, so the arrows and `[` / `]` keep working after a
// record is opened as a page and after that window is refreshed (NEW-15).
// Uncapped, a 500-row list produced a >20 KB href — past every practical
// request-line limit (VERIFY-U-P1-R2, break attempt 5).
//
// The record cap is a KNOB, not a constant: every ceiling on this platform is a
// row an admin can change (`ui.detail.list_context_max_ids`, default 200,
// organization-overridable). But a record count is not a length: at 2000 — the
// value the knob's own `max_value` used to permit — the query was 84 KB, and even
// at 200 a 30-character type token gave 13.6 KB (VERIFY-U-P1-R3, NEW-12). So the
// trim obeys BOTH: the knob's record cap, and
// `DETAIL_LIST_CONTEXT_URL_BUDGET_BYTES` measured on the encoded value. Whichever
// bites first, the result carries the WINDOW AROUND THE CURRENT RECORD — the far
// ends of a long list are not what the arrows are for — and says the list was
// trimmed (`trimmedFrom`) rather than presenting the window as the whole thing.
//
// Nothing here talks to the settings ladder: the host resolves the knob and
// passes the number in, so the module stays package-shaped.

import {
  DETAIL_LIST_CONTEXT_URL_BUDGET_BYTES,
  type DetailListContext,
  type DetailRef,
} from "./types";

/** `type.id,type.id` — the ONE spelling of a list in a URL, page or panel token. */
export function encodeListItems(items: readonly DetailRef[]): string {
  return items
    .map((r) => `${encodeURIComponent(r.type)}.${encodeURIComponent(r.id)}`)
    .join(",");
}

/** Inverse of `encodeListItems`; entries that do not name a record are dropped. */
export function decodeListItems(value: string | null | undefined): DetailRef[] {
  if (!value) return [];
  const items: DetailRef[] = [];
  for (const key of value.split(",")) {
    const dot = key.indexOf(".");
    if (dot <= 0 || dot === key.length - 1) continue;
    items.push({
      type: decodeURIComponent(key.slice(0, dot)),
      id: decodeURIComponent(key.slice(dot + 1)),
    });
  }
  return items;
}

/** How many characters these records cost in a URL — what the budget measures. */
export function listQueryBytes(items: readonly DetailRef[]): number {
  return encodeListItems(items).length;
}

export interface TrimListContextOptions {
  /** The character budget for the encoded list. Defaults to the platform budget. */
  budgetBytes?: number;
  /**
   * How the caller will encode these records, when it is not the page query's
   * spelling — the `?panels=` token escapes every separator, so its value is
   * longer for the same records (NEW-15).
   */
  measure?: (items: readonly DetailRef[]) => number;
}

/**
 * The list as it may travel, plus what was left behind. Returns the same list
 * when it already fits both limits, and `null` for no list at all.
 */
export function trimListContext(
  list: DetailListContext | null | undefined,
  max: number,
  options: TrimListContextOptions = {},
): DetailListContext | null {
  if (!list || list.items.length === 0) return null;
  const budget = options.budgetBytes ?? DETAIL_LIST_CONTEXT_URL_BUDGET_BYTES;
  const measure = options.measure ?? listQueryBytes;
  const total = list.items.length;
  const index = list.index >= 0 && list.index < total ? list.index : 0;
  const idCap = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1;

  /** The widest window of `size` records that still contains the current one. */
  const windowOf = (size: number): { items: DetailRef[]; index: number } => {
    const half = Math.floor(size / 2);
    const start = Math.min(Math.max(index - half, 0), Math.max(total - size, 0));
    return { items: list.items.slice(start, start + size), index: index - start };
  };

  let size = Math.min(idCap, total);
  // Shrink until the encoded value fits the byte budget. One record always
  // travels: the record being shown is the list's own current position, and a
  // single entry is ~41 characters against a 6000-character budget.
  while (size > 1 && measure(windowOf(size).items) > budget) {
    const fitted = Math.max(
      1,
      Math.floor((size * budget) / Math.max(measure(windowOf(size).items), 1)),
    );
    size = fitted < size ? fitted : size - 1;
  }
  const cut = windowOf(size);
  const trimmedFrom = size < total ? total : list.trimmedFrom;
  return {
    items: cut.items,
    index: cut.index,
    ...(trimmedFrom && trimmedFrom > cut.items.length ? { trimmedFrom } : {}),
  };
}

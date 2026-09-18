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
// row an admin can change (`ui.detail.list_context_max_ids`, organization-
// overridable). But a record count is not a length: at 2000 — the value the
// knob's own `max_value` used to permit — the query was 84 KB, and even at 200 a
// 30-character type token gave 13.6 KB (VERIFY-U-P1-R3, NEW-12). So the trim
// obeys BOTH: the knob's record cap, and `DETAIL_URL_BUDGET_BYTES` measured on
// the FINAL SERIALIZED URL. Whichever bites first, the result carries the WINDOW
// AROUND THE CURRENT RECORD — the far ends of a long list are not what the arrows
// are for — and says the list was trimmed (`trimmedFrom`) rather than presenting
// the window as the whole thing.
//
// 🚨 NEW-19 (VERIFY-U-P1-R4) — AND THE BUDGET IS THE WHOLE URL'S, AFTER THE LAST
// ESCAPING. It used to be a 6,000-character allowance for the list VALUE alone,
// measured before `URLSearchParams` re-escaped it: a window deep link that
// measured 5,992 arrived in the address bar at 7,416, and a detail PAGE that also
// carried an open window was 13,433 characters — past the 8 KB request line, so
// the edge answers 414 and the link is dead. A caller now passes what the rest of
// the address already costs (`reservedBytes`) and a `measure` that returns the
// FINAL serialized length of the list as that URL will carry it.
//
// Nothing here talks to the settings ladder: the host resolves the knob and
// passes the number in, so the module stays package-shaped.

import {
  DETAIL_URL_BUDGET_BYTES,
  type DetailListContext,
  type DetailRef,
} from "./types";

/**
 * 🚨 NEW-25 (VERIFY-U-P1-R4) / N4 (VERIFY-U-P1-R5) — THE SEPARATORS ARE ESCAPED
 * WITHOUT A PERCENT, SO NO LATER URL DECODE CAN PUT ONE BACK.
 *
 * `encodeURIComponent` leaves `.` alone and every spelling of a record in a URL
 * splits on the FIRST dot, so `{type: "gr.ant", id: "x.y"}` came back as
 * `{type: "gr", id: "ant.x.y"}` — a DIFFERENT record, silently. Round 4 escaped
 * `.` `:` `,` to `%2E` `%3A` `%2C` here, which fixed the `?panels=` token (three
 * escaping layers, three decodes) and did NOT fix the page presentation's `?l=`
 * query: an ordinary query parse — `new URL(...).searchParams`, which is the
 * algorithm the page route's `searchParams` come from — percent-decodes the
 * value BEFORE `decodeListItems` splits it, so `%2E` was a literal `.` again and
 * the dotted token still retargeted the record. An id containing a comma was
 * truncated the same way (VERIFY-U-P1-R5, N4).
 *
 * So the escape carries no `%` at all. A ref part is percent-encoding spelled
 * with `~` as the escape character, over the alphabet `A-Za-z0-9-_~`: it holds
 * no `.`, `:`, `,` or `%`, which makes it invariant under any number of
 * percent-decodes and the split unambiguous on every layer. `~` itself is
 * escaped first (`%7E` → `~7E`), so the grammar is closed.
 */
const PERCENT_ESCAPE_TOO = /[.!~*'()]/g;

/** One half of a `type.id` pair, carrying no character the decoders split on. */
export function encodeRefPart(value: string): string {
  return encodeURIComponent(value)
    .replace(PERCENT_ESCAPE_TOO, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%/g, "~");
}

/** Inverse of `encodeRefPart`; a hand-edited value comes back as its own text. */
export function decodeRefPart(value: string): string {
  try {
    return decodeURIComponent(value.replace(/~/g, "%"));
  } catch {
    return value;
  }
}

/** `type.id,type.id` — the ONE spelling of a list in a URL, page or panel token. */
export function encodeListItems(items: readonly DetailRef[]): string {
  return items.map((r) => `${encodeRefPart(r.type)}.${encodeRefPart(r.id)}`).join(",");
}

/** Inverse of `encodeListItems`; entries that do not name a record are dropped. */
export function decodeListItems(value: string | null | undefined): DetailRef[] {
  if (!value) return [];
  const items: DetailRef[] = [];
  for (const key of value.split(",")) {
    const dot = key.indexOf(".");
    if (dot <= 0 || dot === key.length - 1) continue;
    items.push({
      type: decodeRefPart(key.slice(0, dot)),
      id: decodeRefPart(key.slice(dot + 1)),
    });
  }
  return items;
}

/** How many characters these records cost in a URL — what the budget measures. */
export function listQueryBytes(items: readonly DetailRef[]): number {
  return encodeListItems(items).length;
}

export interface TrimListContextOptions {
  /**
   * The character budget for the whole URL. Defaults to the platform's request
   * line (`DETAIL_URL_BUDGET_BYTES`).
   */
  budgetBytes?: number;
  /**
   * What the rest of the FINAL address already costs — the path, the query it is
   * being merged into, the token's own non-list args. The list gets what is
   * left, never a private allowance of its own (NEW-19).
   */
  reservedBytes?: number;
  /**
   * How many characters these records cost IN THE FINAL URL. The `?panels=`
   * token escapes every separator and `URLSearchParams` escapes the result
   * again, so the same records cost about 1.6× there what they cost in the page
   * query (NEW-15, NEW-19).
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
  const budget =
    (options.budgetBytes ?? DETAIL_URL_BUDGET_BYTES) - (options.reservedBytes ?? 0);
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

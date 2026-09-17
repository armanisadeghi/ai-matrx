// lib/detail/presentation.ts
//
// Pure helpers: deep-link spelling and the in-URL instance key. Deep links
// ride the host's ONE panel URL mechanism (`?panels=` in matrx-frontend),
// under the type key `detail`, so every client that already opens panels
// from a URL reaches every presentation with no new code:
//
//   ?panels=detail:<type>.<id>:as-window
//   ?panels=detail:<type>.<id>:as-docked
//
// `page` is a route (`pageHref`), never a `?panels=` token — it is the one
// presentation that changes the URL.

import {
  decodeListItems,
  decodeRefPart,
  encodeListItems,
  encodeRefPart,
  trimListContext,
} from "./listContext";
import {
  DETAIL_URL_BUDGET_BYTES,
  type DetailListContext,
  type DetailPresentation,
  type DetailRef,
} from "./types";

export const DETAIL_URL_TYPE_KEY = "detail";
export const DETAIL_URL_AS_ARG = "as";
/** The list the window was opened from, so a REFRESH keeps it (NEW-15). */
export const DETAIL_URL_LIST_ARG = "l";
export const DETAIL_URL_INDEX_ARG = "i";
export const DETAIL_URL_LIST_TOTAL_ARG = "lt";

/**
 * `type.id` — the panel URL splits tokens on `:` and args on `-`/`_`, never on
 * `.`, so the two halves carry no `.` `:` or `,` of their own.
 *
 * 🚨 NEW-25 (VERIFY-U-P1-R4) — the halves used to be raw, so a type token or an
 * id containing a dot came back as a DIFFERENT record: `{type: "gr.ant", id:
 * "x.y"}` parsed as `{type: "gr", id: "ant.x.y"}`. One encoder, one decoder
 * (`encodeRefPart` / `decodeRefPart`), the same pair the list spelling uses.
 */
export function detailInstanceKey(ref: DetailRef): string {
  return `${encodeRefPart(ref.type)}.${encodeRefPart(ref.id)}`;
}

/** Inverse of `detailInstanceKey`; `null` when the key is not `type.id`. */
export function parseDetailInstanceKey(key: string | null | undefined): DetailRef | null {
  if (!key) return null;
  const dot = key.indexOf(".");
  if (dot <= 0 || dot === key.length - 1) return null;
  return { type: decodeRefPart(key.slice(0, dot)), id: decodeRefPart(key.slice(dot + 1)) };
}

/** Which in-place presentation a URL arg names; `window` when unspecified. */
export function presentationFromUrlArg(
  value: string | undefined,
): Exclude<DetailPresentation, "page"> {
  return value === "docked" ? "docked" : "window";
}

// ─── The list context inside a `?panels=` token (NEW-15) ────────────────────
//
// 🚨 NEW-15 (VERIFY-U-P1-R3) — A REFRESHED DETAIL WINDOW KEEPS ITS LIST. The
// window's token used to carry `as` and nothing else, and the hydrator passed
// `list: null`, so a reload silently lost the previous / next controls and the
// "3/40" counter. The page URL already carried the list; the token carries the
// same three values, under the same cap and the same byte budget.
//
// THE TOKEN'S GRAMMAR IS THE CONSTRAINT. `?panels=` splits panels on `,`, a
// panel's args off on `:`, arg pairs on `_` and each pair on its first `-`. A
// uuid is full of hyphens and a list is full of commas, so a list value is
// escaped into a form holding none of those four characters: `encodeURIComponent`
// plus the unreserved characters it leaves alone. The result is percent-escaped
// again by `URLSearchParams` on the way into the address bar and decoded once on
// the way back out, which is exactly how the page query's comma already travels.

const EXTRA_ESCAPES = /[-_.!~*'()]/g;

/** A value safe to carry as a `?panels=` arg — no `,` `:` `_` or `-`. */
export function encodePanelArgValue(value: string): string {
  return encodeURIComponent(value).replace(
    EXTRA_ESCAPES,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Inverse of `encodePanelArgValue`. */
export function decodePanelArgValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A hand-edited link. Better the raw text than a thrown hydrator.
    return value;
  }
}

/**
 * 🚨 NEW-19 (VERIFY-U-P1-R4) — MEASURE THE VALUE AS THE ADDRESS BAR CARRIES IT.
 * The token's own escaping is only the first layer: `UrlPanelManager` writes the
 * whole `?panels=` value through `new URLSearchParams(...).toString()`, which
 * escapes every `%` again (a uuid's `-` goes `-` → `%2D` → `%252D`, three
 * characters becoming five). Measuring the token's spelling said 5,992 for a URL
 * the browser carried at 7,416.
 */
export function panelListValueBytes(items: readonly DetailRef[]): number {
  return encodeURIComponent(encodePanelArgValue(encodeListItems(items))).length;
}

/**
 * The length of the FINAL address a detail window's deep link produces: the path
 * and query it is merged into, plus the `panels` parameter as
 * `URLSearchParams` serializes it. What the budget is measured against, and what
 * a guard can assert.
 */
export function finalPanelUrlLength(
  pathAndQuery: string,
  tokenWithoutListArgs: string,
  listArgs: Record<string, string>,
): number {
  const args = Object.entries(listArgs)
    .map(([key, value]) => `${key}-${value}`)
    .join("_");
  const token = args ? `${tokenWithoutListArgs}_${args}` : tokenWithoutListArgs;
  const [path, existingQuery = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(existingQuery);
  params.set("panels", token);
  return `${path}?${params.toString()}`.length;
}

/**
 * What the address a panel token is written INTO really costs, after
 * `URLSearchParams` re-serializes it — a detail page's own `?l=` list carries raw
 * commas that become `%2C` the moment a `panels` parameter is merged beside it,
 * so the page's query grows by ~2× its comma count at the instant the window
 * opens. Reserving the pre-serialization length is how a page + window address
 * still overran the budget by 70 characters in the guard that found this.
 */
export function panelUrlReserveBytes(pathAndQuery: string): number {
  const [path, query = ""] = pathAndQuery.split("?");
  const serialized = new URLSearchParams(query).toString();
  return path.length + (serialized ? serialized.length + 1 : 0);
}

/**
 * The window's deep-link args for a list context — `{}` when there is no list.
 * `max` is the resolved `ui.detail.list_context_max_ids`; the budget is the
 * platform's REQUEST LINE, measured on the final serialized value, with whatever
 * the rest of the address already costs reserved (NEW-19). A caller that knows
 * the address it is writing into passes its length; one that does not gets the
 * conservative reserve below, which is what a long detail-page query costs.
 */
export function detailListToUrlArgs(
  list: DetailListContext | null | undefined,
  max: number,
  options: { reservedBytes?: number } = {},
): Record<string, string> {
  const reserved =
    options.reservedBytes ?? DEFAULT_PANEL_URL_RESERVE_BYTES;
  const capped = trimListContext(list, max, {
    measure: panelListValueBytes,
    reservedBytes: reserved + PANEL_TOKEN_FIXED_BYTES,
  });
  if (!capped) return {};
  const args: Record<string, string> = {
    [DETAIL_URL_LIST_ARG]: encodePanelArgValue(encodeListItems(capped.items)),
    [DETAIL_URL_INDEX_ARG]: String(capped.index),
  };
  if (capped.trimmedFrom) args[DETAIL_URL_LIST_TOTAL_ARG] = String(capped.trimmedFrom);
  return args;
}

/** The list a `?panels=detail:` token carries; `null` when it carries none. */
/**
 * What the token costs beside the list: `panels=detail:<type>.<id>:as-window`
 * plus the `_i-<n>_lt-<n>` args and their escaping. Measured generously so the
 * budget is never overspent by the fixed part.
 */
const PANEL_TOKEN_FIXED_BYTES = 160;

/**
 * The reserve for a caller that cannot see the address it writes into. A detail
 * PAGE carrying its own capped list is the longest address a window is opened
 * from, so the reserve is that: the budget's own share for a page query. Without
 * it, a window opened from a detail page produced a 13,433-character URL the edge
 * refuses (NEW-19).
 */
const DEFAULT_PANEL_URL_RESERVE_BYTES = Math.floor(DETAIL_URL_BUDGET_BYTES / 2);

export function detailListFromUrlArgs(
  args: Record<string, string> | null | undefined,
): DetailListContext | null {
  const raw = args?.[DETAIL_URL_LIST_ARG];
  if (!raw) return null;
  const items = decodeListItems(decodePanelArgValue(raw));
  if (items.length === 0) return null;
  const index = Number.parseInt(args?.[DETAIL_URL_INDEX_ARG] ?? "", 10);
  const total = Number.parseInt(args?.[DETAIL_URL_LIST_TOTAL_ARG] ?? "", 10);
  return {
    items,
    index: Number.isFinite(index) && index >= 0 && index < items.length ? index : 0,
    ...(Number.isFinite(total) && total > items.length ? { trimmedFrom: total } : {}),
  };
}

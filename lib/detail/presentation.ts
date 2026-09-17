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

import { trimListContext, decodeListItems, encodeListItems } from "./listContext";
import type { DetailListContext, DetailPresentation, DetailRef } from "./types";

export const DETAIL_URL_TYPE_KEY = "detail";
export const DETAIL_URL_AS_ARG = "as";
/** The list the window was opened from, so a REFRESH keeps it (NEW-15). */
export const DETAIL_URL_LIST_ARG = "l";
export const DETAIL_URL_INDEX_ARG = "i";
export const DETAIL_URL_LIST_TOTAL_ARG = "lt";

/** `type.id` — the panel URL splits tokens on `:` and args on `-`/`_`, never on `.`. */
export function detailInstanceKey(ref: DetailRef): string {
  return `${ref.type}.${ref.id}`;
}

/** Inverse of `detailInstanceKey`; `null` when the key is not `type.id`. */
export function parseDetailInstanceKey(key: string | null | undefined): DetailRef | null {
  if (!key) return null;
  const dot = key.indexOf(".");
  if (dot <= 0 || dot === key.length - 1) return null;
  return { type: key.slice(0, dot), id: key.slice(dot + 1) };
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

/** Measure a list the way the panel token will actually carry it. */
function panelListBytes(items: readonly DetailRef[]): number {
  return encodePanelArgValue(encodeListItems(items)).length;
}

/**
 * The window's deep-link args for a list context — `{}` when there is no list.
 * `max` is the resolved `ui.detail.list_context_max_ids`; the byte budget is the
 * platform's, measured on the escaped value this token really carries.
 */
export function detailListToUrlArgs(
  list: DetailListContext | null | undefined,
  max: number,
): Record<string, string> {
  const capped = trimListContext(list, max, { measure: panelListBytes });
  if (!capped) return {};
  const args: Record<string, string> = {
    [DETAIL_URL_LIST_ARG]: encodePanelArgValue(encodeListItems(capped.items)),
    [DETAIL_URL_INDEX_ARG]: String(capped.index),
  };
  if (capped.trimmedFrom) args[DETAIL_URL_LIST_TOTAL_ARG] = String(capped.trimmedFrom);
  return args;
}

/** The list a `?panels=detail:` token carries; `null` when it carries none. */
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

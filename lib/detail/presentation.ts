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

import { isDetailPresentation, type DetailPresentation, type DetailRef } from "./types";

export const DETAIL_URL_TYPE_KEY = "detail";
export const DETAIL_URL_AS_ARG = "as";

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

export function coercePresentation(
  value: unknown,
  fallback: DetailPresentation = "window",
): DetailPresentation {
  return isDetailPresentation(value) ? value : fallback;
}

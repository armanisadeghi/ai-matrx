/**
 * The `/search` URL contract — one place that builds it and one that reads it.
 *
 * The query lives in `?q=`. That is the whole state of the surface: shareable,
 * back/forward-navigable, and reloadable. Any new option (provider, count)
 * gets a param here and a reader below — never component state, or the link a
 * user sends stops matching what they saw.
 */

export const SEARCH_ROUTE = "/search";
export const SEARCH_QUERY_PARAM = "q";

/** Result count requested from the provider. */
export const SEARCH_RESULT_COUNT = 20;

export function buildSearchHref(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return SEARCH_ROUTE;
  return `${SEARCH_ROUTE}?${SEARCH_QUERY_PARAM}=${encodeURIComponent(trimmed)}`;
}

/** Normalize whatever arrives in `?q=` (missing, repeated, or blank) to one string. */
export function readSearchQuery(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return (value ?? "").trim();
}

/**
 * THE TAG FILTER — pure helpers over the shared filter dialect.
 *
 * `tags` (`tg=`) holds stamp pairs on the site's Tags dimension;
 * `tags_match` (`tm=any`) says a keyword needs ONE of them, and its absence
 * says it needs ALL of them. `cleanGscFilters` turns both into the RPC's
 * `stamps` array, so this module never talks to the server.
 */

import {
  encodeStampFilter,
  parseStampFilter,
  type GscFilters,
} from "@/features/marketing/search-console/types";

export type TagMatch = "any" | "all";

/** The tag value keys the filter holds, in order. */
export function tagFilterValues(filters: GscFilters): string[] {
  return parseStampFilter(filters.tags).map((pair) => pair.value);
}

export function tagFilterMatch(filters: GscFilters): TagMatch {
  return filters.tags_match === "any" ? "any" : "all";
}

/** Replace the tag filter. An empty list clears both keys. */
export function withTagFilter(
  filters: GscFilters,
  tagSlug: string,
  values: readonly string[],
  match: TagMatch,
): GscFilters {
  const next: GscFilters = { ...filters };
  const unique = Array.from(new Set(values.filter(Boolean)));
  if (unique.length === 0) {
    delete next.tags;
    delete next.tags_match;
    return next;
  }
  next.tags = encodeStampFilter(
    unique.map((value) => ({ dimension: tagSlug, value })),
  );
  if (match === "any") next.tags_match = "any";
  else delete next.tags_match;
  return next;
}

/** Add the tag when it is absent, remove it when it is present. */
export function toggleTagInFilter(
  filters: GscFilters,
  tagSlug: string,
  value: string,
): GscFilters {
  const current = tagFilterValues(filters);
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return withTagFilter(filters, tagSlug, next, tagFilterMatch(filters));
}

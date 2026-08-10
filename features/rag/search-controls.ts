/**
 * features/rag/search-controls.ts
 *
 * The RAG Search Lab's CONTROL vocabulary — the one place that knows what the
 * search form's scope and pipeline knobs can say. Deliberately runtime
 * dependency-free (the single import is type-only) so every consumer can share
 * it without a cycle:
 *
 *  - `RagSearchExperience` renders its source-kind toggle and bounds its
 *    multi-query input from these constants,
 *  - `rag-search.manifest.ts` interpolates the vocabulary into its
 *    `writeTargets` contract prose, and the Search tab's write handlers
 *    validate agent input against it.
 *
 * The point is that the enum an agent is TOLD about, the enum its value is
 * CHECKED against, and the enum the UI actually renders cannot drift apart —
 * they are all this list. Never re-type these literals at a call site.
 *
 * WHY THE FILTER IS A SUBSET OF `SOURCE_KINDS`: the canonical source-kind
 * vocabulary (`types/data-stores-ext.ts`) has five kinds, but the Search Lab's
 * toggle only offers three. `processed_document` and `library_doc` are reached
 * through the DATA STORE selector, not this filter. Each entry below is typed
 * `SourceKind`, so a kind that stops existing canonically is a compile error
 * here rather than a filter that silently matches nothing.
 */

import type { SourceKind } from "@/features/rag/types/data-stores-ext";

/**
 * Every position the Search Lab's source-kind toggle can be in.
 *
 * `sourceKind` is what the filter sends to the retrieval API — `null` for
 * "all", which sends NO filter (everything the user can see), not an empty
 * one. The write handler uses this table to map an agent's requested kind list
 * back onto the single toggle position that can actually render it.
 */
export const SEARCH_SOURCE_KIND_FILTERS = [
  {
    /** The toggle's internal value, and what `kindFilter` state holds. */
    value: "all",
    /** The button label the user sees. */
    label: "All",
    /** The canonical source kind this position filters to — null = no filter. */
    sourceKind: null,
  },
  {
    value: "cld_file",
    label: "Files",
    sourceKind: "cld_file" satisfies SourceKind,
  },
  {
    value: "note",
    label: "Notes",
    sourceKind: "note" satisfies SourceKind,
  },
  {
    value: "code_file",
    label: "Code",
    sourceKind: "code_file" satisfies SourceKind,
  },
] as const;

/** The toggle position vocabulary — what `kindFilter` state holds. */
export type SourceKindFilter =
  (typeof SEARCH_SOURCE_KIND_FILTERS)[number]["value"];

/** One entry of {@link SEARCH_SOURCE_KIND_FILTERS}. */
export type SearchSourceKindFilterSpec =
  (typeof SEARCH_SOURCE_KIND_FILTERS)[number];

/**
 * The subset of `SourceKind` this surface's toggle can filter to — narrower
 * than `SourceKind` itself, which also carries the kinds reached through the
 * data store selector rather than this filter.
 */
export type FilterableSourceKind = NonNullable<
  SearchSourceKindFilterSpec["sourceKind"]
>;

/**
 * The source kinds the toggle can actually FILTER to (excludes "all", which is
 * the absence of a filter). This is the exact list an agent may send in the
 * `retrieval_source_kinds` write target.
 */
export const FILTERABLE_SOURCE_KINDS: readonly FilterableSourceKind[] =
  SEARCH_SOURCE_KIND_FILTERS.flatMap((f) =>
    f.sourceKind === null ? [] : [f.sourceKind],
  );

/** `"cld_file" | "note" | "code_file"` — interpolate this, never re-type it. */
export const FILTERABLE_SOURCE_KIND_ENUM_TEXT = FILTERABLE_SOURCE_KINDS.map(
  (k) => `"${k}"`,
).join(" | ");

/** Lookup by the canonical source kind the position filters to. */
export const SEARCH_FILTER_BY_SOURCE_KIND = Object.fromEntries(
  SEARCH_SOURCE_KIND_FILTERS.flatMap((f) =>
    f.sourceKind === null ? [] : [[f.sourceKind, f] as const],
  ),
) as Record<FilterableSourceKind, SearchSourceKindFilterSpec | undefined>;

/** Runtime guard — is this a source kind the toggle can actually render? */
export function isFilterableSourceKind(
  value: unknown,
): value is FilterableSourceKind {
  return (
    typeof value === "string" &&
    (FILTERABLE_SOURCE_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Bounds of the multi-query expansion count — the `min`/`max` the sidebar's
 * number input enforces on the user, and therefore the exact bounds the write
 * handler enforces on an agent. One source, so a bound can never be raised in
 * the UI and left stale in the agent contract.
 */
export const MULTI_QUERY_MIN = 1;
export const MULTI_QUERY_MAX = 5;
/** What the sidebar starts at — 1 means no paraphrase expansion at all. */
export const MULTI_QUERY_DEFAULT = 1;

/** Runtime guard for the multi-query count — integer, in bounds. */
export function isValidMultiQuery(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MULTI_QUERY_MIN &&
    value <= MULTI_QUERY_MAX
  );
}

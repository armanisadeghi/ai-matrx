/**
 * features/rag/search-controls.ts
 *
 * The RAG Search Lab's RETRIEVAL-CONTROL vocabulary — the one place that knows
 * what the Search tab's source-kind filter and multi-query dial can say.
 * Deliberately dependency-free (no React, no Redux, no imports at all) so every
 * consumer can share it without a cycle:
 *
 *  - `RagSearchExperience` renders its `KindToggle` buttons and bounds its
 *    multi-query number input from these constants,
 *  - its surface write handlers validate agent input against the SAME guards,
 *  - `rag-search.manifest.ts` interpolates the vocabulary into its
 *    `writeTargets` contract prose.
 *
 * The point is that the enum an agent is TOLD about, the enum its value is
 * CHECKED against, and the enum the UI actually renders cannot drift apart —
 * they are all this list. Never re-type these literals at a call site.
 *
 * NOT the same list as `SOURCE_KINDS` in `features/rag/types/data-stores-ext`.
 * That one enumerates every source kind the RAG index can HOLD (including
 * `processed_document` and `library_doc`); this one is the narrower set the
 * Search tab actually offers as a filter, plus the `"all"` no-filter option
 * that has no source-kind at all. Conflating them would advertise a filter
 * button the page does not render.
 */

/**
 * Every source-kind filter the Search tab's toggle offers, in UI order.
 *
 * `sourceKinds` is what the filter resolves to on the wire: `null` for `"all"`
 * (send no `source_kinds` at all — an ABSENT filter, not an empty one), and a
 * single-kind array otherwise. The surface reports that resolved array as its
 * `source_kinds` read value, which is why the read twin is an array while the
 * control itself is a single choice.
 */
export const SOURCE_KIND_FILTERS = [
  {
    /** Public value — what the write target accepts and the toggle stores. */
    value: "all",
    /** The toggle button label. */
    label: "All",
    /** What this filter sends as `source_kinds`; null = no filter at all. */
    sourceKinds: null,
    /** Model-facing gloss, interpolated into the write-target contract. */
    summary: "every indexed kind — no filter",
  },
  {
    value: "cld_file",
    label: "Files",
    sourceKinds: ["cld_file"],
    summary: "uploaded documents and PDFs only",
  },
  {
    value: "note",
    label: "Notes",
    sourceKinds: ["note"],
    summary: "the user's own notes only",
  },
  {
    value: "code_file",
    label: "Code",
    sourceKinds: ["code_file"],
    summary: "indexed source files only",
  },
] as const;

/** The filter vocabulary — what the toggle stores, what writes accept. */
export type SourceKindFilter = (typeof SOURCE_KIND_FILTERS)[number]["value"];

/** One entry of {@link SOURCE_KIND_FILTERS}. */
export type SourceKindFilterSpec = (typeof SOURCE_KIND_FILTERS)[number];

/** The filter values, in UI order — for enum prose and validation. */
export const SOURCE_KIND_FILTER_VALUES: readonly SourceKindFilter[] =
  SOURCE_KIND_FILTERS.map((f) => f.value);

/** `"all | cld_file | note | code_file"` — interpolate this, never re-type it. */
export const SOURCE_KIND_FILTER_ENUM_TEXT =
  SOURCE_KIND_FILTER_VALUES.join(" | ");

/** Lookup by filter value. */
export const SOURCE_KIND_FILTER_BY_VALUE: Record<
  SourceKindFilter,
  SourceKindFilterSpec
> = Object.fromEntries(
  SOURCE_KIND_FILTERS.map((f) => [f.value, f]),
) as Record<SourceKindFilter, SourceKindFilterSpec>;

/** Runtime guard — the check the write handler runs on agent input. */
export function isSourceKindFilter(value: unknown): value is SourceKindFilter {
  return (
    typeof value === "string" &&
    (SOURCE_KIND_FILTER_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Bounds of the multi-query dial — the `min`/`max` the sidebar's number input
 * enforces on the user, and therefore the exact bounds the write handler
 * enforces on an agent. One source, so a bound can never be widened in the UI
 * and left stale in the agent contract.
 */
export const MULTI_QUERY_MIN = 1;
export const MULTI_QUERY_MAX = 5;
/** No expansion — one embedded query. The dial's starting value. */
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

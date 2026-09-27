/**
 * features/rag/search-controls.ts
 *
 * The Knowledge Search Lab's CONTROL vocabulary — the one place that knows what the
 * search form's scope and pipeline knobs can say. Deliberately runtime
 * dependency-light (it reads only the Sources page's pure kind table) so every
 * consumer can share it without a cycle:
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
 * THE KINDS ARE THE SOURCES PAGE'S KINDS (2026-09-27): the toggle used to
 * offer Files / Notes / Code only, so a person could not narrow a search to the
 * web pages, transcripts and pasted text the Sources page lists. Positions are
 * now derived from `SOURCE_KIND_GROUP_KINDS` (features/sources/sourceRows.ts) —
 * the same table the Sources page's Kind column reads — plus the legacy curated
 * library, so a kind the Sources page shows can never be missing here. Each
 * position sends every stored `source_kind` token of its kind.
 */

import {
  SOURCE_KIND_GROUP_KINDS,
  SOURCE_KIND_LABEL,
  type SourceKindGroup,
} from "@/features/sources/sourceRows";

type KindPosition = Exclude<SourceKindGroup, "other">;

export interface SearchSourceKindFilterSpec {
  /** The toggle's internal value, and what `kindFilter` state holds. */
  value: "all" | KindPosition | "library_doc";
  /** The button label the user sees — the Sources page's word. */
  label: string;
  /** The stored source kinds this position sends — null = no filter (All). */
  sourceKinds: readonly string[] | null;
}

/** The order a person reads the kinds in. */
const POSITION_ORDER: readonly KindPosition[] = [
  "file",
  "web_page",
  "transcript",
  "note",
  "pasted_text",
];

/** Every position the Search page's source-kind toggle can be in. */
export const SEARCH_SOURCE_KIND_FILTERS: readonly SearchSourceKindFilterSpec[] = [
  { value: "all", label: "All", sourceKinds: null },
  ...POSITION_ORDER.map((group) => ({
    value: group,
    label: SOURCE_KIND_LABEL[group],
    sourceKinds: SOURCE_KIND_GROUP_KINDS[group],
  })),
  { value: "library_doc", label: "Library", sourceKinds: ["library_doc"] },
];

/** The toggle position vocabulary — what `kindFilter` state holds. */
export type SourceKindFilter = SearchSourceKindFilterSpec["value"];

/** A stored source kind the toggle can filter to. */
export type FilterableSourceKind = string;

/**
 * Every stored source kind the toggle can FILTER to (excludes "all", which is
 * the absence of a filter). This is the exact list an agent may send in the
 * `retrieval_source_kinds` write target.
 */
export const FILTERABLE_SOURCE_KINDS: readonly FilterableSourceKind[] =
  SEARCH_SOURCE_KIND_FILTERS.flatMap((f) => f.sourceKinds ?? []);

/** `"cld_file" | "legacy" | …` — interpolate this, never re-type it. */
export const FILTERABLE_SOURCE_KIND_ENUM_TEXT = FILTERABLE_SOURCE_KINDS.map(
  (k) => `"${k}"`,
).join(" | ");

/** The source kinds a filter position sends (undefined = All, no filter). */
export function sourceKindsForFilter(
  value: SourceKindFilter,
): string[] | undefined {
  const spec = SEARCH_SOURCE_KIND_FILTERS.find((f) => f.value === value);
  return spec?.sourceKinds ? [...spec.sourceKinds] : undefined;
}

/**
 * The ONE position that renders this kind list, or null when the kinds belong
 * to different positions (the toggle is single-select) or are unknown.
 */
export function searchFilterForKinds(
  kinds: readonly string[],
): SearchSourceKindFilterSpec | null {
  const positions = new Set(
    kinds.map(
      (kind) =>
        SEARCH_SOURCE_KIND_FILTERS.find((f) => f.sourceKinds?.includes(kind))
          ?.value ?? null,
    ),
  );
  if (positions.size !== 1 || positions.has(null)) return null;
  const [value] = positions;
  return SEARCH_SOURCE_KIND_FILTERS.find((f) => f.value === value) ?? null;
}

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

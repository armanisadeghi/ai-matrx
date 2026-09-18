// features/marketing/seo/topical-map/views/table/tableRows.ts
//
// The table's row shape and the pure decisions behind R10 (hierarchy vs flat).
// Nothing here touches React or the store: `TopicTable.tsx` feeds it store
// values and dispatches what it decides, so every rule below is testable
// against the real reducer without a renderer.
//
// THE HIERARCHY IS THE SELECTOR'S. In hierarchy mode the rows are exactly
// `selectVisibleMapTopics` — expansion, ancestor-keeping search and sibling
// order all come from the store, and the table draws them in the order given.
// A flat sort of those rows would put a child above its parent while the
// indent still claimed otherwise; that is the lie R10 exists to prevent, so
// any sort the walk cannot express, and any column filter at all, flips the
// table to an honest flat list of EVERY loaded topic.

import type { SortState } from "@ai-matrx/design-system/data-table/types";

import type {
  MapSiblingSort,
  NormalizedMapTopic,
  VisibleMapTopic,
} from "../../redux/types";
import type { TopicIntentRollup } from "./intentRollup";

/** Every column the table can show, in its canonical order. Ids match the `table_default_columns` knob. */
export const TABLE_COLUMN_IDS = [
  "topic",
  "pages",
  "planned",
  "keywords",
  "status",
  "facets",
  "leaving",
  "arriving",
  "updated",
  "description",
] as const;

export type TableColumnId = (typeof TABLE_COLUMN_IDS)[number];

export function isTableColumnId(value: string): value is TableColumnId {
  return (TABLE_COLUMN_IDS as readonly string[]).includes(value);
}

export const TABLE_COLUMN_LABELS: Record<TableColumnId, string> = {
  topic: "Topic",
  pages: "Pages",
  planned: "Planned",
  keywords: "Keywords",
  status: "Status",
  facets: "Facets",
  leaving: "Leaving",
  arriving: "Arriving",
  updated: "Updated",
  description: "Description",
};

/** One row of the table, in either mode. */
export interface MapTableRow {
  slug: string;
  name: string;
  /** Depth from the root — drawn as indent in hierarchy mode, as a path in flat mode. */
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  checked: boolean;
  topic: NormalizedMapTopic;
  /** Root-first ancestor NAMES, for the flat view's path line. Empty at the root. */
  ancestors: string[];
  /** Undefined until the page intents have been listed — never a zero. */
  rollup: TopicIntentRollup | undefined;
  /** `seo.map_topic.updated_at`, joined by slug; undefined until the rows are read. */
  updatedAt: string | undefined;
}

export interface RowEnrichment {
  /** Null = intents not listed for this workspace; every rollup stays undefined. */
  rollups: Map<string, TopicIntentRollup> | null;
  /** Null = the topic rows were not read; every `updatedAt` stays undefined. */
  updatedAtBySlug: Map<string, string> | null;
}

function ancestorsOf(
  topic: NormalizedMapTopic,
  topicsBySlug: Record<string, NormalizedMapTopic>,
): string[] {
  const names: string[] = [];
  let cursor = topic.parentSlug;
  // Bounded by the number of topics so a cyclic payload cannot spin.
  let guard = Object.keys(topicsBySlug).length;
  while (cursor && guard-- > 0) {
    const parent = topicsBySlug[cursor];
    names.unshift(parent?.name ?? cursor);
    cursor = parent?.parentSlug ?? null;
  }
  return names;
}

function enrich(
  slug: string,
  enrichment: RowEnrichment,
): Pick<MapTableRow, "rollup" | "updatedAt"> {
  return {
    rollup:
      enrichment.rollups === null
        ? undefined
        : (enrichment.rollups.get(slug) ?? { leaving: 0, arriving: 0 }),
    updatedAt: enrichment.updatedAtBySlug?.get(slug),
  };
}

/** Hierarchy mode: the selector's rows, in its order, one table row each. */
export function hierarchyRows(
  visible: readonly VisibleMapTopic[],
  topicsBySlug: Record<string, NormalizedMapTopic>,
  enrichment: RowEnrichment,
): MapTableRow[] {
  return visible.map((row) => ({
    slug: row.slug,
    name: row.name,
    depth: row.depth,
    hasChildren: row.hasChildren,
    expanded: row.expanded,
    selected: row.selected,
    checked: row.checked,
    topic: row.topic,
    ancestors: ancestorsOf(row.topic, topicsBySlug),
    ...enrich(row.slug, enrichment),
  }));
}

/**
 * Flat mode: EVERY loaded topic regardless of expansion, so a sort or a filter
 * runs over the whole map and never over "what happened to be unfolded".
 */
export function flatRows(
  topicsBySlug: Record<string, NormalizedMapTopic>,
  selectedSlug: string | null,
  checkedSlugs: readonly string[],
  enrichment: RowEnrichment,
): MapTableRow[] {
  const checked = new Set(checkedSlugs);
  return Object.values(topicsBySlug).map((topic) => ({
    slug: topic.slug,
    name: topic.name,
    depth: topic.depth,
    hasChildren: topic.childSlugs.length > 0 || (topic.childrenCount ?? 0) > 0,
    expanded: false,
    selected: selectedSlug === topic.slug,
    checked: checked.has(topic.slug),
    topic,
    ancestors: ancestorsOf(topic, topicsBySlug),
    ...enrich(topic.slug, enrichment),
  }));
}

// ── R10: which sorts the hierarchy can honour ──────────────────────────────

/**
 * The sorts `selectVisibleMapTopics` can express while keeping the tree honest.
 * `name` ascends; the three counts DESCEND (the selector's own contract —
 * biggest first, unloaded last). Anything else is a flat sort.
 */
const HIERARCHY_SORTS: Record<string, { sort: MapSiblingSort; direction: "asc" | "desc" }> = {
  topic: { sort: "name", direction: "asc" },
  pages: { sort: "pages", direction: "desc" },
  planned: { sort: "planned", direction: "desc" },
  keywords: { sort: "keywords", direction: "desc" },
};

/** The table's sort state that mirrors the workspace's sibling sort (header arrows). */
export function sortStateForSiblingSort(sort: MapSiblingSort): SortState | null {
  for (const [id, entry] of Object.entries(HIERARCHY_SORTS)) {
    if (entry.sort === sort) return { id, direction: entry.direction };
  }
  return null;
}

/**
 * What a header-click sort means in hierarchy mode.
 *
 * - `{ kind: "sibling", sort }` — the walk can honour it; dispatch `setSiblingSort`.
 * - `{ kind: "flat", sort }` — it cannot; flip to flat carrying this sort.
 * - `null` sort → back to the tree's own order.
 */
export function classifyHierarchySort(
  next: SortState | null,
):
  | { kind: "sibling"; sort: MapSiblingSort }
  | { kind: "flat"; sort: SortState } {
  if (next === null) return { kind: "sibling", sort: "sort_order" };
  const entry = HIERARCHY_SORTS[next.id];
  if (entry && entry.direction === next.direction) {
    return { kind: "sibling", sort: entry.sort };
  }
  return { kind: "flat", sort: next };
}

/** True when any column filter carries a value — the second R10 flip trigger. */
export function hasActiveColumnFilter(
  filters: Record<string, unknown | undefined>,
): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

/**
 * Resolves the visible, ordered column set: the workspace's choice when it has
 * one, else the knob's default. Unknown ids (a knob edited to a column this
 * build does not have, or a stale persisted choice) are DROPPED, not rendered
 * blank — and `topic` is always present and always first, because a table of
 * topics with no topic column orients nobody.
 */
export function resolveVisibleColumns(
  chosen: readonly string[] | null,
  knobDefault: readonly string[],
): TableColumnId[] {
  const source = chosen ?? knobDefault;
  const ordered: TableColumnId[] = ["topic"];
  for (const id of source) {
    if (isTableColumnId(id) && !ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

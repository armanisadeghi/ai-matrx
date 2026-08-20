// features/crm/deals/views.ts
//
// The deals list's smart-view definition — the deals counterpart of
// `features/crm/saved-views/types.ts` (which owns the PARTY definition). Both
// persist into the same `crm.saved_view` table, discriminated by `list_key`;
// the generic bar + service in `saved-views/` serve both through a codec.

import type { SavedViewCodec } from "../saved-views/service";
import type {
  DealDateBucket,
  DealListFilters,
  DealListQuery,
  DealSortDirection,
  DealSortKey,
  DealStatusFilter,
} from "./types";
import {
  DEAL_DATE_BUCKET_VALUES,
  DEAL_SORT_DIRECTIONS,
  DEAL_SORT_KEYS,
  DEAL_STATUS_FILTERS,
  DEAL_STATUS_FILTER_LABEL,
  DEFAULT_DEAL_QUERY,
} from "./types";

export const DEAL_VIEW_DEFINITION_VERSION = 1;

export interface DealViewDefinition {
  version: number;
  pipelineId: string | null;
  search: string;
  filters: DealListFilters;
  sort: DealSortKey;
  direction: DealSortDirection;
}

const DEFAULT_DEFINITION: DealViewDefinition = {
  version: DEAL_VIEW_DEFINITION_VERSION,
  pipelineId: null,
  search: "",
  filters: { status: "open" },
  sort: "updated_at",
  direction: "desc",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseFilters(raw: unknown): DealListFilters {
  if (!isRecord(raw)) return {};
  const out: DealListFilters = {};
  if (typeof raw.name === "string" && raw.name.trim()) out.name = raw.name.trim();
  if (Array.isArray(raw.stage_id)) {
    const ids = raw.stage_id.filter((v): v is string => typeof v === "string");
    if (ids.length) out.stage_id = Array.from(new Set(ids));
  }
  if (typeof raw.assigned_to === "string" && raw.assigned_to)
    out.assigned_to = raw.assigned_to;
  if (
    typeof raw.status === "string" &&
    (DEAL_STATUS_FILTERS as readonly string[]).includes(raw.status)
  ) {
    out.status = raw.status as DealStatusFilter;
  }
  for (const key of ["expected_close_date", "updated_at", "created_at"] as const) {
    const v = raw[key];
    if (
      typeof v === "string" &&
      (DEAL_DATE_BUCKET_VALUES as readonly string[]).includes(v)
    ) {
      out[key] = v as DealDateBucket;
    }
  }
  return out;
}

/** Read a stored definition defensively — drifted blobs open as the default. */
export function parseDealViewDefinition(raw: unknown): DealViewDefinition {
  if (!isRecord(raw)) return { ...DEFAULT_DEFINITION };
  return {
    version: DEAL_VIEW_DEFINITION_VERSION,
    pipelineId: typeof raw.pipelineId === "string" ? raw.pipelineId : null,
    search: typeof raw.search === "string" ? raw.search : "",
    filters: parseFilters(raw.filters),
    sort:
      typeof raw.sort === "string" &&
      (DEAL_SORT_KEYS as readonly string[]).includes(raw.sort)
        ? (raw.sort as DealSortKey)
        : DEFAULT_DEFINITION.sort,
    direction:
      typeof raw.direction === "string" &&
      (DEAL_SORT_DIRECTIONS as readonly string[]).includes(raw.direction)
        ? (raw.direction as DealSortDirection)
        : DEFAULT_DEFINITION.direction,
  };
}

export const DEAL_VIEW_CODEC: SavedViewCodec<DealViewDefinition> = {
  listKey: "deals",
  parse: parseDealViewDefinition,
};

/** Capture what the list shows RIGHT NOW as a definition. */
export function dealDefinitionFromQuery(
  query: DealListQuery,
  sort: { sort: string; direction: DealSortDirection },
): DealViewDefinition {
  return parseDealViewDefinition({
    version: DEAL_VIEW_DEFINITION_VERSION,
    pipelineId: query.pipelineId,
    search: query.search,
    filters: query.filters,
    sort: sort.sort,
    direction: sort.direction,
  });
}

/** A definition → the list query it describes (always live records, page 1). */
export function dealQueryFromDefinition(
  definition: DealViewDefinition,
): DealListQuery {
  return {
    ...DEFAULT_DEAL_QUERY,
    pipelineId: definition.pipelineId,
    search: definition.search,
    filters: definition.filters,
    page: 1,
    view: "active",
  };
}

export function dealDefinitionsMatch(
  a: DealViewDefinition,
  b: DealViewDefinition,
): boolean {
  return stableKey(a) === stableKey(b);
}

function stableKey(definition: DealViewDefinition): string {
  const filters = Object.entries(definition.filters)
    .filter(([, v]) => v !== undefined)
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v]);
  return JSON.stringify([
    definition.pipelineId,
    definition.search.trim(),
    filters,
    definition.sort,
    definition.direction,
  ]);
}

/** Human summary of what a view narrows to — chip tooltips and menus. */
export function describeDealDefinition(definition: DealViewDefinition): string {
  const parts: string[] = [];
  parts.push(definition.pipelineId ? "One pipeline" : "Every pipeline");
  const f = definition.filters;
  if (f.status && f.status !== "all")
    parts.push(`${DEAL_STATUS_FILTER_LABEL[f.status]} deals`);
  if (definition.search.trim())
    parts.push(`matching "${definition.search.trim()}"`);
  if (f.name) parts.push(`name ~ ${f.name}`);
  if (f.stage_id?.length) parts.push(`${f.stage_id.length} stage(s)`);
  if (f.assigned_to) parts.push("one owner");
  if (f.expected_close_date) parts.push(`closing within ${f.expected_close_date}`);
  if (f.updated_at) parts.push(`updated ${f.updated_at}`);
  if (f.created_at) parts.push(`created ${f.created_at}`);
  return parts.join(" · ");
}

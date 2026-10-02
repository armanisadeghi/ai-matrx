// lib/entity-list/dimensionFilter.ts
//
// THE DIMENSION FILTER — the list's third axis (lane 3 INTEGRATION, W1.5, 2026-10-02).
//
//   All | Mine | My team | My Orgs | Shared | Public | System   [ Any dimension ▾ ] [ All organizations ▾ ]
//
// A Dimension (vocabulary: common-docs/systems/platform/vocabulary/FEATURE.md) is a column a list can be
// narrowed by; its Values are what a person links records to (Practice Area → Sports rehab). Picking one
// shows only the rows linked to that Value. Default Any.
//
// WHERE IT LIVES: in the query's ONE filter bag, under the reserved key `__dimension`, shaped like every
// other multi-select filter (`{ kind: "select", values: [<value id>] }`). So it rides the URL with the
// rest of the query (`?filters=`), is never persisted as a preference (the query never is), "Clear
// filters" clears it, and every list RPC already receives it in `p_filters` with no service change.
//
// WHERE IT IS APPLIED: server-side, never in the browser — each `*_list_scoped` body carries
// `AND (NOT v_f ? '__dimension' OR j.id = ANY(coalesce((SELECT platform.list_dimension_ids(v_f, '<token>')), '{}')))`,
// so the linked ids are read ONCE per call (migrations/campaign/integration_w15_*.sql and _w15b_*.sql; a
// per-row EXISTS took the filtered /agents/all past the 8 s statement timeout). A list declares that its
// RPC honours it with `config.dimensionFilter: true`; the shell shows the control only then, so a list
// whose server would ignore the key never wears a control that does nothing.
//
// It is independent of the active organization (law: active-org-is-never-a-list-filter): the Values come
// from every organization the person belongs to (`useListDimensions`).

import type { EntityFilters } from "./types";

/** The reserved filter-bag key. The server door reads exactly this name. */
export const DIMENSION_FILTER_KEY = "__dimension";

/** The chosen Value id, or null for Any. */
export function dimensionValueOf(filters: EntityFilters): string | null {
  const f = filters[DIMENSION_FILTER_KEY];
  if (!f || f.kind !== "select") return null;
  return f.values[0] ?? null;
}

/** The same bag with the Dimension set to one Value, or removed (Any). Never mutates. */
export function withDimensionValue(filters: EntityFilters, valueId: string | null): EntityFilters {
  const next = { ...filters };
  if (valueId) next[DIMENSION_FILTER_KEY] = { kind: "select", values: [valueId] };
  else delete next[DIMENSION_FILTER_KEY];
  return next;
}

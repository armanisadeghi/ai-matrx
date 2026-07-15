/**
 * features/scopes/utils/referenceSource.ts
 *
 * The "bound source" a context item can point at: a CONTAINER (a dataset/table or
 * a structured list) fixed on the item DEFINITION, plus the DIMENSION set per scope
 * (row/column/cell/group) or resolved dynamically by a filter.
 *
 * INTERIM representation — stored as `context_items.reference_source` JSONB to ship
 * fast; the permanent model is likely one or more dedicated tables. See
 * docs/handoffs/dimensional-reference-values.md.
 */

export type ReferenceContainerType =
  | "dataset"
  | "structured_list"
  | "dataset_template";

/**
 * What part of the container is the value.
 * - `whole`  — the entire table / list IS the value.
 * - `row`    — a dataset row (table_row).
 * - `column` — a dataset column (table_column).
 * - `cell`   — one dataset cell (table_cell); pairs with `column`.
 * - `group`  — a structured-list group (grouped lists only).
 */
export type ReferenceDimension = "whole" | "row" | "column" | "cell" | "group";

/** A dynamic predicate — the matching element is resolved wherever the value is shown or needed. */
export interface ReferenceSourceFilter {
  column: string;
  /** Comparison operator, e.g. "=", "!=", "in". */
  op: string;
  /** Literal, or a token like "$scope.id" resolved at read time. */
  value: string;
}

export interface BoundContainerReferenceSource {
  container_type: "dataset" | "structured_list";
  /** The fixed dataset table_id / structured-list list_id. */
  container_id: string;
  dimension: ReferenceDimension;
  /** Bound column for `column` / `cell` (and the default filter column). */
  column?: string | null;
  /** Present only for the dynamic case; when set, there is no per-scope value. */
  filter?: ReferenceSourceFilter | null;
}

/** One immutable-shape dataset is provisioned automatically for every scope. */
export interface DatasetTemplateReferenceSource {
  container_type: "dataset_template";
  template_id: string;
  dimension: "whole";
  provision: "per_scope";
}

export type ReferenceSource =
  | BoundContainerReferenceSource
  | DatasetTemplateReferenceSource;

/** Narrow unknown JSON (DB/RPC gives `reference_source` as `Json | null`) to a ReferenceSource. */
export function parseReferenceSource(raw: unknown): ReferenceSource | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.container_type === "dataset_template") {
    if (typeof o.template_id !== "string") return null;
    return {
      container_type: "dataset_template",
      template_id: o.template_id,
      dimension: "whole",
      provision: "per_scope",
    };
  }
  if (
    (o.container_type !== "dataset" &&
      o.container_type !== "structured_list") ||
    typeof o.container_id !== "string"
  ) {
    return null;
  }
  const dimension =
    typeof o.dimension === "string" ? (o.dimension as ReferenceDimension) : "whole";
  const filterRaw = o.filter;
  let filter: ReferenceSourceFilter | null = null;
  if (filterRaw && typeof filterRaw === "object") {
    const f = filterRaw as Record<string, unknown>;
    if (typeof f.column === "string" && typeof f.value === "string") {
      filter = {
        column: f.column,
        op: typeof f.op === "string" ? f.op : "=",
        value: f.value,
      };
    }
  }
  return {
    container_type: o.container_type,
    container_id: o.container_id,
    dimension,
    column: typeof o.column === "string" ? o.column : null,
    filter,
  };
}

/** True when the value is resolved by a filter (no per-scope value is set). */
export function isDynamicReferenceSource(src: ReferenceSource | null): boolean {
  return !!src && "filter" in src && !!src.filter;
}

// features/mandates/admin-list/service.ts
//
// The entity-list service triple over the in-memory corpus (./store.ts):
// scope → search (the table package's own ranker, applied to the whole
// corpus BEFORE paging) → column filters → sort → page. Counts and facets come
// from the same rows, so a tab number, a filter option and the rows behind
// them can never disagree.
//
// Scopes (admin list):
//   mine    created by the viewer
//   orgs    homed in one of the viewer's organizations (narrowable to one)
//   system  homed in the platform's system organization

import { rankTableSearchRows } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import type {
  EntityFacets,
  EntityListPage,
  EntityListQuery,
  EntityListSort,
  EntityScopeCounts,
  ScopeNarrowOption,
} from "@/lib/entity-list/types";
import type { ListScope } from "@/lib/list-scope/types";
import { FIELDS, searchTextOf } from "./fields";
import type { MandateAdminRow } from "./types";

export interface MandateAdminViewer {
  userId: string | null;
}

const SEARCH_COLUMNS: MatrxColumnDef<MandateAdminRow>[] = [
  { id: "name", accessorKey: "name", header: "Mandate" },
  { id: "mandateKey", accessorKey: "mandateKey", header: "Key" },
  { id: "featureLabel", accessorKey: "featureLabel", header: "Feature" },
  { id: "agentName", accessorKey: "agentName", header: "Mandate Holder" },
];

export function inScope(
  row: MandateAdminRow,
  scope: ListScope,
  viewer: MandateAdminViewer,
): boolean {
  switch (scope.kind) {
    case "mine":
      return viewer.userId !== null && row.createdBy === viewer.userId;
    case "orgs":
      return (
        !row.isSystem &&
        (scope.organizationId === null ||
          row.organizationId === scope.organizationId)
      );
    case "system":
      return row.isSystem;
    default:
      return false;
  }
}

export function searchRows(
  rows: MandateAdminRow[],
  search: string,
): MandateAdminRow[] {
  const term = search.trim();
  if (!term) return rows;
  return rankTableSearchRows(rows, SEARCH_COLUMNS, term, undefined, searchTextOf);
}

export function applyFilters(
  rows: MandateAdminRow[],
  filters: EntityListQuery["filters"],
  skip?: string,
): MandateAdminRow[] {
  const entries = Object.entries(filters).filter(([id]) => id !== skip);
  if (entries.length === 0) return rows;
  return rows.filter((row) =>
    entries.every(([id, filter]) => {
      const field = FIELDS[id];
      if (!field) return true;
      const values = field.values(row);
      if (filter.kind === "select") {
        return filter.values.some((wanted) => values.includes(wanted));
      }
      if (filter.kind === "boolean") {
        return values.includes(String(filter.value));
      }
      const needle = filter.value.toLowerCase();
      return values.some((value) => value.toLowerCase().includes(needle));
    }),
  );
}

export function sortRows(
  rows: MandateAdminRow[],
  sort: string,
  direction: "asc" | "desc",
): MandateAdminRow[] {
  const field = FIELDS[sort] ?? FIELDS.name;
  const sign = direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const a = field.sort(left);
    const b = field.sort(right);
    const order =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b));
    return order !== 0
      ? order * sign
      : left.mandateKey.localeCompare(right.mandateKey);
  });
}

export function queryRows(
  rows: MandateAdminRow[],
  query: EntityListQuery,
  viewer: MandateAdminViewer,
  sort: { sort: string; direction: "asc" | "desc" } | null,
): MandateAdminRow[] {
  const scoped = rows.filter((row) => inScope(row, query.scope, viewer));
  const filtered = applyFilters(scoped, query.filters);
  // A search ranks by relevance; an explicit sort otherwise.
  if (query.search.trim()) return searchRows(filtered, query.search);
  return sort ? sortRows(filtered, sort.sort, sort.direction) : filtered;
}

export function pageOf(
  rows: MandateAdminRow[],
  query: EntityListQuery,
  viewer: MandateAdminViewer,
  sort: EntityListSort,
): EntityListPage<MandateAdminRow> {
  const all = queryRows(rows, query, viewer, sort);
  const start = (query.page - 1) * sort.pageSize;
  return { rows: all.slice(start, start + sort.pageSize), total: all.length };
}

export function countsOf(
  rows: MandateAdminRow[],
  query: EntityListQuery,
  viewer: MandateAdminViewer,
  organizationNames: Record<string, string>,
): EntityScopeCounts {
  const narrowed = searchRows(applyFilters(rows, query.filters), query.search);
  const count = (scope: ListScope) =>
    narrowed.filter((row) => inScope(row, scope, viewer)).length;
  const orgCounts = new Map<string, number>();
  for (const row of narrowed) {
    if (row.isSystem || !row.organizationId) continue;
    orgCounts.set(row.organizationId, (orgCounts.get(row.organizationId) ?? 0) + 1);
  }
  const options: ScopeNarrowOption[] = [...orgCounts.entries()]
    .map(([id, total]) => ({
      id,
      label: organizationNames[id] ?? "Organization",
      count: total,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return {
    byKind: {
      mine: count({ kind: "mine" }),
      orgs: count({ kind: "orgs", organizationId: null }),
      system: count({ kind: "system" }),
    },
    narrow: options.length > 0 ? { orgs: options } : {},
    ...(options.length === 0
      ? { narrowUnavailable: { orgs: "No organization mandates." } }
      : {}),
  };
}

/**
 * Facet counts per column over the current scope + search. Each column's
 * counts ignore that column's OWN filter, so picking one value never hides
 * the other options.
 */
export function facetsOf(
  rows: MandateAdminRow[],
  query: EntityListQuery,
  viewer: MandateAdminViewer,
): EntityFacets {
  const scoped = searchRows(
    rows.filter((row) => inScope(row, query.scope, viewer)),
    query.search,
  );
  const byKind: EntityFacets["byKind"] = {};
  for (const [id, field] of Object.entries(FIELDS)) {
    if (field.date || id === "id" || id === "goal") continue;
    const tally = new Map<string, number>();
    for (const row of applyFilters(scoped, query.filters, id)) {
      for (const value of new Set(field.values(row))) {
        tally.set(value, (tally.get(value) ?? 0) + 1);
      }
    }
    byKind[id] = [...tally.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return { byKind };
}

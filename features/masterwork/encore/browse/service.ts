import {
  EMPTY_FACETS,
  type EntityFacets,
  type EntityListPage,
  type EntityListQuery,
  type EntityListSort,
  type EntityScopeCounts,
} from "@/lib/entity-list/types";
import { listEncoreShelves } from "../service";
import type { EncoreListRow } from "./types";

const DATE_BUCKET_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
};

let cachedRows: Promise<EncoreListRow[]> | null = null;
let cacheUntil = 0;

function loadRows(): Promise<EncoreListRow[]> {
  if (cachedRows && Date.now() < cacheUntil) return cachedRows;
  cacheUntil = Date.now() + 3_000;
  cachedRows = listEncoreShelves()
    .then((shelves) =>
      shelves.flatMap((shelf) =>
        shelf.masterworks.map((masterwork) => ({
          ...masterwork,
          scope: shelf.scope,
        })),
      ),
    )
    .catch((error) => {
      cachedRows = null;
      throw error;
    });
  return cachedRows;
}

function matches(row: EncoreListRow, query: EntityListQuery): boolean {
  const search = query.search.trim().toLowerCase();
  if (
    search &&
    !row.name.toLowerCase().includes(search) &&
    !row.rulebook?.expert.toLowerCase().includes(search)
  ) {
    return false;
  }
  for (const [id, filter] of Object.entries(query.filters)) {
    if (filter.kind === "text" && filter.value.trim()) {
      const value = filter.value.trim().toLowerCase();
      if (id === "name" && !row.name.toLowerCase().includes(value))
        return false;
      if (
        id === "expert" &&
        !row.rulebook?.expert.toLowerCase().includes(value)
      ) {
        return false;
      }
    }
    if (
      id === "updated_at" &&
      filter.kind === "select" &&
      filter.values.length > 0
    ) {
      const widest = Math.max(
        ...filter.values.map((value) => DATE_BUCKET_MS[value] ?? 0),
      );
      if (
        widest > 0 &&
        new Date(row.updated_at).getTime() < Date.now() - widest
      ) {
        return false;
      }
    }
  }
  return true;
}

function compareRows(
  left: EncoreListRow,
  right: EncoreListRow,
  sort: EntityListSort,
): number {
  const direction = sort.direction === "asc" ? 1 : -1;
  let result = 0;
  if (sort.sort === "name") result = left.name.localeCompare(right.name);
  else if (sort.sort === "expert") {
    result = (left.rulebook?.expert ?? "").localeCompare(
      right.rulebook?.expert ?? "",
    );
  } else if (sort.sort === "rule_count") {
    result = (left.rule_count ?? -1) - (right.rule_count ?? -1);
  } else if (sort.sort === "audition_score") {
    result = (left.auditionScore ?? -1) - (right.auditionScore ?? -1);
  } else {
    result =
      new Date(left.updated_at).getTime() -
      new Date(right.updated_at).getTime();
  }
  return result === 0 ? left.id.localeCompare(right.id) : result * direction;
}

function rowsForQuery(
  rows: EncoreListRow[],
  query: EntityListQuery,
): EncoreListRow[] {
  return rows.filter(
    (row) => row.scope === query.scope.kind && matches(row, query),
  );
}

export async function fetchEncorePage(
  query: EntityListQuery,
  sort: EntityListSort,
): Promise<EntityListPage<EncoreListRow>> {
  const rows = rowsForQuery(await loadRows(), query).sort((left, right) =>
    compareRows(left, right, sort),
  );
  const from = (query.page - 1) * sort.pageSize;
  return { rows: rows.slice(from, from + sort.pageSize), total: rows.length };
}

export async function fetchEncoreCounts(
  query: EntityListQuery,
): Promise<EntityScopeCounts> {
  const rows = await loadRows();
  const counts: EntityScopeCounts = { byKind: {}, narrow: {} };
  for (const scope of ["mine", "orgs", "public"] as const) {
    counts.byKind[scope] = rows.filter(
      (row) => row.scope === scope && matches(row, query),
    ).length;
  }
  return counts;
}

export async function fetchEncoreFacets(): Promise<EntityFacets> {
  return EMPTY_FACETS;
}

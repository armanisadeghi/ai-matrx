import type {
  ColumnFilterValue,
  ColumnFiltersState,
  MatrxColumnDef,
  SortState,
} from "./types";

export function columnId<T>(col: MatrxColumnDef<T>): string {
  if (col.id) return col.id;
  if (col.accessorKey) return String(col.accessorKey);
  throw new Error("MatrxDataTable column requires `id` or `accessorKey`");
}

export function getCellValue<T>(row: T, col: MatrxColumnDef<T>): unknown {
  if (col.accessorFn) return col.accessorFn(row);
  if (col.accessorKey) {
    return (row as Record<string, unknown>)[col.accessorKey];
  }
  return undefined;
}

export function stringifyCellValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }
  return stringifyCellValue(a).localeCompare(stringifyCellValue(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function passesColumnFilter(
  value: unknown,
  filter: ColumnFilterValue,
): boolean {
  switch (filter.kind) {
    case "text": {
      const q = filter.value.trim().toLowerCase();
      if (!q) return true;
      return stringifyCellValue(value).toLowerCase().includes(q);
    }
    case "select": {
      if (!filter.value || filter.value === "__all__") return true;
      return stringifyCellValue(value) === filter.value;
    }
    case "boolean": {
      return Boolean(value) === filter.value;
    }
    case "number": {
      const n =
        typeof value === "number"
          ? value
          : Number(stringifyCellValue(value).replace(/[^0-9.-]/g, ""));
      if (Number.isNaN(n)) return false;
      if (filter.min !== undefined && n < filter.min) return false;
      if (filter.max !== undefined && n > filter.max) return false;
      return true;
    }
  }
}

export function filterAndSortRows<T>(
  rows: T[],
  columns: MatrxColumnDef<T>[],
  columnFilters: ColumnFiltersState,
  sort: SortState | null,
  globalSearch: string,
  anyOf?: { columnIds: string[]; query: string },
): T[] {
  const colById = new Map(columns.map((c) => [columnId(c), c]));
  const q = globalSearch.trim().toLowerCase();
  const anyQ = anyOf?.query.trim().toLowerCase() ?? "";

  let result = rows.filter((row) => {
    for (const [id, filter] of Object.entries(columnFilters)) {
      if (!filter) continue;
      const col = colById.get(id);
      if (!col || col.filter === false) continue;
      if (!passesColumnFilter(getCellValue(row, col), filter)) return false;
    }

    if (anyQ && anyOf) {
      const hit = anyOf.columnIds.some((id) => {
        const col = colById.get(id);
        if (!col) return false;
        return stringifyCellValue(getCellValue(row, col))
          .toLowerCase()
          .includes(anyQ);
      });
      if (!hit) return false;
    }

    if (!q) return true;
    return columns.some((col) => {
      if (col.filter === false && !col.accessorKey && !col.accessorFn) {
        return false;
      }
      return stringifyCellValue(getCellValue(row, col))
        .toLowerCase()
        .includes(q);
    });
  });

  if (sort) {
    const col = colById.get(sort.id);
    if (col && col.sortable !== false) {
      const dir = sort.direction === "asc" ? 1 : -1;
      result = [...result].sort(
        (a, b) =>
          compareValues(getCellValue(a, col), getCellValue(b, col)) * dir,
      );
    }
  }

  return result;
}

export function countActiveColumnFilters(filters: ColumnFiltersState): number {
  let n = 0;
  for (const f of Object.values(filters)) {
    if (!f) continue;
    switch (f.kind) {
      case "text":
        if (f.value.trim()) n += 1;
        break;
      case "select":
        if (f.value && f.value !== "__all__") n += 1;
        break;
      case "boolean":
        n += 1;
        break;
      case "number":
        if (f.min !== undefined || f.max !== undefined) n += 1;
        break;
    }
  }
  return n;
}

export function isColumnFilterActive(
  filter: ColumnFilterValue | undefined,
): boolean {
  if (!filter) return false;
  switch (filter.kind) {
    case "text":
      return filter.value.trim().length > 0;
    case "select":
      return Boolean(filter.value) && filter.value !== "__all__";
    case "boolean":
      return true;
    case "number":
      return filter.min !== undefined || filter.max !== undefined;
  }
}

/** Apply draft edits onto a row for display (shallow field merge). */
export function applyRowEdits<T>(
  row: T,
  edits: Record<string, unknown> | undefined,
): T {
  if (!edits || Object.keys(edits).length === 0) return row;
  return { ...row, ...edits };
}

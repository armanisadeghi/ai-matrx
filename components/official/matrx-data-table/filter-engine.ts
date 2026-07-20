import type {
  ColumnFilterValue,
  ColumnFiltersState,
  MatrxColumnDef,
  SortState,
} from "./types";

/**
 * Sentinel select-filter values for "no value" / "any value" — every select
 * filter offers them automatically when the column has empty cells, so any
 * table can isolate rows missing a value (or having one) without extra config.
 */
export const SELECT_EMPTY_VALUE = "__empty__";
export const SELECT_NOT_EMPTY_VALUE = "__not_empty__";

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
      const s = stringifyCellValue(value);
      if (filter.mode === "empty") return s.trim() === "";
      if (filter.mode === "not_empty") return s.trim() !== "";
      const q = filter.value.trim().toLowerCase();
      if (!q) return true;
      return s.toLowerCase().includes(q);
    }
    case "select": {
      const selected =
        filter.values ??
        (filter.value && filter.value !== "__all__" ? [filter.value] : []);
      if (selected.length === 0) return true;
      const s = stringifyCellValue(value);
      // OR semantics across the set; sentinels compose ("A or (empty)").
      return selected.some((v) =>
        v === SELECT_EMPTY_VALUE
          ? s === ""
          : v === SELECT_NOT_EMPTY_VALUE
            ? s !== ""
            : s === v,
      );
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
      result = [...result].sort((a, b) => {
        const va = getCellValue(a, col);
        const vb = getCellValue(b, col);
        // Empty cells (null / "") sort LAST in both directions — sorting a
        // column should surface its values, never a wall of blanks.
        const ea = va == null || stringifyCellValue(va) === "";
        const eb = vb == null || stringifyCellValue(vb) === "";
        if (ea !== eb) return ea ? 1 : -1;
        return compareValues(va, vb) * dir;
      });
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
        if (f.value.trim() || (f.mode && f.mode !== "contains")) n += 1;
        break;
      case "select":
        if (f.values ? f.values.length > 0 : f.value && f.value !== "__all__")
          n += 1;
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
      return (
        filter.value.trim().length > 0 ||
        (filter.mode !== undefined && filter.mode !== "contains")
      );
    case "select":
      return filter.values
        ? filter.values.length > 0
        : Boolean(filter.value) && filter.value !== "__all__";
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

export type SortDirection = "asc" | "desc";

export type ColumnFilterType = "text" | "enum" | "number" | "date";

export interface ColumnFilter {
  text?: string;
  enumValues?: string[];
  numMin?: number | null;
  numMax?: number | null;
  dateFrom?: string;
  dateTo?: string;
}

export interface ColumnDef<T> {
  key: string;
  type: ColumnFilterType;
  getValue: (row: T) => string | number | null | undefined;
}

export function isColumnFilterActive(
  filter: ColumnFilter | undefined,
  type: ColumnFilterType,
): boolean {
  if (!filter) return false;
  switch (type) {
    case "text":
      // Text columns can be narrowed by a free substring, an exact-value
      // checklist (via the value-list filter popover), or both combined.
      return (
        Boolean(filter.text?.trim()) ||
        (Array.isArray(filter.enumValues) && filter.enumValues.length > 0)
      );
    case "enum":
      return Array.isArray(filter.enumValues) && filter.enumValues.length > 0;
    case "number":
      return filter.numMin != null || filter.numMax != null;
    case "date":
      return Boolean(filter.dateFrom || filter.dateTo);
  }
}

export function matchesColumnFilter(
  filter: ColumnFilter | undefined,
  type: ColumnFilterType,
  raw: string | number | null | undefined,
): boolean {
  if (!filter || !isColumnFilterActive(filter, type)) return true;

  switch (type) {
    case "text": {
      const haystack = String(raw ?? "").toLowerCase();
      const needle = (filter.text ?? "").trim().toLowerCase();
      if (needle && !haystack.includes(needle)) return false;
      if (Array.isArray(filter.enumValues) && filter.enumValues.length > 0) {
        return filter.enumValues.includes(String(raw ?? ""));
      }
      return true;
    }
    case "enum": {
      const value = String(raw ?? "");
      return (filter.enumValues ?? []).includes(value);
    }
    case "number": {
      const n =
        typeof raw === "number"
          ? raw
          : raw == null || raw === ""
            ? null
            : Number(raw);
      if (n === null || Number.isNaN(n)) return false;
      if (filter.numMin != null && n < filter.numMin) return false;
      if (filter.numMax != null && n > filter.numMax) return false;
      return true;
    }
    case "date": {
      const s = String(raw ?? "");
      if (!s) return false;
      const d = new Date(s).getTime();
      if (Number.isNaN(d)) return false;
      if (filter.dateFrom) {
        const from = new Date(filter.dateFrom).getTime();
        if (!Number.isNaN(from) && d < from) return false;
      }
      if (filter.dateTo) {
        const to = new Date(filter.dateTo).setHours(23, 59, 59, 999);
        if (!Number.isNaN(to) && d > to) return false;
      }
      return true;
    }
  }
}

export function applyColumnFilters<T>(
  rows: T[],
  columns: ColumnDef<T>[],
  columnFilters: Record<string, ColumnFilter>,
): T[] {
  return rows.filter((row) =>
    columns.every((col) => {
      const filter = columnFilters[col.key];
      if (!isColumnFilterActive(filter, col.type)) return true;
      return matchesColumnFilter(filter, col.type, col.getValue(row));
    }),
  );
}

export function sortRows<T>(
  rows: T[],
  columns: ColumnDef<T>[],
  sortKey: string,
  sortDir: SortDirection,
): T[] {
  const col = columns.find((c) => c.key === sortKey);
  if (!col) return rows;

  const dirMul = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = col.getValue(a);
    const vb = col.getValue(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * dirMul;
    }
    if (col.type === "date") {
      const da = new Date(String(va)).getTime();
      const db = new Date(String(vb)).getTime();
      return (
        ((Number.isNaN(da) ? 0 : da) - (Number.isNaN(db) ? 0 : db)) * dirMul
      );
    }
    return String(va).localeCompare(String(vb)) * dirMul;
  });
}

export function toggleSort(
  currentKey: string,
  currentDir: SortDirection,
  nextKey: string,
): { sortKey: string; sortDir: SortDirection } {
  if (currentKey === nextKey) {
    return { sortKey: nextKey, sortDir: currentDir === "asc" ? "desc" : "asc" };
  }
  return { sortKey: nextKey, sortDir: "asc" };
}

// features/admin/shared/server-table/postgrest.ts
//
// THE ONE translation from a controlled MatrxDataTable query state (search, column filters, sort,
// page) to a PostgREST query. An admin table that is "in controlled mode with every query control
// source-owned" answers every search/filter/sort/page in the DATABASE through this — never over a
// page already in the browser. (The RPC-backed twin is features/cx-dashboard/explorer/service.ts.)
//
// A column maps to a database column per filter kind; a column with no mapping must declare
// `filter: false` (and `sortable: false` when it cannot sort) so the table never offers a control
// the database does not answer.

import { dateFilterBounds } from "@ai-matrx/design-system/data-table";
import type {
  ColumnFilterValue,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import { buildSearchOr } from "@/utils/supabase-search";

/** The slice of the PostgREST filter builder this helper drives (kept structural so any table's builder fits). */
export interface PostgrestChain<Q> {
  or(filters: string): Q;
  eq(column: string, value: unknown): Q;
  in(column: string, values: unknown[]): Q;
  not(column: string, operator: string, value: unknown): Q;
  ilike(column: string, pattern: string): Q;
  gte(column: string, value: unknown): Q;
  lte(column: string, value: unknown): Q;
  order(column: string, options: { ascending: boolean }): Q;
  range(from: number, to: number): Q;
}

export interface ServerTableSpec {
  /** Text columns the toolbar search matches (case-insensitive contains; a full uuid also matches `idColumn`). */
  searchColumns: string[];
  idColumn?: string;
  /** table column id → database column, per filter kind. */
  text?: Record<string, string>;
  select?: Record<string, string>;
  number?: Record<string, string>;
  date?: Record<string, string>;
  /** table column id → database column the database can sort by. */
  sort: Record<string, string>;
  /** Order when the person has not chosen one. */
  defaultSort: { column: string; ascending: boolean };
}

function selectValues(f: ColumnFilterValue): string[] {
  if (f.kind !== "select") return [];
  return f.values ?? (f.value ? [f.value] : []);
}

/** PostgREST list value: quote so commas/parens inside a value never break the grammar. */
const listItem = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

export function applyServerTableState<Q>(
  query: Q,
  state: MatrxDataTableQueryState,
  spec: ServerTableSpec,
): Q {
  let q = query as unknown as PostgrestChain<Q>;
  const next = (r: Q) => {
    q = r as unknown as PostgrestChain<Q>;
  };

  const search = state.search.trim();
  if (search && spec.searchColumns.length) {
    next(q.or(buildSearchOr(search, spec.searchColumns, { idColumn: spec.idColumn })));
  }

  for (const [id, f] of Object.entries(state.columnFilters)) {
    if (!f) continue;
    if (f.kind === "text" && spec.text?.[id] && f.value.trim()) {
      const col = spec.text[id];
      const pattern = `%${f.value.trim().replace(/[%,()]/g, " ")}%`;
      if (f.negated) next(q.not(col, "ilike", pattern));
      else next(q.ilike(col, pattern));
    } else if (f.kind === "select" && spec.select?.[id]) {
      const values = selectValues(f);
      const col = spec.select[id];
      if (!values.length) continue;
      if (f.negated) next(q.not(col, "in", `(${values.map(listItem).join(",")})`));
      else next(q.in(col, values));
    } else if (f.kind === "number" && spec.number?.[id]) {
      const col = spec.number[id];
      const op = f.op ?? "between";
      if (op === "eq" && f.min !== undefined) next(q.eq(col, f.min));
      else {
        if ((op === "between" || op === "gt") && f.min !== undefined) next(q.gte(col, f.min));
        if ((op === "between" || op === "lt") && f.max !== undefined) next(q.lte(col, f.max));
      }
    } else if (f.kind === "date" && spec.date?.[id]) {
      const bounds = dateFilterBounds(f);
      if (bounds.since) next(q.gte(spec.date[id], bounds.since));
      if (bounds.until) next(q.lte(spec.date[id], bounds.until));
    }
  }

  const sortColumn = state.sort ? spec.sort[state.sort.id] : undefined;
  if (sortColumn) next(q.order(sortColumn, { ascending: state.sort?.direction === "asc" }));
  else next(q.order(spec.defaultSort.column, { ascending: spec.defaultSort.ascending }));

  const from = (Math.max(state.page, 1) - 1) * state.pageSize;
  next(q.range(from, from + state.pageSize - 1));
  return q as unknown as Q;
}

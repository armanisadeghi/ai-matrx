import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";

/** Keep the full selected set at the HR source-read boundary. Empty sets mean no filter. */
export function readExceptionFilters(
  query: Pick<MatrxDataTableQueryState, "columnFilters">,
) {
  const filters: Record<string, unknown> = {};
  for (const id of ["resolutionState", "severity", "exceptionKind"]) {
    const filter = query.columnFilters[id];
    if (!filter || filter.kind !== "select") continue;
    const values = filter.values ?? (filter.value ? [filter.value] : []);
    if (values.length > 0) filters[id] = values;
  }
  return filters;
}

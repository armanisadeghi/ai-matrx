import type { MandateCoverageBucket } from "@/features/mandates/coverage";
import { rankTableSearchRows } from "@ai-matrx/design-system/data-table";
import { filterAndSortRows } from "@ai-matrx/design-system/data-table/filter-engine";
import { completeLayeredFilterRules } from "@ai-matrx/design-system/data-table/layered-filters";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";

/**
 * The standing queue is the default browse scope, not a hidden constraint on
 * discovery. Any real table query opens the full admitted catalogue; coverage
 * remains an explicit domain scope and continues to constrain it.
 */
export function isMandateConsoleDiscovering(
  state: Pick<
    MatrxDataTableQueryState,
    "search" | "columnFilters" | "layeredFilters"
  >,
): boolean {
  return (
    state.search.trim().length > 0 ||
    Object.values(state.columnFilters).some(Boolean) ||
    completeLayeredFilterRules(state.layeredFilters).length > 0
  );
}

/** A bulk action may name only rows in the table's current processed view. */
export function pruneMandateSelectionToVisible(
  selectedIds: readonly string[],
  visibleRows: ReadonlyArray<{ id: string }>,
): string[] {
  const visibleIds = new Set(visibleRows.map((row) => row.id));
  return selectedIds.filter((id) => visibleIds.has(id));
}

/**
 * Keep the standing queue as the default browse view, but search the catalogue.
 * A hidden queue filter must never erase valid matches.
 */
export function filterMandateConsoleRows<
  T extends { coverage: MandateCoverageBucket; behindLatest: boolean },
>(
  allRows: readonly T[],
  options: {
    coverageFilter: MandateCoverageBucket | null;
    behindOnly: boolean;
    discovering: boolean;
  },
): T[] {
  return allRows.filter(
    (row) =>
      (options.coverageFilter === null ||
        row.coverage === options.coverageFilter) &&
      (!options.behindOnly || options.discovering || row.behindLatest),
  );
}

interface MandateSearchRow {
  mandateKey: string;
  mandateName: string | null;
  label: string | null;
  feature: string | null;
  agentName: string | null;
  goal: string | null;
  mandate: { description: string | null };
}

export function processMandateConsoleRows<T extends MandateSearchRow & {
  coverage: MandateCoverageBucket;
  behindLatest: boolean;
}>(
  allRows: T[],
  columns: MatrxColumnDef<T>[],
  state: MatrxDataTableQueryState,
  options: {
    coverageFilter: MandateCoverageBucket | null;
    behindOnly: boolean;
  },
): T[] {
  const scoped = filterMandateConsoleRows(allRows, {
    ...options,
    discovering: isMandateConsoleDiscovering(state),
  });
  const filtered = filterAndSortRows(
    scoped,
    columns,
    state.columnFilters,
    state.sort,
    "",
    undefined,
    state.layeredFilters,
    state.searchMatchMode,
    mandateConsoleSearchText,
  );
  return rankTableSearchRows(
    filtered,
    columns,
    state.search,
    { matchMode: state.searchMatchMode },
    mandateConsoleSearchText,
  );
}

/** The same complete text a person can see or reasonably search this row by. */
export function mandateConsoleSearchText(row: MandateSearchRow): string {
  return [
    row.mandateKey,
    row.mandateName,
    row.label,
    row.feature,
    row.agentName,
    row.goal,
    row.mandate.description,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

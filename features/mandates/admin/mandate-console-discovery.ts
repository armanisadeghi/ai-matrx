import type { MandateCoverageBucket } from "@/features/mandates/coverage";

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
    searchQuery: string;
  },
): T[] {
  const searching = options.searchQuery.trim().length > 0;
  return allRows.filter(
    (row) =>
      (options.coverageFilter === null ||
        row.coverage === options.coverageFilter) &&
      (!options.behindOnly || searching || row.behindLatest),
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

"use client";

// features/unified-data/standard-field-columns/useStandardFieldGrouping.tsx
//
// GROUP A STANDARD LIST BY A CUSTOM FIELD — the table's own `grouping` seam, configured once for
// every list that mounts the column source. Groups read the RAW cell (a choice key, `true`, a
// word), so the value a header counts is exactly the value the server compares; the header shows
// the words a person reads (`labelOf`). Counts are the whole result's (`useServerGroupCounts`);
// a count that could not be read is said on the header, never replaced by the page's number
// without saying so.

import { useState } from "react";
import type { MatrxDataTableGroupingConfig } from "@ai-matrx/design-system/data-table/types";
import { groupFilterFor, keyOfColumnId, type CustomFieldFilters } from "./standardFieldColumns";
import { useServerGroupCounts } from "./useServerGroupCounts";
import type { StandardFieldColumnSource } from "./useStandardFieldColumns";

export function useStandardFieldGrouping<TRow>(options: {
  source: StandardFieldColumnSource<TRow>;
  rows: readonly TRow[];
  /** Identity of the list's current query (a change re-asks every count). */
  queryKey: string;
  /** The list's own count, with these custom-field filters added to its current ones. */
  countWith: (extra: CustomFieldFilters) => Promise<number>;
  /** Singular noun for a group's count ("record" → "12 records"). */
  rowNoun: string;
}): MatrxDataTableGroupingConfig<TRow> | undefined {
  const { source, rows, queryKey, countWith, rowNoun } = options;
  const [columnId, setColumnId] = useState<string | null>(null);
  const active = columnId && source.groupableColumnIds.includes(columnId) ? columnId : null;
  const counts = useServerGroupCounts(
    active,
    active ? rows.map((row) => source.readCell(row, active)) : [],
    queryKey,
    (id, value) => {
      const key = keyOfColumnId(id);
      return key ? countWith({ [key]: groupFilterFor(value) }) : Promise.resolve(0);
    },
  );
  if (source.groupableColumnIds.length === 0) return undefined;
  return {
    columnId: active,
    onColumnIdChange: setColumnId,
    groupableColumnIds: source.groupableColumnIds,
    rowNoun,
    readCell: (row, id) => source.readCell(row, id) ?? null,
    groupFacts: counts.groupFacts,
    renderLabel: (group) => (
      <span className="inline-flex items-center gap-1.5">
        <span>{active ? (source.labelOf(active, group.value) ?? group.label) : group.label}</span>
        {counts.failed(group.value) ? (
          <span className="text-xs text-muted-foreground" title="The total for this group could not be read">
            count on this page only
          </span>
        ) : null}
      </span>
    ),
  };
}

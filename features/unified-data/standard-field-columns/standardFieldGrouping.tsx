"use client";

// features/unified-data/standard-field-columns/useStandardFieldGrouping.tsx
//
// GROUP A STANDARD LIST BY A CUSTOM FIELD — the table's own `grouping` seam, configured once for
// every list that mounts the column source.
//
// THE GROUPS ARE THE WHOLE RESULT'S. While grouped, the list reads EVERY row its query selects
// (`readWholeResult`, the shell's rule "while grouped the whole result is ONE page"), so which
// groups appear and how many each holds come from the whole result — a choice held only by rows
// on page 3 still gets its header, and no header ever shows a page's count. The list owns the
// read: pass `columnId` from the page's own state and read the whole result while it is set.
// Groups compare the RAW cell (a choice key, `true`, a word); headers show the words a person
// reads (`labelOf`).

import type { MatrxDataTableGroupingConfig } from "@ai-matrx/design-system/data-table/types";
import type { StandardFieldColumnSource } from "./useStandardFieldColumns";

export function standardFieldGrouping<TRow>(options: {
  source: StandardFieldColumnSource<TRow>;
  columnId: string | null;
  onColumnIdChange: (columnId: string | null) => void;
  /** Singular noun for a group's count ("record" → "12 records"). */
  rowNoun: string;
}): MatrxDataTableGroupingConfig<TRow> | undefined {
  const { source, columnId, onColumnIdChange, rowNoun } = options;
  if (source.groupableColumnIds.length === 0) return undefined;
  const active = columnId && source.groupableColumnIds.includes(columnId) ? columnId : null;
  return {
    columnId: active,
    onColumnIdChange,
    groupableColumnIds: source.groupableColumnIds,
    rowNoun,
    readCell: (row, id) => source.readCell(row, id) ?? null,
    renderLabel: (group) => <span>{active ? (source.labelOf(active, group.value) ?? group.label) : group.label}</span>,
  };
}

// features/unified-data/standard-field-columns/standardWholeResultExport.ts
//
// THE ONE EXPORT, OVER THE WHOLE RESULT (lane 7 W2, fix round 2). A server-paged standard list
// hands the table's own "Copy or export" menu (`copy.export`) an async `sheetRows`: when a person
// picks a format, every row the list's current filters, search and sort select is read from the
// server (`readWholeResult`, under the store's export ceiling `custom.export_rows_ceiling`) and
// projected onto the columns on screen, in their order, exactly as the table projects its page
// (`projectDefaultTableCopyRow`). A read the ceiling stopped says so in a toast. Needs
// @ai-matrx/design-system ≥ 0.55.0 (async `sheetRows`).

import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import type { CopyExportConfig } from "@ai-matrx/design-system/data-table/copy-types";
import { projectDefaultTableCopyRow } from "@ai-matrx/design-system/data-table/copy-helpers";
import { toast } from "@/lib/toast";
import type { WholeResult } from "./wholeResult";
import { formatCount } from "@ai-matrx/kit/format";

export function standardWholeResultExport<TRow>(options: {
  columns: MatrxColumnDef<TRow>[];
  /** The list's column state at the moment of export (ids hidden, ids in order). */
  hidden: () => readonly string[];
  order: () => readonly string[];
  read: () => Promise<WholeResult<TRow>>;
  /** Plural noun for the ceiling sentence ("records"). */
  noun: string;
}): () => CopyExportConfig {
  const idOf = (c: MatrxColumnDef<TRow>) => c.id ?? String(c.accessorKey ?? "");
  const shown = () => {
    const hidden = new Set(options.hidden());
    const byId = new Map(options.columns.map((c) => [idOf(c), c]));
    return options
      .order()
      .map((id) => byId.get(id))
      .filter((c): c is MatrxColumnDef<TRow> => Boolean(c) && !hidden.has(idOf(c!)))
      .filter((c) => c.accessorFn !== undefined || c.accessorKey !== undefined);
  };
  return () => ({
    items: [],
    sheetColumns: () =>
      shown().map((c) => ({ id: idOf(c), label: c.label ?? (typeof c.header === "string" ? c.header : idOf(c)) })),
    sheetRows: async () => {
      const result = await options.read();
      if (result.ceiling !== null) {
        toast.info(
          `Exported the first ${formatCount(result.ceiling)} of ${formatCount(result.total)} ${options.noun}`,
        );
      }
      const columns = shown();
      return result.rows.map((row) => projectDefaultTableCopyRow(row, columns));
    },
  });
}

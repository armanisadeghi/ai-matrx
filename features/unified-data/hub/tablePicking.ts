// features/unified-data/hub/tablePicking.ts — THE ADAPTER FROM `custom.data_home_tables()` ROWS TO THE ONE RULE.
//
// THE RULE lives in `@ai-matrx/records-ui` (`tablePickerEntries` / `isValueSet` / `isKeptTable`,
// aidream `apps/shared/records-ui/src/tablePicking.tsx`) — every table picker and the data home use it:
//   · by default a picker offers TABLES — never a value set (the List a choice column keeps its
//     choices in, `kept_for = 'choices'`, "Status choices") nor anything else the app keeps;
//   · "Show lists" adds the value sets, named "<column> — <owning table>";
//   · the table already chosen is always offered.
// The interim mirror of those functions that sat here until records-ui 0.93.142 is gone; this file
// only maps the data home's row shape onto the package's `PickerTable`.

import { tablePickerEntries, type PickerTable } from "@ai-matrx/records-ui";

import type { DataHomeTableRow } from "./doors";

/** A `custom.data_home_tables()` row as the rule reads it. */
export function pickerRow(row: DataHomeTableRow): DataHomeTableRow & PickerTable {
  return { ...row, id: row.table_id, name: row.table_name };
}

/** The rows a picker over `custom.data_home_tables()` offers by default (tables only; the chosen one kept). */
export function tablesToPick(rows: readonly DataHomeTableRow[], keep?: string | null): DataHomeTableRow[] {
  return tablePickerEntries(rows.map(pickerRow), { keep }).entries.map((e) => e.table);
}

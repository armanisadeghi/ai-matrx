// features/unified-data/hub/tablePicking.ts — WHICH TABLES A "CHOOSE A TABLE" CONTROL OFFERS.
//
// TODO(records-ui switch-over): this is an EXACT mirror of `tablePickerEntries` / `isValueSet` /
// `isKeptTable` in `@ai-matrx/records-ui` (aidream `apps/shared/records-ui/src/tablePicking.tsx`,
// lane 10 W1-A). The published package (0.93.133) does not export them yet. When a published
// `@ai-matrx/records-ui` exports `tablePickerEntries`, delete this file's three rule functions and
// import them from the package — `pickerRow` stays as the adapter for the two row shapes here.
//
// THE RULE (one for every table picker in this app — TableSwitcher, the test bench, the agent
// variables binding picker, the spatial "add a table" picker, the Messages custom-data picker):
//   · by default a picker offers TABLES — never a value set (the List a choice column keeps its
//     choices in, `kept_for = 'choices'`, "Status choices") nor anything else the app keeps;
//   · "Show lists" adds the value sets, named "<column> — <owning table>";
//   · the table already chosen is always offered.
// The Messages picker used to list every row of `custom.data_home_tables()` unfiltered — every
// "Status choices" list sat beside the clinic's real tables.

import type { DataHomeTableRow } from "./doors";

/** The facts a picker needs about one table, whichever list it came from. */
export interface PickerTable {
  id: string;
  name: string;
  kept_by_the_app?: boolean | null | undefined;
  kept_for?: string | null | undefined;
  kind?: string | null | undefined;
  used_in_table_id?: string | null | undefined;
  work_kind?: unknown;
  slug?: string | null | undefined;
  created_at?: string | null | undefined;
}

const APP_TABLE_PREFIX = "records_ui_";

/** A value set: the List a choice column keeps its choices in. */
export function isValueSet(table: PickerTable): boolean {
  if (table.kept_for === "choices") return true;
  return table.kept_for == null && table.kind === "list" && table.kept_by_the_app === true;
}

/** Anything the app keeps for itself rather than a table a person keeps. */
export function isKeptTable(table: PickerTable): boolean {
  return (
    table.kept_by_the_app === true ||
    isValueSet(table) ||
    Boolean(table.work_kind) ||
    (table.slug ?? "").startsWith(APP_TABLE_PREFIX)
  );
}

export interface TablePickerEntry<T extends PickerTable> {
  table: T;
  id: string;
  label: string;
  isList: boolean;
}

const CHOICES_SUFFIX = / choices$/i;

function madeOn(stamp: string | null | undefined): string | null {
  if (!stamp) return null;
  const at = new Date(stamp);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(at);
}

/** THE ONE RULE — a mirror of the package's `tablePickerEntries`. */
export function tablePickerEntries<T extends PickerTable>(
  tables: readonly T[],
  options: { showLists?: boolean; keep?: string | null | undefined } = {},
): { entries: TablePickerEntry<T>[]; listCount: number } {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const lists = tables.filter(isValueSet);
  const listLabel = (t: T): string => {
    const column = t.name.replace(CHOICES_SUFFIX, "");
    if (!t.used_in_table_id || t.used_in_table_id === t.id) {
      const made = madeOn(t.created_at);
      return made ? `${column} — no column · ${made}` : `${column} — no column`;
    }
    const owner = byId.get(t.used_in_table_id);
    if (!owner) return t.name;
    return `${column} — ${owner.name}`;
  };
  const plain = tables
    .filter((t) => !isKeptTable(t) || (t.id === options.keep && !isValueSet(t)))
    .map((t) => ({ table: t, id: t.id, label: t.name, isList: false }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const shownLists = lists
    .filter((t) => options.showLists || t.id === options.keep)
    .map((t) => ({ table: t, id: t.id, label: listLabel(t), isList: true }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const entries = [...plain, ...shownLists];
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.label.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) entry.label = `${entry.label} (${n})`;
  }
  return { entries, listCount: lists.length };
}

/** A `custom.data_home_tables()` row as the rule reads it. */
export function pickerRow(row: DataHomeTableRow): DataHomeTableRow & PickerTable {
  return { ...row, id: row.table_id, name: row.table_name };
}

/** The rows a picker over `custom.data_home_tables()` offers by default (tables only; the chosen one kept). */
export function tablesToPick(rows: readonly DataHomeTableRow[], keep?: string | null): DataHomeTableRow[] {
  return tablePickerEntries(rows.map(pickerRow), { keep }).entries.map((e) => e.table);
}

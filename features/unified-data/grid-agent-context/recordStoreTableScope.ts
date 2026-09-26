/**
 * THE `matrx-user/data-tables` SCOPE FOR A RECORD-STORE TABLE (records-ui merge tranche 6l, H1/H2).
 *
 * The merged grid on /data-v2 tells its host where the person is (`RecordsUiHost.onGridContext`,
 * a `GridContextSnapshot` in the store's own shapes). This turns that snapshot into the SAME scope
 * the older /data grid published — the same manifest keys, built by the same
 * `buildDataTablesScope` — so an agent in the side chat reads a record-store table exactly as it
 * reads an older one: `column_list` names are Field KEYS (what a write names), `visible_data_csv`
 * leads with `row_id`, the current cell / range / ticked rows are the person's own.
 *
 * Pure: no React, no store. The write half (`cell_value` through `@ai-matrx/records`) lives in
 * `RecordStoreTableSurface.tsx`.
 */
import type { Field } from "@ai-matrx/records";
import type { GridContextSnapshot } from "@ai-matrx/records-ui";

import type {
  DataTableScopeField,
  DataTableScopeInput,
  DataTableScopeRow,
} from "@/features/data-tables/agent-context/buildDataTablesScope";
import type { RowAction } from "@/features/data-tables/row-actions";

/** A column the store works out itself: an agent never writes it. */
export function isWorkedOut(field: Field): boolean {
  const kind = String(field.type);
  return kind === "formula" || kind === "lookup" || kind === "rollup" || field.source === "formula";
}

function scopeField(field: Field, order: number): DataTableScopeField {
  const options = (field.config as { options?: unknown } | undefined)?.options;
  const choices = Array.isArray(options)
    ? options
        .map((o) => (typeof o === "string" ? o : o && typeof o === "object" ? String((o as { title?: unknown; label?: unknown }).title ?? (o as { label?: unknown }).label ?? "") : ""))
        .filter((w) => w !== "")
    : undefined;
  return {
    field_name: field.key,
    display_name: field.label?.trim() || field.key,
    data_type: String(field.parity_type ?? field.type),
    field_order: order,
    is_required: Boolean(field.required),
    ...(field.format ? { format: String(field.format) } : {}),
    ...(choices && choices.length > 0 ? { choices } : {}),
  };
}

function scopeRow(row: { id: string; document: Record<string, unknown> }): DataTableScopeRow {
  return { id: row.id, data: { ...(row.document ?? {}) } };
}

/** The store's row actions, named by Field KEY the way the manifest's descriptions read them. */
function scopeActions(snapshot: GridContextSnapshot): RowAction[] {
  const keyOf = new Map(snapshot.fields.map((f) => [f.id as string, f.key] as const));
  return snapshot.rowActions
    .filter((a) => a.id)
    .map((a): RowAction => {
      if (a.kind === "agent") return { id: a.id!, name: a.name, kind: "agent", prompt: a.prompt ?? "" };
      return {
        id: a.id!,
        name: a.name,
        kind: "update",
        steps: (a.steps ?? []).map((s) => {
          const field = keyOf.get(s.field) ?? s.field;
          if (s.set === "clear") return { field, set: "clear" as const };
          if (s.set === "compute") return { field, set: "formula" as const, expression: s.formula_text ?? "" };
          return { field, set: "value" as const, value: s.value };
        }),
      };
    });
}

/** The snapshot as `buildDataTablesScope`'s input. */
export function scopeInputFromGrid(snapshot: GridContextSnapshot): DataTableScopeInput {
  const fields = snapshot.fields.map(scopeField);
  const visibleRows = snapshot.visibleRows.map((r) => scopeRow(r as { id: string; document: Record<string, unknown> }));
  const current = snapshot.currentCell;
  return {
    tableId: snapshot.tableId,
    ...(snapshot.tableName ? { tableName: snapshot.tableName } : {}),
    ...(snapshot.tableDescription ? { tableDescription: snapshot.tableDescription } : {}),
    rowLabel: snapshot.titleField ? { kind: "field", field: snapshot.titleField } : null,
    rowActions: scopeActions(snapshot),
    isReadOnly: !snapshot.canWrite,
    fields,
    visibleRows,
    totalCount: snapshot.total ?? visibleRows.length,
    searchTerm: snapshot.search,
    // The merged grid reads one page from the store; it never holds the whole table.
    fullDataset: null,
    openCell: current
      ? {
          rowId: current.rowId,
          fieldName: current.key,
          value:
            current.value === null || current.value === undefined
              ? ""
              : typeof current.value === "object"
                ? JSON.stringify(current.value)
                : String(current.value),
        }
      : null,
    openRow: null,
    selectedRangeTsv: snapshot.selectedRange?.tsv ?? null,
    selectedRangeCellCount: snapshot.selectedRange?.cellCount ?? 0,
    selectedRows: snapshot.selectedRows.map((r) => scopeRow(r as { id: string; document: Record<string, unknown> })),
  };
}

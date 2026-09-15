"use client";

import { ContentTransferMenu, tableDataFormat, tableSchemaFormat, type ContentTransferReference } from "@ai-matrx/design-system/content-transfer";
import { directSource, normalizeTransferJson, type Json, type Source } from "@ai-matrx/kit/content-transfer";
import { useAlchemyDisclosure } from "@/components/agent-copy/useAlchemyDisclosure";
import type { DataTableCopyField, DataTableCopyRow } from "@/features/data-tables/table-copy";

export interface TableCopyControlsProps {
  tableId: string;
  tableName: string;
  fields: DataTableCopyField[];
  hiddenColumns?: string[];
  selectedRowIds: string[];
  loadRows: () => Promise<DataTableCopyRow[]>;
  loadAllRows: () => Promise<DataTableCopyRow[]>;
  onChooseReference: () => void;
  className?: string;
}

const ROW_ID_COLUMN_BASE = "__matrx_row_id";

function escapeJsonPointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Reserve a transfer-only column ID without colliding with a real field. */
export function tableRowIdColumnId(fields: DataTableCopyField[]): string {
  const fieldNames = new Set(fields.map((field) => field.field_name));
  let candidate = ROW_ID_COLUMN_BASE;
  let suffix = 2;
  while (fieldNames.has(candidate)) {
    candidate = `${ROW_ID_COLUMN_BASE}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** Keep the database row ID distinct from a user-owned `data.id` cell. */
export function normalizeTableTransferRows(
  rows: DataTableCopyRow[],
  fields: DataTableCopyField[],
): Record<string, Json>[] {
  return rows.map((row) => ({
    id: row.id,
    data: Object.fromEntries(
      fields.map((field) => [
        field.field_name,
        normalizeTransferJson(row.data[field.field_name] ?? null),
      ]),
    ) as Record<string, Json>,
  }));
}

export function tableTransferColumns(
  fields: DataTableCopyField[],
  hiddenColumns: string[],
) {
  return [
    {
      id: tableRowIdColumnId(fields),
      label: "Row ID",
      path: "/id",
      visible: true,
      exportable: true,
      schema: { dataType: "text", order: -1, required: true },
    },
    ...fields.map((field, order) => ({
      id: field.field_name,
      label: field.display_name,
      path: `/data/${escapeJsonPointerSegment(field.field_name)}`,
      visible: !hiddenColumns.includes(field.field_name),
      exportable: true,
      schema: {
        dataType: field.data_type ?? "text",
        metadata: { fieldId: field.id },
        order: field.field_order ?? order,
        required: field.is_required ?? false,
        ...(field.default_value === undefined
          ? {}
          : { defaultValue: normalizeTransferJson(field.default_value) }),
        ...(field.validation_rules === undefined
          ? {}
          : { validation: normalizeTransferJson(field.validation_rules) }),
      },
    })),
  ];
}

/** The page declares identity and loaders; all output UI and serialization are package-owned. */
export function TableCopyControls({ tableId, tableName, fields, hiddenColumns = [], selectedRowIds, loadRows, loadAllRows, onChooseReference, className }: TableCopyControlsProps) {
  useAlchemyDisclosure(true);
  const source: Source = {
    id: `dataset:${tableId}`,
    label: tableName,
    capture: async ({ scope, signal }) => {
      const all = await (scope === "target" ? loadAllRows() : loadRows());
      signal.throwIfAborted();
      const rows = scope === "selected" ? all.filter((row) => selectedRowIds.includes(row.id)) : all;
      const columns = tableTransferColumns(fields, hiddenColumns);
      return directSource({ kind: "rows", columns, rows: normalizeTableTransferRows(rows, fields) }, {
        sourceId: `dataset:${tableId}`,
        label: `${tableName} — ${scope === "target" ? "entire table" : scope === "selected" ? "selected rows" : "filtered view"}`,
      });
    },
  };
  const references: ContentTransferReference[] = [
    { id: "table", label: "Copy table reference", noun: "dataset", items: [{ id: tableId, label: tableName }] },
    { id: "schema", label: "Copy schema reference", noun: "table_schema", items: [{ table_id: tableId, table_name: tableName }] },
    ...(selectedRowIds.length ? [{ id: "selected", label: `Copy ${selectedRowIds.length === 1 ? "reference" : "references"} to ${selectedRowIds.length} selected ${selectedRowIds.length === 1 ? "row" : "rows"}`, noun: "table_row", items: selectedRowIds.map((row_id) => ({ table_id: tableId, table_name: tableName, row_id })) }] : []),
  ];
  return <ContentTransferMenu
    source={source}
    label={tableName}
    triggerVariant="outline"
    className={className}
    table={{ availableScopes: ["view", ...(selectedRowIds.length ? ["selected" as const] : []), "target"], initialScope: "view", scopeLabels: { view: "Filtered view (all rows)", target: "Entire table", selected: "Selected rows" } }}
    capabilities={{ formats: [tableDataFormat, tableSchemaFormat] }}
    references={references}
    referenceActions={[{ id: "choose-reference", label: "Choose a row, column or cell reference", run: onChooseReference }]}
  />;
}

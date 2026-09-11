"use client";

/**
 * TableCopyControls — the user-data-table copy control. The canonical
 * `CopyButtons` chrome. Every row read is ASYNC here (`loadRows` fetches the
 * COMPLETE table, never the loaded page), and `CopyButtons`' `human` /
 * `json` / `agent` seams are synchronous, so every action is an `AiVariant`
 * with an async `build` (AiCopyMenu awaits it) or an export with an async
 * `onSelect`. Menu order: Copy table (Markdown) · Copy JSON · Current table
 * view for AI · the selected rows (only when a selection exists) · "Filter &
 * sort before copying…" (the copy-subset door over the complete table) ·
 * downloads.
 *
 * The copy-subset window receives the loader, so loading / error / retry
 * live there and the origin viewer is never touched.
 */

import { Braces, Copy } from "lucide-react";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import type { AiVariant } from "@/components/agent-copy/AiCopyMenu";
import type {
  CopySubsetColumn,
  CopySubsetSource,
} from "@/components/agent-copy/copy-subset/types";
import { useCopySubsetVariant } from "@/components/agent-copy/copy-subset/useCopySubsetVariant";
import {
  downloadFile,
  exportFilename,
  rowsToCsv,
} from "@/components/agent-copy/export";
import {
  buildDataTableAgentInput,
  dataTableRowsToMarkdown,
  projectDataTableRows,
  type DataTableCopyField,
  type DataTableCopyRow,
} from "@/features/data-tables/table-copy";

export interface TableCopyControlsProps {
  tableId: string;
  tableName: string;
  fields: DataTableCopyField[];
  selectedRowIds: string[];
  loadRows: () => Promise<DataTableCopyRow[]>;
  className?: string;
}

function subsetColumns(
  fields: DataTableCopyField[],
): CopySubsetColumn<DataTableCopyRow>[] {
  return fields.map((field) => ({
    id: field.id,
    header: field.display_name,
    accessorFn: (row) => row.data[field.field_name],
    filter:
      field.data_type === "number" || field.data_type === "integer"
        ? "number"
        : "auto",
  }));
}

export function TableCopyControls({
  tableId,
  tableName,
  fields,
  selectedRowIds,
  loadRows,
  className,
}: TableCopyControlsProps) {
  const copySubset = useCopySubsetVariant();
  const selectedSet = new Set(selectedRowIds);
  const selectedRows = async () =>
    (await loadRows()).filter((row) => selectedSet.has(row.id));

  const subsetSource = (): CopySubsetSource<DataTableCopyRow> => ({
    label: tableName,
    location: "AI Matrx — Data Table",
    kind: "user-data-table",
    rows: loadRows,
    columns: subsetColumns(fields),
    getRowId: (row) => row.id,
    initialSelectedIds: selectedRowIds,
    serializer: (rows, columns) => {
      const chosen = new Set(columns.map((column) => column.id));
      return buildDataTableAgentInput({
        tableId,
        tableName,
        rows,
        fields: fields.filter((field) => chosen.has(field.id)),
        scope: "custom",
      });
    },
  });

  const viewVariants: AiVariant[] = [
    {
      id: "view-markdown",
      label: "Copy table",
      hint: "Markdown table of the complete current view",
      icon: Copy,
      section: "copy",
      ariaLabel: `Copy ${tableName}`,
      successMessage: `${tableName} copied`,
      build: async () =>
        dataTableRowsToMarkdown(tableName, await loadRows(), fields),
    },
    {
      id: "json",
      label: "Copy JSON",
      hint: "Pretty-printed rows with friendly column names",
      icon: Braces,
      section: "copy",
      successMessage: `${tableName} JSON copied to clipboard`,
      build: async () =>
        JSON.stringify(projectDataTableRows(await loadRows(), fields), null, 2),
    },
    {
      id: "copy-for-ai",
      label: "Current table view",
      hint: "Every row and column with table context — never lossy",
      section: "ai",
      ariaLabel: `Copy ${tableName} for AI`,
      successMessage: `${tableName} copied for AI agent`,
      build: async () =>
        buildDataTableAgentInput({
          tableId,
          tableName,
          rows: await loadRows(),
          fields,
          scope: "view",
        }),
    },
  ];

  const selectedVariants: AiVariant[] =
    selectedRowIds.length === 0
      ? []
      : [
          {
            id: "selected-ai",
            label: `Selected ${selectedRowIds.length === 1 ? "row" : "rows"} (${selectedRowIds.length})`,
            hint: "Only the ticked rows, with table context",
            section: "ai",
            successMessage: `${tableName} — selected rows copied for AI`,
            build: async () =>
              buildDataTableAgentInput({
                tableId,
                tableName,
                rows: await selectedRows(),
                fields,
                scope: "selected",
              }),
          },
        ];

  return (
    <CopyButtons
      size="icon"
      label={tableName}
      className={className}
      aiVariants={[
        ...viewVariants,
        ...selectedVariants,
        copySubset(subsetSource, {
          hint: "Open the complete table, shape rows and columns, then copy",
        }),
      ]}
      export={{
        items: [
          {
            id: "json",
            label: "JSON (rows)",
            onSelect: async () =>
              downloadFile(
                exportFilename(tableName, "json"),
                JSON.stringify(
                  projectDataTableRows(await loadRows(), fields),
                  null,
                  2,
                ),
                "application/json",
              ),
          },
          {
            id: "csv",
            label: "CSV",
            onSelect: async () =>
              downloadFile(
                exportFilename(tableName, "csv"),
                rowsToCsv(projectDataTableRows(await loadRows(), fields)),
                "text/csv",
              ),
          },
        ],
      }}
    />
  );
}

"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table as TableIcon } from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { getColumns, toRows, type Row } from "./utils/joinResults";

interface ResultPreviewProps {
  data: unknown;
  emptyMessage?: string;
  defaultTab?: "table" | "json";
  maxTableRows?: number;
  className?: string;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

interface PreviewRow {
  row: Row;
  index: number;
}

function resultColumns(columns: string[]): MatrxColumnDef<PreviewRow>[] {
  let rowNumberId = "row-number";
  while (columns.includes(rowNumberId)) rowNumberId += ":";
  return [
    {
      id: rowNumberId,
      header: "#",
      accessorFn: (preview) => preview.index + 1,
      sortable: false,
      filter: false,
      width: 48,
      compact: true,
      cell: (preview) => (
        <span className="font-mono text-muted-foreground">
          {preview.index + 1}
        </span>
      ),
    },
    ...columns.map(
      (column): MatrxColumnDef<PreviewRow> => ({
        id: column,
        header: column,
        accessorFn: (preview) => preview.row[column],
        sortValue: (preview) => {
          const value = preview.row[column];
          return value !== null && typeof value === "object"
            ? formatCell(value)
            : value;
        },
        filterValue: (preview) => formatCell(preview.row[column]),
        filter: "text",
        width: 260,
        cell: (preview) => {
          const text = formatCell(preview.row[column]);
          return (
            <div
              className="max-w-[25rem] truncate font-mono text-xs"
              title={text}
            >
              {text || <span className="text-muted-foreground">NULL</span>}
            </div>
          );
        },
      }),
    ),
  ];
}

export function ResultPreview({
  data,
  emptyMessage = "No rows returned",
  defaultTab = "table",
  maxTableRows = 100,
  className,
}: ResultPreviewProps) {
  const [tab, setTab] = useState<string>(defaultTab);
  const rows = toRows(data);
  const columns = getColumns(rows);
  const truncated = rows.length > maxTableRows;
  const displayRows = truncated ? rows.slice(0, maxTableRows) : rows;
  const tableRows = displayRows.map((row, index) => ({ row, index }));

  if (rows.length === 0 && (data === null || data === undefined)) {
    return (
      <div
        className={`p-3 text-xs text-slate-500 dark:text-slate-400 italic ${
          className ?? ""
        }`}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-0 overflow-hidden ${className ?? ""}`}>
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-2 pt-2 pb-1 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <TabsList className="h-7 bg-transparent gap-1">
            <TabsTrigger
              value="table"
              className="text-xs h-6 px-2 data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-800"
            >
              <TableIcon className="h-3 w-3 mr-1" />
              Table ({rows.length})
            </TabsTrigger>
            <TabsTrigger
              value="json"
              className="text-xs h-6 px-2 data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-800"
            >
              JSON
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="table"
          className="m-0 flex-1 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
        >
          {rows.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 dark:text-slate-400 italic">
              {emptyMessage}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <MatrxDataTable<PreviewRow>
                data={tableRows}
                columns={resultColumns(columns)}
                getRowId={(preview) => String(preview.index)}
                density="condensed"
                stickyHeader
                viewTabs={false}
                pageSize={0}
                hidePagination
                detail={{ enabled: false }}
                window={{ enabled: false }}
                toolbar={{
                  title: "Query results",
                  search: true,
                  searchPlaceholder: "Search result rows…",
                }}
                className="min-h-0 flex-1"
                emptyState={{ title: emptyMessage }}
              />
              {truncated && (
                <div className="shrink-0 border-t border-border bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
                  Showing {maxTableRows} of {rows.length} rows. Switch to JSON
                  to see all.
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="json"
          className="m-0 flex-1 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
        >
          <JsonInspector data={data} defaultView="json" className="h-full" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

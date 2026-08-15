"use client";

import { useMemo, useState } from "react";
import { Columns3, Copy, Loader2, RotateCcw, Search } from "lucide-react";

import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import { filterAndSortRows } from "@/components/official/matrx-data-table/filter-engine";
import type { LayeredFilterField } from "@/components/official/matrx-data-table/layered-filters";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  dataTableCopyValueText,
  type DataTableCopyField,
  type DataTableCopyRow,
} from "@/features/data-tables/table-copy";

const DEFAULT_CUSTOM_QUERY: MatrxDataTableQueryState = {
  page: 1,
  pageSize: 50,
  search: "",
  searchMatchMode: "contains",
  anyOf: "",
  layeredFilters: [],
  columnFilters: {},
  sort: null,
};

function customCopyInitialRect() {
  const width = Math.min(1280, Math.max(760, window.innerWidth - 48));
  const height = Math.min(820, Math.max(520, window.innerHeight - 40));
  return {
    x: Math.max(12, (window.innerWidth - width) / 2),
    y: Math.max(10, (window.innerHeight - height) / 2),
    width,
    height,
  };
}

export interface TableCustomCopyWindowProps {
  tableId: string;
  tableName: string;
  mode: "human" | "ai";
  fields: DataTableCopyField[];
  rows: DataTableCopyRow[];
  sourceSelectedRowIds: string[];
  fieldIds: string[];
  onFieldIdsChange: (ids: string[]) => void;
  rowIds: string[];
  onRowIdsChange: (ids: string[]) => void;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onRetry: () => void;
  onCopy: () => void;
  onClose: () => void;
}

export function TableCustomCopyWindow({
  tableId,
  tableName,
  mode,
  fields,
  rows,
  sourceSelectedRowIds,
  fieldIds,
  onFieldIdsChange,
  rowIds,
  onRowIdsChange,
  loading,
  error,
  busy,
  onRetry,
  onCopy,
  onClose,
}: TableCustomCopyWindowProps) {
  const initialRect = useMemo(() => customCopyInitialRect(), []);
  const [columnSearch, setColumnSearch] = useState("");
  const [queryState, setQueryState] = useState(DEFAULT_CUSTOM_QUERY);
  const fieldIdSet = useMemo(() => new Set(fieldIds), [fieldIds]);

  const columns = useMemo<MatrxColumnDef<DataTableCopyRow>[]>(
    () =>
      fields
        .filter((field) => fieldIdSet.has(field.id))
        .map((field) => ({
          id: field.id,
          header: field.display_name,
          accessorFn: (row) => row.data[field.field_name],
          filter:
            field.data_type === "number" || field.data_type === "integer"
              ? "number"
              : "auto",
          cellKind: "text",
          cell: (row) => {
            const text = dataTableCopyValueText(row.data[field.field_name]);
            return (
              <span
                className="block max-w-[32rem] whitespace-pre-wrap break-words text-xs"
                title={text}
              >
                {text || <span className="text-muted-foreground">—</span>}
              </span>
            );
          },
        })),
    [fieldIdSet, fields],
  );

  const layeredFields = useMemo<LayeredFilterField[]>(
    () =>
      fields
        .filter((field) => fieldIdSet.has(field.id))
        .map((field) =>
          field.data_type === "number" || field.data_type === "integer"
            ? {
                id: field.id,
                label: field.display_name,
                kind: "number" as const,
              }
            : {
                id: field.id,
                label: field.display_name,
                kind: "text" as const,
              },
        ),
    [fieldIdSet, fields],
  );

  const filteredRows = useMemo(
    () =>
      filterAndSortRows(
        rows,
        columns,
        queryState.columnFilters,
        queryState.sort,
        queryState.search,
        undefined,
        queryState.layeredFilters,
        queryState.searchMatchMode,
      ),
    [columns, queryState, rows],
  );

  const changeFields = (nextIds: string[]) => {
    const nextSet = new Set(nextIds);
    onFieldIdsChange(nextIds);
    setQueryState((current) => ({
      ...current,
      page: 1,
      columnFilters: Object.fromEntries(
        Object.entries(current.columnFilters).filter(([id]) => nextSet.has(id)),
      ),
      layeredFilters: current.layeredFilters?.filter((rule) =>
        nextSet.has(rule.field),
      ),
      sort: current.sort && nextSet.has(current.sort.id) ? current.sort : null,
    }));
  };

  const sourceSelectedSet = new Set(sourceSelectedRowIds);
  const availableSourceSelection = rows
    .filter((row) => sourceSelectedSet.has(row.id))
    .map((row) => row.id);

  return (
    <WindowPanel
      id={`table-custom-copy-${tableId}`}
      title={`${mode === "ai" ? "Copy for AI" : "Copy"} — ${tableName}`}
      onClose={onClose}
      initialRect={initialRect}
      minWidth={680}
      minHeight={460}
      sidebar={
        <ColumnChooser
          fields={fields}
          selectedIds={fieldIds}
          search={columnSearch}
          onSearchChange={setColumnSearch}
          onSelectedIdsChange={changeFields}
        />
      }
      sidebarDefaultSize={320}
      sidebarMinSize={240}
      sidebarClassName="overflow-hidden"
      bodyClassName="overflow-hidden bg-background"
      footerVariant="rich"
      footer={
        <div className="flex w-full flex-wrap items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {rowIds.length.toLocaleString()} of {rows.length.toLocaleString()}{" "}
              rows
            </span>{" "}
            · {fieldIds.length.toLocaleString()} of{" "}
            {fields.length.toLocaleString()} columns
            {queryState.search ||
            queryState.layeredFilters?.length ||
            Object.values(queryState.columnFilters).some(Boolean)
              ? ` · ${filteredRows.length.toLocaleString()} rows match the current filters`
              : ""}
          </div>
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
          <Button
            type="button"
            disabled={
              busy || loading || rowIds.length === 0 || fieldIds.length === 0
            }
            onClick={onCopy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "ai" ? (
              <CopyForAiIcon className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Copy selected data{mode === "ai" ? " for AI" : ""}
          </Button>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col p-2">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading the complete table…
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="max-w-xl text-sm text-destructive">
              Couldn&apos;t load the table: {error}
            </p>
            <Button type="button" variant="outline" onClick={onRetry}>
              <RotateCcw className="h-4 w-4" /> Retry
            </Button>
          </div>
        ) : fieldIds.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Columns3 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Choose at least one column</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Use the column panel on the left. The table preview and its search
              tools update immediately.
            </p>
          </div>
        ) : (
          <MatrxDataTable<DataTableCopyRow>
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            query={{
              mode: "controlled-local",
              state: queryState,
              onStateChange: setQueryState,
            }}
            toolbar={{
              searchPlaceholder: "Search every selected column…",
              searchMatch: {},
              layeredFilters: {
                fields: layeredFields,
                maxRules: 20,
                label: "Advanced row filters",
              },
              actions: (
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    onClick={() =>
                      onRowIdsChange(filteredRows.map((row) => row.id))
                    }
                  >
                    Only filtered ({filteredRows.length.toLocaleString()})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    disabled={availableSourceSelection.length === 0}
                    onClick={() => onRowIdsChange(availableSourceSelection)}
                  >
                    Table selection (
                    {availableSourceSelection.length.toLocaleString()})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => onRowIdsChange(rows.map((row) => row.id))}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => onRowIdsChange([])}
                  >
                    Clear all
                  </Button>
                </div>
              ),
            }}
            selection={{
              selectedIds: rowIds,
              onSelectedIdsChange: onRowIdsChange,
              noun: "row",
            }}
            detail={{ enabled: false }}
            window={{ enabled: false }}
            pageSize={50}
            pageSizeOptions={[20, 50, 100, 200]}
            className="min-h-0 flex-1"
            emptyState={{
              title: "No rows match",
              description:
                "Clear or loosen the search and column filters to see more rows.",
            }}
          />
        )}
      </div>
    </WindowPanel>
  );
}

function ColumnChooser({
  fields,
  selectedIds,
  search,
  onSearchChange,
  onSelectedIdsChange,
}: {
  fields: DataTableCopyField[];
  selectedIds: string[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelectedIdsChange: (ids: string[]) => void;
}) {
  const selectedSet = new Set(selectedIds);
  const query = search.trim().toLocaleLowerCase();
  const shown = query
    ? fields.filter(
        (field) =>
          field.display_name.toLocaleLowerCase().includes(query) ||
          field.field_name.toLocaleLowerCase().includes(query),
      )
    : fields;

  return (
    <section className="flex h-full min-h-0 flex-col bg-card">
      <div className="shrink-0 space-y-3 border-b border-border p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Columns</h2>
            <p className="text-xs text-muted-foreground">
              {selectedIds.length.toLocaleString()} of{" "}
              {fields.length.toLocaleString()} included
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() =>
                onSelectedIdsChange(fields.map((field) => field.id))
              }
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onSelectedIdsChange([])}
            >
              Clear all
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Find a column…"
            className="h-8 pl-8 text-sm"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No columns match “{search}”.
          </p>
        ) : (
          <div className="space-y-1">
            {shown.map((field) => (
              <label
                key={field.id}
                className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md px-2 py-2 hover:bg-muted"
              >
                <Checkbox
                  checked={selectedSet.has(field.id)}
                  onCheckedChange={(checked) =>
                    onSelectedIdsChange(
                      checked === true
                        ? [...new Set([...selectedIds, field.id])]
                        : selectedIds.filter((id) => id !== field.id),
                    )
                  }
                  aria-label={`Include ${field.display_name}`}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-normal break-words text-sm leading-5">
                    {field.display_name}
                  </span>
                  {field.field_name !== field.display_name ? (
                    <span className="block break-all text-[10px] leading-4 text-muted-foreground">
                      {field.field_name}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Columns3, Eye, Grid2x2, Loader2, Rows3, Table2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
// Located first (lane INTEG-CLIENTS): a moved or record-store table opens from its own store.
import LocatedTableViewer from "@/features/data-tables/components/LocatedTableViewer";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";
import { usePickerInputFocus } from "./usePickerInputFocus";
import {
  PickerEmpty,
  PickerRow,
  PickerSearchField,
  PickerSectionLabel,
  PickerView,
  PickerViewBody,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";
import type { TableBookmark } from "@ai-matrx/agents/message-parts";
import {
  isUserTableFieldRow,
  isUserTableListRow,
  type UserTableFieldRow,
  type UserTableListRow,
} from "@/utils/user-tables-rpc";
import { getTableMetadata, getTablePage, listTablesEverywhere } from "@/features/data-tables/service";
import { locateTable } from "@/features/data-tables/data-source/locate-table";
import { isServiceFailure } from "@/features/data-tables/types";
import { ReadFailure } from "@ai-matrx/design-system";

// Types
type UserTable = UserTableListRow;

/** The organization a table lives in, named when the list spans several (from `listTablesEverywhere`). */
const orgNameOf = (t: UserTable): string | null => (t as { organization_name?: string | null }).organization_name ?? null;
type TableField = UserTableFieldRow;

interface TableRow {
  id: string;
  data: Record<string, unknown>;
}

type SelectionType = "table" | "row" | "column" | "cell";
type ViewMode =
  "tables" | "table-options" | "rows" | "columns" | "cell-row" | "cell-column";

export type TableReference = Exclude<
  TableBookmark,
  { type: "table_schema" }
> & {
  table_name: string;
  column_display_name?: string;
  description: string;
};

interface TablesResourcePickerProps {
  onBack: () => void;
  onSelect: (reference: TableReference) => void;
}

export function TablesResourcePicker({
  onBack,
  onSelect,
}: TablesResourcePickerProps) {
  const searchInputRef = usePickerInputFocus();
  const [tables, setTables] = useState<UserTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by "Try again" on the list read.
  const [listAttempt, setListAttempt] = useState(0);
  // A failed row/column read is about THAT pick — it never replaces the picker.
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Selection state
  const [viewMode, setViewMode] = useState<ViewMode>("tables");
  const [selectedTable, setSelectedTable] = useState<UserTable | null>(null);
  const [selectionType, setSelectionType] = useState<SelectionType | null>(
    null,
  );
  const [fields, setFields] = useState<TableField[]>([]);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<TableRow | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<TableField | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Preview modal state
  const [previewTableId, setPreviewTableId] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Load user tables
  useEffect(() => {
    let alive = true;
    async function loadTables() {
      try {
        setLoading(true);
        setError(null);
        // Older tables AND the organization's record-store Tables (lane INTEG-CLIENTS F1/F7):
        // the server's reference resolver follows a moved table by id (INTEG-SERVER A6).
        const listed = await listTablesEverywhere();
        if (!listed.success) throw new Error(listed.error);
        const rows: unknown[] = listed.data.map((t) => ({ ...t, description: t.description ?? undefined }));
        if (!alive) return;
        setTables(rows.filter(isUserTableListRow));
      } catch (err) {
        console.error("Error fetching tables:", err);
        if (alive) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadTables();
    return () => {
      alive = false;
    };
  }, [listAttempt]);

  // Load table details (fields and rows). True when they loaded.
  const loadTableDetails = async (table: UserTable): Promise<boolean> => {
    try {
      setLoadingDetails(true);
      setDetailsError(null);

      // Column schema only — the rows this picker previews are fetched
      // separately below, so there is no reason to materialize the dataset.
      // Located first, so a moved table reads its store, not its archived copy.
      const located = await locateTable(table.id);
      if (!located.ok) throw new Error(located.error);
      const meta = await getTableMetadata({ tableId: table.id });
      if (isServiceFailure(meta)) throw new Error(meta.error);
      setFields(meta.data.columns.filter(isUserTableFieldRow));

      // Get rows (first 100), through the seam.
      const page = await getTablePage({ tableId: table.id, limit: 100, offset: 0 });
      if (isServiceFailure(page)) throw new Error(page.error);
      setRows(page.data.rows);
      return true;
    } catch (err) {
      console.error("Error loading table details:", err);
      setDetailsError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setLoadingDetails(false);
    }
  };

  // Filter tables by search
  const filteredTables = !searchQuery.trim()
    ? tables
    : filterAndSortBySearch(tables, searchQuery, [
        { get: (t) => t.table_name, weight: "title" },
        { get: (t) => t.description, weight: "body" },
      ]);

  // Filter rows by search — each row's cell values are treated as body-weight fields.
  const filteredRows = !searchQuery.trim()
    ? rows
    : filterAndSortBySearch(rows, searchQuery, [
        {
          get: (row) =>
            Object.values(row.data)
              .filter((v) => v != null)
              .map((v) => String(v)),
          weight: "body",
        },
      ]);

  // Filter columns by search
  const filteredColumns = !searchQuery.trim()
    ? fields
    : filterAndSortBySearch(fields, searchQuery, [
        { get: (f) => f.display_name, weight: "title" },
        { get: (f) => f.field_name, weight: "subtitle" },
      ]);

  // Get display value for a row
  const getRowDisplayValue = (row: TableRow) => {
    // First try meaningful field names
    const meaningfulFields = ["name", "title", "label", "description"];
    for (const fieldName of meaningfulFields) {
      if (row.data[fieldName]) {
        return `${row.data[fieldName]}`;
      }
    }

    // Fall back to the first column based on field_order
    if (fields.length > 0) {
      const sortedFields = [...fields].sort(
        (a, b) => a.field_order - b.field_order,
      );
      const firstField = sortedFields[0];
      const firstValue = row.data[firstField.field_name];
      if (firstValue !== null && firstValue !== undefined) {
        return `${firstValue}`;
      }
    }

    // Last resort: use row ID
    return row.id.substring(0, 8);
  };

  const closePreviewModal = () => {
    setShowPreviewModal(false);
    setPreviewTableId(null);
  };

  // Handle table selection (navigate to options view)
  const handleTableSelect = (table: UserTable) => {
    setDetailsError(null);
    setSelectedTable(table);
    setViewMode("table-options");
    setSearchQuery("");
  };

  // Handle selection type choice
  const handleSelectionTypeSelect = async (type: SelectionType) => {
    if (!selectedTable) return;

    setSelectionType(type);

    if (type === "table") {
      // Immediate selection for full table
      onSelect({
        type: "full_table",
        table_id: selectedTable.id,
        table_name: selectedTable.table_name,
        description: `Reference to entire table "${selectedTable.table_name}"`,
      });
      return;
    }

    // Load details for other types. A failed read stays on the options with
    // the reason and a retry — never an empty "No rows" list.
    if (!(await loadTableDetails(selectedTable))) return;

    if (type === "row") {
      setViewMode("rows");
    } else if (type === "column") {
      setViewMode("columns");
    } else if (type === "cell") {
      setViewMode("cell-row");
    }
  };

  // Handle row selection
  const handleRowSelect = (row: TableRow) => {
    if (!selectedTable) return;
    if (selectionType === "row") {
      onSelect({
        type: "table_row",
        table_id: selectedTable.id,
        table_name: selectedTable.table_name,
        row_id: row.id,
        description: `Reference to row ${row.id} in table "${selectedTable.table_name}"`,
      });
    } else if (selectionType === "cell") {
      setSelectedRow(row);
      setViewMode("cell-column");
      setSearchQuery("");
    }
  };

  // Handle column selection
  const handleColumnSelect = (column: TableField) => {
    if (!selectedTable) return;
    if (selectionType === "column") {
      onSelect({
        type: "table_column",
        table_id: selectedTable.id,
        table_name: selectedTable.table_name,
        column_name: column.field_name,
        column_display_name: column.display_name,
        description: `Reference to column "${column.display_name}" in table "${selectedTable.table_name}"`,
      });
    } else if (selectionType === "cell" && selectedRow) {
      onSelect({
        type: "table_cell",
        table_id: selectedTable.id,
        table_name: selectedTable.table_name,
        row_id: selectedRow.id,
        column_name: column.field_name,
        column_display_name: column.display_name,
        description: `Reference to cell "${column.display_name}" in row ${selectedRow.id} of table "${selectedTable.table_name}"`,
      });
    }
  };

  // Handle back navigation
  const handleBackNavigation = () => {
    setDetailsError(null);
    if (viewMode === "table-options") {
      setViewMode("tables");
      setSelectedTable(null);
      setSelectionType(null);
      setSearchQuery("");
    } else if (
      viewMode === "rows" ||
      viewMode === "columns" ||
      viewMode === "cell-row"
    ) {
      setViewMode("table-options");
      setSelectionType(null);
      setSearchQuery("");
    } else if (viewMode === "cell-column") {
      setViewMode("cell-row");
      setSelectedRow(null);
      setSearchQuery("");
    } else {
      onBack();
    }
  };

  const locationLabel = () => {
    if (!selectedTable) return null;
    if (viewMode === "rows" || viewMode === "cell-row") return `${selectedTable.table_name} / Rows`;
    if (viewMode === "columns") return `${selectedTable.table_name} / Columns`;
    if (viewMode === "cell-column" && selectedRow) {
      return `${selectedTable.table_name} / ${getRowDisplayValue(selectedRow)} / Columns`;
    }
    return selectedTable.table_name;
  };

  const spinner = (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  const referenceTypes: {
    type: SelectionType;
    icon: typeof Table2;
    label: string;
    secondary: string;
  }[] = [
    { type: "table", icon: Table2, label: "Full table", secondary: "Reference all rows and columns" },
    { type: "row", icon: Rows3, label: "Single row", secondary: "Reference one specific row" },
    { type: "column", icon: Columns3, label: "Full column", secondary: "Reference all values in one column" },
    { type: "cell", icon: Grid2x2, label: "Single cell", secondary: "Reference one specific cell value" },
  ];

  const renderBody = () => {
    if (loading) return spinner;
    if (error) {
      return (
        <ReadFailure
          error={error}
          what="your tables"
          onRetry={() => setListAttempt((n) => n + 1)}
        />
      );
    }

    if (viewMode === "tables") {
      if (filteredTables.length === 0) {
        return <PickerEmpty>{searchQuery ? "No tables found" : "No tables yet"}</PickerEmpty>;
      }
      return (
        <div>
          {filteredTables.map((table) => {
            const org = orgNameOf(table);
            const secondary = org || table.description
              ? `${org ? `${org}${table.description ? " · " : ""}` : ""}${table.description ?? ""}`
              : undefined;
            return (
              <PickerRow
                key={table.id}
                icon={Table2}
                iconClassName="text-emerald-600 dark:text-emerald-400"
                label={table.table_name}
                secondary={secondary}
                chevron
                onClick={() => handleTableSelect(table)}
              />
            );
          })}
        </div>
      );
    }

    if (viewMode === "table-options") {
      if (!selectedTable) return null;
      return (
        <div>
          <PickerSectionLabel>{locationLabel()}</PickerSectionLabel>
          <PickerRow
            icon={Eye}
            iconClassName="text-primary"
            label="Preview table data"
            onClick={() => {
              setPreviewTableId(selectedTable.id);
              setShowPreviewModal(true);
            }}
          />
          {referenceTypes.map(({ type, icon, label, secondary }) => (
            <PickerRow
              key={type}
              icon={icon}
              label={label}
              secondary={secondary}
              busy={loadingDetails && selectionType === type}
              disabled={loadingDetails}
              onClick={() => void handleSelectionTypeSelect(type)}
            />
          ))}
          {detailsError && selectionType ? (
            <ReadFailure
              error={detailsError}
              what={`the ${selectionType === "column" ? "columns" : "rows"} of ${selectedTable.table_name}`}
              onRetry={() => void handleSelectionTypeSelect(selectionType)}
            />
          ) : null}
        </div>
      );
    }

    if (viewMode === "rows" || viewMode === "cell-row") {
      return (
        <div>
          <PickerSectionLabel>{locationLabel()}</PickerSectionLabel>
          {loadingDetails ? (
            spinner
          ) : filteredRows.length === 0 ? (
            <PickerEmpty>{searchQuery ? "No rows found" : "No rows in table"}</PickerEmpty>
          ) : (
            filteredRows.map((row) => (
              <PickerRow
                key={row.id}
                icon={Rows3}
                label={getRowDisplayValue(row)}
                secondary={`${Object.keys(row.data).length} fields`}
                chevron={viewMode === "cell-row"}
                onClick={() => handleRowSelect(row)}
              />
            ))
          )}
        </div>
      );
    }

    if (viewMode === "columns" || viewMode === "cell-column") {
      return (
        <div>
          <PickerSectionLabel>{locationLabel()}</PickerSectionLabel>
          {loadingDetails ? (
            spinner
          ) : filteredColumns.length === 0 ? (
            <PickerEmpty>{searchQuery ? "No columns found" : "No columns in table"}</PickerEmpty>
          ) : (
            filteredColumns.map((field) => (
              <PickerRow
                key={field.id}
                icon={Columns3}
                label={field.display_name}
                secondary={`${field.data_type}${field.is_required ? " · Required" : ""}`}
                onClick={() => handleColumnSelect(field)}
              />
            ))
          )}
        </div>
      );
    }

    return null;
  };

  const searchPlaceholder =
    viewMode === "tables"
      ? "Search tables"
      : viewMode === "rows" || viewMode === "cell-row"
        ? "Search rows"
        : viewMode === "columns" || viewMode === "cell-column"
          ? "Search columns"
          : "Search";

  return (
    <PickerView>
      <ResourcePickerSubViewHeader
        onBack={handleBackNavigation}
        disabled={loadingDetails}
        search={
          <PickerSearchField
            ref={searchInputRef}
            placeholder={searchPlaceholder}
            value={searchQuery}
            loading={loadingDetails}
            disabled={loadingDetails}
            onChange={setSearchQuery}
          />
        }
      />
      <PickerViewBody>{renderBody()}</PickerViewBody>

      {/* Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        {/* A PREVIEW IS COMPACT AND READ-ONLY (merged-grid review 2, fix lane F item 3): it was a
            near-full-screen, fully editable grid. The person is choosing a reference here, not
            editing the table; it changes on its own page. */}
        <DialogContent className="max-w-3xl w-full h-[60dvh] p-0 gap-0 flex flex-col" data-table-preview="">
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-semibold">
                Table Preview
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {previewTableId && (
              <div className="h-full px-3 py-2">
                <LocatedTableViewer tableId={previewTableId} readOnly />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PickerView>
  );
}

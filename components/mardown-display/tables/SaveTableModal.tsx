"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ChevronDown,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Columns3,
} from "lucide-react";
import { useToastManager } from "@/hooks/useToastManager";
import { cn } from "@/lib/utils";
import { MultiStepLoader } from "@/components/ui/multi-step-loader";
import { supabase } from "@/utils/supabase/client";
import {
  createTable,
  addRow,
  getTableDetails,
  type FieldDefinition,
  type TableField,
} from "@/utils/user-table-utls/table-utils";
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { reconcileColumns } from "@/features/data-tables/reconcile";
import {
  appendToTable,
  replaceTable,
  type SaveToTableResult,
} from "@/features/data-tables/save-to-table";

// Public response shape — kept stable so parents (`SavedTableInfo` in
// MarkdownTable / StreamingTableRenderer) and downstream consumers continue
// working without changes.
export interface SaveTableResponse {
  table_id: string;
  table_name: string;
  row_count: string;
  field_count: string;
}

interface UserTableSummary {
  id: string;
  table_name: string;
  description: string;
  row_count: number;
  field_count: number;
}

type ExistingMode = "append" | "replace";
type DuplicateAction = "skip" | "update";

const getLoadingStates = (rowCount: number) => {
  const baseMessages = [
    { text: "Initializing table structure..." },
    { text: "Analyzing data patterns..." },
    { text: "Optimizing columns and rows..." },
    { text: "Creating database entries..." },
    { text: "Generating table metadata..." },
    { text: "Setting up data relationships..." },
    { text: "Finalizing table creation..." },
    { text: "Almost there! Preparing your table..." },
  ];

  if (rowCount > 20) {
    baseMessages.splice(3, 0, { text: "Processing data records..." });
    baseMessages.splice(5, 0, { text: "Validating data integrity..." });
  }

  if (rowCount > 50) {
    baseMessages.splice(2, 0, { text: "Optimizing for large dataset..." });
    baseMessages.splice(7, 0, { text: "Running performance checks..." });
  }

  return baseMessages;
};

/** Compact human summary of a save result for the success toast. */
function summarizeResult(verb: string, name: string, r: SaveToTableResult) {
  const parts: string[] = [];
  if (r.inserted) parts.push(`${r.inserted} added`);
  if (r.updated) parts.push(`${r.updated} updated`);
  if (r.skipped) parts.push(`${r.skipped} skipped`);
  if (r.failed) parts.push(`${r.failed} failed`);
  if (r.columnsAdded)
    parts.push(
      `${r.columnsAdded} new column${r.columnsAdded === 1 ? "" : "s"}`,
    );
  return `${verb} "${name}"${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

interface SaveTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveComplete?: (tableInfo: SaveTableResponse) => void;
  /** Normalized rows from the table — `Array<{ [displayHeader]: cellValue }>`. */
  tableData: Array<Record<string, string>>;
}

const SaveTableModal: React.FC<SaveTableModalProps> = ({
  isOpen,
  onClose,
  onSaveComplete,
  tableData,
}) => {
  const dispatch = useAppDispatch();
  const toast = useToastManager();
  const isMountedRef = useRef(true);

  // ── Create-new form ────────────────────────────────────────────────────
  const [tableName, setTableName] = useState("");
  const [tableDescription, setTableDescription] = useState("");
  const [stage, setStage] = useState<"form" | "saving">("form");

  // ── Save-to-existing ───────────────────────────────────────────────────
  const [useExisting, setUseExisting] = useState(false);
  const [tables, setTables] = useState<UserTableSummary[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const [fields, setFields] = useState<TableField[] | null>(null);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  const [existingMode, setExistingMode] = useState<ExistingMode>("append");
  const [addNewColumns, setAddNewColumns] = useState(true);
  const [dedupeEnabled, setDedupeEnabled] = useState(false);
  const [identifierField, setIdentifierField] = useState("");
  const [dedupeAction, setDedupeAction] = useState<DuplicateAction>("skip");
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Derive headers from the first row's keys. Object key order is
  // insertion-order-preserved per ES2015+ for string keys, and the upstream
  // `normalizedData` is built from the headers array in order — so this
  // matches the visible column order.
  const displayHeaders = useMemo(() => {
    const first = tableData?.[0];
    return first ? Object.keys(first) : [];
  }, [tableData]);

  const rowCount = Array.isArray(tableData) ? tableData.length : 0;

  // Reset everything shortly after close so reopening starts fresh.
  useEffect(() => {
    if (isOpen) return;
    const timeout = setTimeout(() => {
      if (!isMountedRef.current) return;
      setStage("form");
      setTableName("");
      setTableDescription("");
      setUseExisting(false);
      setSelectedTableId(null);
      setFields(null);
      setFieldsError(null);
      setExistingMode("append");
      setAddNewColumns(true);
      setDedupeEnabled(false);
      setIdentifierField("");
      setDedupeAction("skip");
      setConfirmReplaceOpen(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  // Load the user's tables the first time the "existing" section is opened.
  useEffect(() => {
    if (!useExisting || tables.length > 0 || tablesLoading) return;
    let cancelled = false;
    (async () => {
      setTablesLoading(true);
      setTablesError(null);
      try {
        const { data, error } = await supabase.rpc("get_user_tables");
        if (error) throw error;
        const payload = data as unknown as {
          success: boolean;
          error?: string;
          tables?: UserTableSummary[];
        };
        if (!payload.success) {
          throw new Error(payload.error || "Failed to load tables");
        }
        if (!cancelled) setTables(payload.tables || []);
      } catch (err) {
        if (!cancelled) {
          setTablesError(
            err instanceof Error ? err.message : "Failed to load tables",
          );
        }
      } finally {
        if (!cancelled) setTablesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useExisting, tables.length, tablesLoading]);

  // Load the chosen table's fields whenever the selection changes.
  useEffect(() => {
    if (!selectedTableId) {
      setFields(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setFieldsLoading(true);
      setFieldsError(null);
      try {
        const result = await getTableDetails(supabase, selectedTableId);
        if (!result.success || !result.fields) {
          throw new Error(result.error || "Failed to load table details");
        }
        if (!cancelled) setFields(result.fields);
      } catch (err) {
        if (!cancelled) {
          setFieldsError(
            err instanceof Error ? err.message : "Failed to load fields",
          );
          setFields(null);
        }
      } finally {
        if (!cancelled) setFieldsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTableId]);

  const reconciliation = useMemo(() => {
    if (!fields) return null;
    return reconcileColumns(displayHeaders, fields);
  }, [fields, displayHeaders]);

  // Identifier options = matched columns (must exist in BOTH the table and the
  // incoming data for a comparison to mean anything).
  const identifierOptions = reconciliation?.matched ?? [];

  // Default the identifier to the first required matched field, else the first.
  useEffect(() => {
    if (!reconciliation) {
      setIdentifierField("");
      return;
    }
    const matchedFields = reconciliation.matched.map((m) => m.field);
    const preferred =
      matchedFields.find((f) => f.is_required) ?? matchedFields[0];
    setIdentifierField(preferred?.field_name ?? "");
  }, [reconciliation]);

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;

  // Columns that will actually be written (matched + opt-in new columns).
  const writableColumnCount = reconciliation
    ? reconciliation.matched.length +
      (addNewColumns ? reconciliation.incomingOnly.length : 0)
    : 0;

  const isLoading = stage === "saving";

  // ── Create-new path (unchanged behavior) ────────────────────────────────
  const handleCreateNew = async () => {
    if (!tableName.trim()) {
      toast.error("Table name is required");
      return;
    }
    if (!tableDescription.trim()) {
      toast.error("Table description is required");
      return;
    }
    if (displayHeaders.length === 0 || rowCount === 0) {
      toast.error("Table is empty — nothing to save");
      return;
    }

    setStage("saving");
    try {
      const fieldDefs: FieldDefinition[] = displayHeaders.map(
        (header, index) => ({
          field_name: sanitizeFieldName(header) || `column_${index + 1}`,
          display_name: header,
          data_type: "string",
          field_order: index + 1,
          is_required: index === 0,
        }),
      );

      const createResult = await createTable(supabase, {
        tableName: tableName.trim(),
        description: tableDescription.trim(),
        isPublic: false,
        authenticatedRead: false,
        fields: fieldDefs,
      });

      if (!createResult.success || !createResult.tableId) {
        throw new Error(createResult.error ?? "Failed to create table");
      }

      const tableId = createResult.tableId;
      const headerToFieldName = new Map(
        displayHeaders.map((header, index) => [
          header,
          fieldDefs[index].field_name,
        ]),
      );

      const insertResults = await Promise.all(
        tableData.map((row) => {
          const payload: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(row)) {
            const fieldName =
              headerToFieldName.get(key) ?? sanitizeFieldName(key);
            if (fieldName) payload[fieldName] = value;
          }
          return addRow(supabase, { tableId, data: payload });
        }),
      );

      const failedCount = insertResults.filter((r) => !r.success).length;
      if (failedCount > 0) {
        const firstError = insertResults.find((r) => !r.success)?.error;
        toast.warning(
          `${failedCount} of ${rowCount} row(s) failed to save${
            firstError ? `: ${firstError}` : ""
          }`,
        );
      }

      if (!isMountedRef.current) return;

      const response: SaveTableResponse = {
        table_id: tableId,
        table_name: tableName.trim(),
        row_count: String(rowCount - failedCount),
        field_count: String(fieldDefs.length),
      };

      finishSuccess(response, `Table "${response.table_name}" saved`);
    } catch (err) {
      if (!isMountedRef.current) return;
      toast.error(
        err instanceof Error ? err.message : "Failed to create table",
      );
      setStage("form");
    }
  };

  // ── Append path ─────────────────────────────────────────────────────────
  const handleAppend = async () => {
    if (!selectedTableId || !reconciliation || !selectedTable) return;
    if (writableColumnCount === 0) {
      toast.error(
        "No columns to write. Enable adding new columns, or pick a table that shares columns with this data.",
      );
      return;
    }

    setStage("saving");
    try {
      const result = await appendToTable({
        tableId: selectedTableId,
        rows: tableData,
        mapping: reconciliation.mapping,
        newColumns: addNewColumns ? reconciliation.incomingOnly : [],
        dedupe:
          dedupeEnabled && identifierField
            ? { identifierField, onDuplicate: dedupeAction }
            : undefined,
      });

      if (!isMountedRef.current) return;
      if (!result.success) {
        toast.error(result.error ?? "Failed to append rows");
        setStage("form");
        return;
      }
      if (result.failed > 0) {
        toast.warning(`${result.failed} row(s) failed to write`);
      }

      const response: SaveTableResponse = {
        table_id: selectedTableId,
        table_name: selectedTable.table_name,
        row_count: String(result.inserted + result.updated),
        field_count: String((fields?.length ?? 0) + result.columnsAdded),
      };
      finishSuccess(
        response,
        summarizeResult("Appended to", selectedTable.table_name, result),
      );
    } catch (err) {
      if (!isMountedRef.current) return;
      toast.error(err instanceof Error ? err.message : "Failed to append rows");
      setStage("form");
    }
  };

  // ── Replace path (confirmed) ────────────────────────────────────────────
  const handleReplace = async () => {
    if (!selectedTableId || !reconciliation || !selectedTable) return;
    if (writableColumnCount === 0) {
      toast.error(
        "No columns to write. Enable adding new columns, or pick a table that shares columns with this data.",
      );
      return;
    }

    setConfirmReplaceOpen(false);
    setStage("saving");
    try {
      const result = await replaceTable({
        tableId: selectedTableId,
        rows: tableData,
        mapping: reconciliation.mapping,
        newColumns: addNewColumns ? reconciliation.incomingOnly : [],
      });

      if (!isMountedRef.current) return;
      if (!result.success) {
        toast.error(result.error ?? "Failed to replace table");
        setStage("form");
        return;
      }
      if (result.failed > 0) {
        toast.warning(`${result.failed} row(s) failed to write`);
      }

      const response: SaveTableResponse = {
        table_id: selectedTableId,
        table_name: selectedTable.table_name,
        row_count: String(result.inserted),
        field_count: String((fields?.length ?? 0) + result.columnsAdded),
      };
      finishSuccess(
        response,
        summarizeResult("Replaced", selectedTable.table_name, result),
      );
    } catch (err) {
      if (!isMountedRef.current) return;
      toast.error(
        err instanceof Error ? err.message : "Failed to replace table",
      );
      setStage("form");
    }
  };

  // Shared success tail: hand the table to the Data Tables window, toast, and
  // close. Mirrors the original post-save behavior.
  const finishSuccess = (response: SaveTableResponse, message: string) => {
    dispatch(
      openOverlay({
        overlayId: "quickDataWindow",
        data: { selectedTable: response.table_id },
      }),
    );
    toast.success(message);
    onSaveComplete?.(response);
    onClose();
  };

  const handlePrimary = () => {
    if (isLoading) return;
    if (!useExisting) {
      handleCreateNew();
      return;
    }
    if (existingMode === "replace") {
      setConfirmReplaceOpen(true);
      return;
    }
    handleAppend();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || stage !== "form" || useExisting) return;
    if (tableName.trim() && tableDescription.trim()) {
      e.preventDefault();
      handleCreateNew();
    }
  };

  // Primary button enablement.
  const primaryDisabled = isLoading
    ? true
    : useExisting
      ? !selectedTableId ||
        !fields ||
        fieldsLoading ||
        writableColumnCount === 0 ||
        (dedupeEnabled && !identifierField)
      : !tableName.trim() || !tableDescription.trim();

  const primaryLabel = useExisting
    ? existingMode === "replace"
      ? "Replace table"
      : "Append rows"
    : "Save Table";

  // While stage === "saving", the MultiStepLoader takes the entire screen.
  // We unmount the Dialog during saving and let the loader own the surface.
  const showDialog = isOpen && stage !== "saving";

  return (
    <>
      {showDialog && (
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        >
          <DialogContent
            className={cn(
              "bg-textured text-gray-900 dark:text-gray-100",
              "sm:max-w-[560px] max-h-[90dvh] overflow-y-auto p-6",
            )}
          >
            <DialogHeader className="flex flex-row items-center justify-between mb-2">
              <DialogTitle className="text-xl font-semibold">
                Save Table
              </DialogTitle>
            </DialogHeader>

            {/* Create-new form */}
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label
                  htmlFor="table-name"
                  className="text-gray-700 dark:text-gray-300"
                >
                  Table Name{!useExisting && "*"}
                </Label>
                <Input
                  id="table-name"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="Enter table name"
                  className="border border-border bg-textured"
                  disabled={isLoading || useExisting}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <div className="grid gap-2">
                <Label
                  htmlFor="table-description"
                  className="text-gray-700 dark:text-gray-300"
                >
                  Description{!useExisting && "*"}
                </Label>
                <Textarea
                  id="table-description"
                  value={tableDescription}
                  onChange={(e) => setTableDescription(e.target.value)}
                  placeholder="Enter table description"
                  rows={2}
                  className="border border-border bg-textured resize-none"
                  disabled={isLoading || useExisting}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>

            {/* Advanced: save to an existing table */}
            <Collapsible
              open={useExisting}
              onOpenChange={setUseExisting}
              className="mt-1 border-t border-border pt-2"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-1 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-muted/50">
                <span>Save to an existing table instead</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    useExisting && "rotate-180",
                  )}
                />
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-4 pt-3">
                {/* Target table picker */}
                <div className="space-y-1.5">
                  <Label htmlFor="target-table" className="text-sm">
                    Target table
                  </Label>
                  {tablesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading
                      tables…
                    </div>
                  ) : tablesError ? (
                    <div className="text-sm text-red-500">{tablesError}</div>
                  ) : tables.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      You don&apos;t have any data tables yet. Use the create
                      form above instead.
                    </div>
                  ) : (
                    <Select
                      value={selectedTableId ?? ""}
                      onValueChange={(v) => setSelectedTableId(v || null)}
                    >
                      <SelectTrigger id="target-table">
                        <SelectValue placeholder="Pick a table…" />
                      </SelectTrigger>
                      <SelectContent>
                        {tables.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex items-baseline gap-2">
                              <span>{t.table_name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {t.row_count} row
                                {t.row_count === 1 ? "" : "s"} · {t.field_count}{" "}
                                col{t.field_count === 1 ? "" : "s"}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Column reconciliation + options */}
                {selectedTableId && (
                  <>
                    {fieldsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Reading
                        table format…
                      </div>
                    ) : fieldsError ? (
                      <div className="text-sm text-red-500">{fieldsError}</div>
                    ) : reconciliation ? (
                      <div className="space-y-3">
                        {/* Reconciliation summary */}
                        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>
                              {reconciliation.matched.length} column
                              {reconciliation.matched.length === 1
                                ? ""
                                : "s"}{" "}
                              match this table
                            </span>
                          </div>

                          {reconciliation.incomingOnly.length > 0 && (
                            <div className="space-y-1">
                              <label className="flex items-start gap-2 cursor-pointer">
                                <Checkbox
                                  checked={addNewColumns}
                                  onCheckedChange={(v) =>
                                    setAddNewColumns(v === true)
                                  }
                                  className="mt-0.5"
                                />
                                <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                                  <Plus className="h-3.5 w-3.5 shrink-0" />
                                  Add {reconciliation.incomingOnly.length} new
                                  column
                                  {reconciliation.incomingOnly.length === 1
                                    ? ""
                                    : "s"}{" "}
                                  to the table
                                </span>
                              </label>
                              <div className="pl-6 text-xs text-muted-foreground truncate">
                                {reconciliation.incomingOnly.join(", ")}
                              </div>
                              {!addNewColumns && (
                                <div className="pl-6 text-xs text-muted-foreground">
                                  These columns will be dropped.
                                </div>
                              )}
                            </div>
                          )}

                          {reconciliation.tableOnly.length > 0 && (
                            <div className="flex items-start gap-2 text-muted-foreground">
                              <Columns3 className="h-4 w-4 shrink-0 mt-0.5" />
                              <span className="text-xs">
                                {reconciliation.tableOnly.length} table column
                                {reconciliation.tableOnly.length === 1
                                  ? ""
                                  : "s"}{" "}
                                not in your data will be left empty:{" "}
                                <span className="text-muted-foreground/80">
                                  {reconciliation.tableOnly
                                    .map((f) => f.display_name)
                                    .join(", ")}
                                </span>
                              </span>
                            </div>
                          )}

                          {writableColumnCount === 0 && (
                            <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
                              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                              <span className="text-xs">
                                No columns to write. Enable &quot;Add new
                                columns&quot; or choose a table that shares
                                columns with this data.
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Mode: append vs replace */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setExistingMode("append")}
                            className={cn(
                              "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                              existingMode === "append"
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-textured text-muted-foreground hover:bg-muted/50",
                            )}
                          >
                            <div className="font-medium">Append</div>
                            <div className="text-[11px] text-muted-foreground">
                              Add these rows
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setExistingMode("replace")}
                            className={cn(
                              "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                              existingMode === "replace"
                                ? "border-destructive bg-destructive/10 text-foreground"
                                : "border-border bg-textured text-muted-foreground hover:bg-muted/50",
                            )}
                          >
                            <div className="font-medium">Replace</div>
                            <div className="text-[11px] text-muted-foreground">
                              Delete all, then add
                            </div>
                          </button>
                        </div>

                        {/* Dedupe (append only) */}
                        {existingMode === "append" && (
                          <div className="space-y-2 rounded-md border border-border p-3">
                            <div className="flex items-center justify-between">
                              <Label
                                htmlFor="dedupe-switch"
                                className="text-sm cursor-pointer"
                              >
                                Check for duplicates
                              </Label>
                              <Switch
                                id="dedupe-switch"
                                checked={dedupeEnabled}
                                onCheckedChange={setDedupeEnabled}
                                disabled={identifierOptions.length === 0}
                              />
                            </div>

                            {identifierOptions.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No shared column to match on — duplicate
                                checking is unavailable for this table.
                              </p>
                            ) : dedupeEnabled ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">
                                    Match on column
                                  </Label>
                                  <Select
                                    value={identifierField}
                                    onValueChange={setIdentifierField}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {identifierOptions.map((m) => (
                                        <SelectItem
                                          key={m.field.field_name}
                                          value={m.field.field_name}
                                        >
                                          {m.field.display_name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">
                                    When matched
                                  </Label>
                                  <Select
                                    value={dedupeAction}
                                    onValueChange={(v) =>
                                      setDedupeAction(v as DuplicateAction)
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="skip">
                                        Skip incoming row
                                      </SelectItem>
                                      <SelectItem value="update">
                                        Update existing row
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Off — every row is added, even if it duplicates
                                an existing one.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter className="flex items-center gap-2 mt-4">
              <Button
                variant="outline"
                onClick={onClose}
                className="text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-border"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handlePrimary}
                disabled={primaryDisabled}
                className={cn(
                  "text-white disabled:bg-gray-400 disabled:cursor-not-allowed",
                  useExisting && existingMode === "replace"
                    ? "bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                    : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800",
                )}
              >
                {primaryLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Replace confirmation */}
      <ConfirmDialog
        open={confirmReplaceOpen}
        onOpenChange={(open) => {
          if (!isLoading) setConfirmReplaceOpen(open);
        }}
        title="Replace table contents"
        description={
          <>
            This permanently deletes all <b>{selectedTable?.row_count ?? 0}</b>{" "}
            existing row
            {selectedTable?.row_count === 1 ? "" : "s"} in{" "}
            <b>{selectedTable?.table_name}</b> and replaces them with your{" "}
            <b>{rowCount}</b> row{rowCount === 1 ? "" : "s"}. This cannot be
            undone.
          </>
        }
        confirmLabel="Replace"
        variant="destructive"
        busy={isLoading}
        onConfirm={handleReplace}
      />

      {/* Fullscreen loader owns the screen while saving */}
      <MultiStepLoader
        loadingStates={getLoadingStates(rowCount)}
        loading={isLoading}
        duration={600}
        loop={false}
      />
    </>
  );
};

export default SaveTableModal;

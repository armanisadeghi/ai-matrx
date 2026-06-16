"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ExternalLink, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/utils/supabase/client";
import { getTableDetails } from "@/utils/user-table-utls/table-utils";
import type { TableField } from "@/utils/user-table-utls/table-utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { autoMapColumns, SKIP } from "@/features/data-tables/reconcile";
import { appendToTable } from "@/features/data-tables/save-to-table";

interface UserTableSummary {
  id: string;
  table_name: string;
  description: string;
  row_count: number;
  field_count: number;
}

interface AppendToTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-parsed row objects to append. */
  rows: Record<string, unknown>[];
  /** Column order from the source JSON (union of keys). */
  columns: string[];
}

/** Compact sample preview: first non-null value for a column, stringified. */
function sampleFor(
  rows: Record<string, unknown>[],
  col: string,
  max = 40,
): string {
  for (const row of rows) {
    const v = row[col];
    if (v === null || v === undefined || v === "") continue;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }
  return "—";
}

export const AppendToTableDialog: React.FC<AppendToTableDialogProps> = ({
  open,
  onOpenChange,
  rows,
  columns,
}) => {
  const dispatch = useAppDispatch();

  // Step 1 — table list
  const [tables, setTables] = useState<UserTableSummary[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // Step 2 — selected table fields
  const [fields, setFields] = useState<TableField[] | null>(null);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  // Step 3 — column mapping
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Step 4 — insert
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load tables on open. Reset state when the dialog is reopened.
  useEffect(() => {
    if (!open) {
      setSelectedTableId(null);
      setFields(null);
      setMapping({});
      setFieldsError(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setTablesLoading(true);
      setTablesError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc("get_user_tables");
        if (rpcError) throw rpcError;
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
  }, [open]);

  // Load the chosen table's fields whenever the selection changes.
  useEffect(() => {
    if (!selectedTableId) {
      setFields(null);
      setMapping({});
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
        if (!cancelled) {
          setFields(result.fields);
          setMapping(autoMapColumns(columns, result.fields));
        }
      } catch (err) {
        if (!cancelled) {
          setFieldsError(
            err instanceof Error ? err.message : "Failed to load fields",
          );
        }
      } finally {
        if (!cancelled) setFieldsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTableId, columns]);

  const updateMapping = (jsonCol: string, target: string) => {
    setMapping((prev) => ({ ...prev, [jsonCol]: target }));
  };

  const mappedCount = useMemo(
    () => Object.values(mapping).filter((v) => v !== SKIP).length,
    [mapping],
  );

  const unmappedCount = columns.length - mappedCount;

  const handleSubmit = async () => {
    if (!selectedTableId) {
      setError("Select a table to append to");
      return;
    }
    if (mappedCount === 0) {
      setError("Map at least one column to insert rows");
      return;
    }

    setSubmitting(true);
    setError(null);

    // One atomic `udt_bulk_write` instead of N per-row round-trips. The shared
    // engine filters SKIP-mapped columns and any empty payloads. This dialog
    // does not create new columns (unmapped JSON columns are skipped), so
    // `newColumns` stays empty.
    const result = await appendToTable({
      tableId: selectedTableId,
      rows,
      mapping,
      newColumns: [],
    });

    if (!result.success) {
      setError(result.error ?? "Failed to append rows");
      setSubmitting(false);
      return;
    }

    const target = tables.find((t) => t.id === selectedTableId);
    toast.success(
      `Appended ${result.inserted} row${result.inserted === 1 ? "" : "s"} to "${target?.table_name ?? "table"}"` +
        (result.failed > 0 ? ` (${result.failed} failed)` : ""),
      {
        action: {
          label: "Open",
          onClick: () => {
            dispatch(
              openOverlay({
                overlayId: "quickDataWindow",
                data: { selectedTable: selectedTableId },
              }),
            );
          },
        },
      },
    );

    dispatch(
      openOverlay({
        overlayId: "quickDataWindow",
        data: { selectedTable: selectedTableId },
      }),
    );

    setSubmitting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Append rows to existing table</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2">
          {error && (
            <div className="bg-red-50 dark:bg-red-950 p-3 rounded-md text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Table picker */}
          <div className="space-y-1.5">
            <Label htmlFor="append-target-table">Target table</Label>
            {tablesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading tables…
              </div>
            ) : tablesError ? (
              <div className="text-sm text-red-500">{tablesError}</div>
            ) : tables.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                You don't have any data tables yet. Use "Save as new table"
                instead.
              </div>
            ) : (
              <Select
                value={selectedTableId ?? ""}
                onValueChange={(v) => setSelectedTableId(v || null)}
              >
                <SelectTrigger id="append-target-table">
                  <SelectValue placeholder="Pick a table…" />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-baseline gap-2">
                        <span>{t.table_name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {t.row_count} row{t.row_count === 1 ? "" : "s"} ·{" "}
                          {t.field_count} col{t.field_count === 1 ? "" : "s"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Column mapping */}
          {selectedTableId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Column mapping</Label>
                <div className="text-xs text-muted-foreground">
                  {mappedCount} of {columns.length} mapped
                  {unmappedCount > 0 && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      · {unmappedCount} skipped
                    </span>
                  )}
                </div>
              </div>

              {fieldsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading fields…
                </div>
              ) : fieldsError ? (
                <div className="text-sm text-red-500">{fieldsError}</div>
              ) : fields ? (
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs">
                      <tr>
                        <th className="px-2 py-1.5 text-left">JSON column</th>
                        <th className="px-2 py-1.5 text-left">Sample</th>
                        <th className="px-2 py-1.5 text-center w-8"></th>
                        <th className="px-2 py-1.5 text-left">Target field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((col) => {
                        const target = mapping[col] ?? SKIP;
                        const isSkip = target === SKIP;
                        return (
                          <tr
                            key={col}
                            className="border-t border-border/40 align-middle"
                          >
                            <td className="px-2 py-1.5 font-mono text-xs">
                              {col}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-muted-foreground truncate max-w-[160px]">
                              {sampleFor(rows, col)}
                            </td>
                            <td className="px-2 py-1.5 text-center text-muted-foreground">
                              <ArrowRight className="h-3 w-3 mx-auto" />
                            </td>
                            <td className="px-2 py-1.5">
                              <Select
                                value={target}
                                onValueChange={(v) => updateMapping(col, v)}
                              >
                                <SelectTrigger
                                  className={
                                    isSkip
                                      ? "h-7 text-xs text-muted-foreground"
                                      : "h-7 text-xs"
                                  }
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={SKIP}>
                                    <span className="text-muted-foreground">
                                      Skip this column
                                    </span>
                                  </SelectItem>
                                  {fields.map((f) => (
                                    <SelectItem
                                      key={f.field_name}
                                      value={f.field_name}
                                    >
                                      <div className="flex items-baseline gap-2">
                                        <span>{f.display_name}</span>
                                        <span className="text-[10px] text-muted-foreground font-mono">
                                          {f.data_type}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {unmappedCount > 0 && fields && (
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {unmappedCount} JSON column{unmappedCount === 1 ? "" : "s"}{" "}
                    will be skipped (no target selected). Adjust above if you
                    meant to include them.
                  </span>
                </div>
              )}
            </div>
          )}

          {selectedTableId && fields && (
            <div className="text-xs text-muted-foreground">
              About to append {rows.length} row{rows.length === 1 ? "" : "s"}.
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !selectedTableId ||
              !fields ||
              fieldsLoading ||
              mappedCount === 0
            }
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Appending…
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 mr-2" />
                Append &amp; open
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AppendToTableDialog;

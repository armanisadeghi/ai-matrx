"use client";

import {
  effectiveRowLabel,
  rowLabelOrFallback,
  type RowLabelConfig,
} from "@/features/data-tables/row-label";
import React, { useState, useEffect, useCallback } from "react";
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
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { GripVertical, ArrowUp, ArrowDown, Save, X } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import {
  unwrapGetUserTableDataPaginatedRows,
  unwrapUserTableMutation,
} from "@/utils/user-tables-rpc";
import type { TableField } from "@/utils/user-table-utls/table-utils";
import {
  getTablePage,
  isRecordStoreTable,
  setRowOrdering,
} from "@/features/data-tables/service";
import { isServiceFailure } from "@/features/data-tables/types";
import { toast } from "@/components/ui/use-toast";

interface RowOrderingModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  tableInfo: any;
  /**
   * The table's columns in `field_order`. Required — the row label is chosen
   * from the SCHEMA, never from a row's own JSONB key order (see below).
   */
  fields: TableField[];
  onSuccess: () => void;
}

interface RowItem {
  id: string;
  data: Record<string, unknown>;
  originalIndex: number;
}

/**
 * Which value labels each row in the reorder list.
 *
 * THE BUG THIS REPLACES (v1): the old code did `Object.keys(row.data)` and
 * took the first string value — PER ROW. Postgres does not preserve jsonb key
 * insertion order (it sorts by key length then bytes), so "first key" had
 * nothing to do with the user's column order, and because the choice was made
 * inside the row loop, different rows could label themselves with different
 * columns. That is the "it's picking a random column" symptom.
 *
 * THE BUG THIS REPLACES (v2): a later fix picked one SCHEMA column correctly,
 * but reimplemented its own field-only resolver instead of calling
 * `effectiveRowLabel`/`rowLabelText` from `features/data-tables/row-label.ts`
 * — the ONE place every other row-naming surface (references, copies,
 * the column-header key marker) reads from. A table whose row label is a
 * merged/formula column (`{Country} & " — " & {Capital}`) showed this dialog
 * labeling every row by the raw first column instead, silently disagreeing
 * with the "Get Reference" text and the header key marker for the same row.
 *
 * Now: the DEFAULT is the table's actual row label (`effectiveRowLabel`,
 * field or formula, from `table.metadata.row_label`) — the same config every
 * other consumer uses. A user may still explicitly override the ordering
 * list's display column (useful when the row label itself is unhelpful for
 * a quick visual scan, e.g. a long formula) via the sentinel below; that
 * override is a single field and is persisted on `row_ordering_config`.
 */
const DEFAULT_LABEL_OPTION = "__row_label_default__";

function resolveSelectedLabelConfig(
  fields: TableField[],
  tableMetadata: unknown,
  selected: string,
): RowLabelConfig | null {
  if (selected !== DEFAULT_LABEL_OPTION) {
    const match = fields.some((f) => f.field_name === selected);
    if (match) return { kind: "field", field: selected };
  }
  return effectiveRowLabel(tableMetadata, fields);
}

export default function RowOrderingModal({
  isOpen,
  onClose,
  tableId,
  tableInfo,
  fields,
  onSuccess,
}: RowOrderingModalProps) {
  const [rows, setRows] = useState<RowItem[]>([]);
  // UI selection for "Label rows by": either the sentinel (use the table's
  // actual row label — field or formula) or an explicit field_name override.
  const [labelSelection, setLabelSelection] = useState<string>(DEFAULT_LABEL_OPTION);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Resolve the label selection whenever the modal opens or the schema changes.
  useEffect(() => {
    if (!isOpen) return;
    // An explicit, still-valid ordering override wins; otherwise default to
    // the table's actual row label (which may be a merged/formula label).
    const saved = tableInfo?.row_ordering_config?.label_field;
    const savedStillValid = !!saved && fields.some((f) => f.field_name === saved);
    setLabelSelection(savedStillValid ? saved! : DEFAULT_LABEL_OPTION);
  }, [isOpen, fields, tableInfo?.row_ordering_config?.label_field]);

  const labelConfig = resolveSelectedLabelConfig(fields, tableInfo?.metadata, labelSelection);

  const loadAllRows = useCallback(async () => {
    setLoading(true);
    try {
      // Get all rows without pagination. v2 is the same RPC the grid itself
      // reads through — the v1 variant this used to call can disagree with the
      // grid about which rows exist.
      // A record-store table reads through the data seam (lane GRID-PORT): the store's
      // rows, never the older door, which holds only the archived copy the move left.
      let rowList: any[];
      if (isRecordStoreTable(tableId)) {
        const page = await getTablePage({ tableId, limit: 10000, offset: 0 });
        if (isServiceFailure(page)) throw new Error(page.error);
        rowList = page.data.rows;
      } else {
        const { data: allData, error } = await supabase.rpc(
          "get_user_table_data_paginated_v2",
          {
            p_table_id: tableId,
            p_limit: 10000, // Large limit to get all rows
            p_offset: 0,
            p_sort_field: undefined,
            p_sort_direction: "asc",
            p_search_term: undefined,
          },
        );

        if (error) throw error;
        rowList = unwrapGetUserTableDataPaginatedRows(allData ?? null);
      }

      // Keep the raw row data — the label is derived at render time from the
      // schema-resolved label column, so switching columns needs no refetch.
      const rowItems: RowItem[] = rowList.map((row: any, index: number) => ({
        id: row.id,
        data: (row.data ?? {}) as Record<string, unknown>,
        originalIndex: index,
      }));

      // Apply existing row ordering if it exists
      if (
        tableInfo?.row_ordering_config?.enabled &&
        tableInfo.row_ordering_config.order
      ) {
        const orderConfig = tableInfo.row_ordering_config.order;
        rowItems.sort((a, b) => {
          const aIndex = orderConfig.indexOf(a.id);
          const bIndex = orderConfig.indexOf(b.id);

          if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
          }
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;
          return a.originalIndex - b.originalIndex;
        });
      }

      setRows(rowItems);
      setHasChanges(false);
    } catch (err) {
      console.error("Error loading rows:", err);
    } finally {
      setLoading(false);
    }
  }, [tableId, tableInfo?.row_ordering_config]);

  // Load all rows when modal opens
  useEffect(() => {
    if (isOpen && tableId) {
      void loadAllRows();
    }
  }, [isOpen, tableId, loadAllRows]);

  /**
   * The row's actual row label (field or formula) — the same value shown by
   * "Get Reference", the header key marker, and everywhere else a row is
   * named. `rowLabelOrFallback` never throws and never shows a blank row.
   */
  const labelFor = (row: RowItem): string => {
    if (!labelConfig) return "(no columns)";
    const text = rowLabelOrFallback({ id: row.id, data: row.data }, fields, labelConfig);
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  };

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  // Handle drag enter
  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  // Handle drag leave
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverIndex(null);
    }
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceIndex =
      parseInt(e.dataTransfer.getData("text/plain")) || draggedIndex;

    if (sourceIndex === null || sourceIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder the rows - when dropping on a row, place the dragged item above it
    const newRows = [...rows];
    const [draggedItem] = newRows.splice(sourceIndex, 1);

    // Adjust target index if we removed an item before it
    const adjustedTargetIndex =
      sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    newRows.splice(adjustedTargetIndex, 0, draggedItem);

    setRows(newRows);
    setDraggedIndex(null);
    setDragOverIndex(null);
    setHasChanges(true);
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Move row up/down
  const moveRow = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rows.length) return;

    const newRows = [...rows];
    [newRows[index], newRows[newIndex]] = [newRows[newIndex], newRows[index]];

    setRows(newRows);
    setHasChanges(true);
  };

  // Save the new order
  const handleSave = async () => {
    setSaving(true);
    try {
      const newOrder = rows.map((row) => row.id);

      if (isRecordStoreTable(tableId)) {
        // The store keeps the order on the Table's hand-ordered view (G13, through the seam).
        const saved = await setRowOrdering({ tableId, enabled: true, order: newOrder });
        if (isServiceFailure(saved)) {
          toast({ title: "The row order was not saved", description: saved.error, variant: "destructive" });
          return;
        }
        setHasChanges(false);
        onSuccess();
        onClose();
        return;
      }

      const { data, error } = await supabase.rpc(
        "update_user_table_row_ordering",
        {
          p_table_id: tableId,
          p_enabled: true,
          p_order: newOrder,
          // Persist an explicit override alongside the order so the next open
          // shows the same column instead of re-resolving; the default
          // sentinel persists nothing, so the next open re-reads the table's
          // actual (possibly changed) row label.
          ...(labelSelection !== DEFAULT_LABEL_OPTION
            ? { p_label_field: labelSelection }
            : {}),
        },
      );

      if (error) throw error;
      unwrapUserTableMutation(data ?? null);

      setHasChanges(false);
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error saving row order:", err);
    } finally {
      setSaving(false);
    }
  };

  // Handle close with unsaved changes
  const handleClose = async () => {
    if (hasChanges) {
      const ok = await confirmDialog({
        title: "Discard unsaved changes?",
        description:
          "You have unsaved row-order changes. Closing will lose them.",
        confirmLabel: "Discard",
        variant: "destructive",
      });
      if (ok) {
        setHasChanges(false);
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] h-[95dvh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <GripVertical className="h-5 w-5" />
            Reorder Rows
            {hasChanges && (
              <span className="text-orange-500 text-sm">• Unsaved changes</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Which column labels each row. Without this the dialog has to guess,
            and any guess is wrong for someone — a table whose first column is
            an id shows a list of ids. */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">
            Label rows by
          </Label>
          <Select
            value={labelSelection}
            onValueChange={(v) => setLabelSelection(v)}
          >
            <SelectTrigger className="h-7 w-56 text-xs">
              <SelectValue placeholder="Choose a column" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_LABEL_OPTION}>Row label (default)</SelectItem>
              {[...fields]
                .sort((a, b) => a.field_order - b.field_order)
                .map((f) => (
                  <SelectItem key={f.id} value={f.field_name}>
                    {f.display_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-muted-foreground">Loading rows...</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-muted-foreground">No rows found</div>
            </div>
          ) : (
            <div className="space-y-0.5 p-1">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  className={`
                     flex items-center gap-2 p-2 rounded border transition-all
                     ${draggedIndex === index ? "opacity-50" : ""}
                     ${dragOverIndex === index ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600" : "bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800"}
                     hover:bg-gray-50 dark:hover:bg-gray-900 cursor-move
                   `}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                >
                  {/* Drag handle */}
                  <div className="flex-shrink-0">
                    <GripVertical className="h-3 w-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                  </div>

                  {/* Row number */}
                  <div className="flex-shrink-0 w-6 text-xs text-muted-foreground font-mono">
                    {index + 1}
                  </div>

                  {/* Row content */}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs">{labelFor(row)}</div>
                  </div>

                  {/* Move buttons */}
                  <div className="flex-shrink-0 flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => moveRow(index, "up")}
                      disabled={index === 0}
                      title="Move up"
                    >
                      <ArrowUp className="h-2.5 w-2.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => moveRow(index, "down")}
                      disabled={index === rows.length - 1}
                      title="Move down"
                    >
                      <ArrowDown className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {rows.length} rows • Drag to reorder or use arrow buttons
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={saving}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Order"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

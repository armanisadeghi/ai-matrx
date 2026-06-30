"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GripVertical, ArrowUp, ArrowDown, Save, X } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import {
  unwrapGetUserTableDataPaginatedRows,
  unwrapUserTableMutation,
} from "@/utils/user-tables-rpc";

interface RowOrderingModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  tableInfo: any;
  onSuccess: () => void;
}

interface RowItem {
  id: string;
  displayText: string;
  originalIndex: number;
}

export default function RowOrderingModal({
  isOpen,
  onClose,
  tableId,
  tableInfo,
  onSuccess,
}: RowOrderingModalProps) {
  const [rows, setRows] = useState<RowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load all rows when modal opens
  useEffect(() => {
    if (isOpen && tableId) {
      loadAllRows();
    }
  }, [isOpen, tableId]);

  const loadAllRows = async () => {
    setLoading(true);
    try {
      // Get all rows without pagination
      const { data: allData, error } = await supabase.rpc(
        "get_user_table_data_paginated",
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
      const rowList = unwrapGetUserTableDataPaginatedRows(allData ?? null);

      // Convert rows to simple display format
      const rowItems: RowItem[] = rowList.map((row: any, index: number) => {
        // Find the best field to display (first string field or first field)
        const fields = Object.keys(row.data);
        let displayField =
          fields.find(
            (field) => row.data[field] && typeof row.data[field] === "string",
          ) || fields[0];

        let displayText = row.data[displayField];
        if (typeof displayText === "object") {
          displayText = JSON.stringify(displayText);
        } else if (displayText === null || displayText === undefined) {
          displayText = "(empty)";
        } else {
          displayText = String(displayText);
        }

        // Truncate long text
        if (displayText.length > 80) {
          displayText = displayText.substring(0, 77) + "...";
        }

        return {
          id: row.id,
          displayText,
          originalIndex: index,
        };
      });

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

      const { data, error } = await supabase.rpc(
        "update_user_table_row_ordering",
        {
          p_table_id: tableId,
          p_enabled: true,
          p_order: newOrder,
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
  const handleClose = () => {
    if (hasChanges) {
      if (
        confirm("You have unsaved changes. Are you sure you want to close?")
      ) {
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
                    <div className="truncate text-xs">{row.displayText}</div>
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

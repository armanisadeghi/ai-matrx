"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/utils/supabase/client";
import {
  createTable,
  addRow,
  VALID_DATA_TYPES,
} from "@/utils/user-table-utls/table-utils";
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";
import {
  analyzeData,
  type DetectedField,
} from "@/utils/user-table-utls/type-inference";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

interface JsonToTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-parsed row objects to import. */
  rows: Record<string, unknown>[];
  /** Column order to honor (union of keys). */
  columns: string[];
  /** Optional suggested table name (e.g. derived from a wrapper key). */
  suggestedName?: string;
}

/**
 * Lightweight save-as-data-table dialog for the JsonBlock. Shares the
 * underlying `createTable` / `addRow` infra used by ImportTableModal but
 * skips the file-upload / paste step since callers already have rows.
 */
export const JsonToTableDialog: React.FC<JsonToTableDialogProps> = ({
  open,
  onOpenChange,
  rows,
  columns,
  suggestedName,
}) => {
  const dispatch = useAppDispatch();

  const [tableName, setTableName] = useState(suggestedName ?? "");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<DetectedField[]>(() =>
    analyzeData(rows, { columns }),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recompute inferred fields when the input changes (e.g. dialog reopened
  // with new rows). Keep field edits if the column set is unchanged.
  useEffect(() => {
    setFields(analyzeData(rows, { columns }));
  }, [rows, columns]);

  useEffect(() => {
    if (suggestedName !== undefined) setTableName(suggestedName);
  }, [suggestedName]);

  const updateFieldType = (index: number, type: string) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], data_type: type };
      return next;
    });
  };

  const toggleIncluded = (index: number) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], included: !next[index].included };
      return next;
    });
  };

  const updateDisplayName = (index: number, displayName: string) => {
    setFields((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        display_name: displayName,
        field_name: sanitizeFieldName(displayName),
      };
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!tableName.trim()) {
      setError("Please enter a table name");
      return;
    }
    const included = fields.filter((f) => f.included);
    if (included.length === 0) {
      setError("Select at least one column to include");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const create = await createTable(supabase, {
        tableName: tableName.trim(),
        description:
          description.trim() ||
          `Imported from JSON (${rows.length} rows, ${included.length} columns)`,
        isPublic: false,
        authenticatedRead: false,
        fields: included.map((f) => ({
          field_name: f.field_name,
          display_name: f.display_name,
          data_type: f.data_type,
          field_order: f.field_order,
          is_required: f.is_required,
        })),
      });

      if (!create.success || !create.tableId) {
        throw new Error(create.error || "Failed to create table");
      }

      // Map each row by sanitized column name (matches how create-table
      // sanitized the field_name above).
      const fieldByOriginalKey = new Map(
        included.map((f) => [f.display_name, f.field_name]),
      );

      // Insert sequentially. The number of chat-block JSON imports is
      // small in practice; parallelizing complicates error reporting.
      let inserted = 0;
      let failed = 0;
      for (const row of rows) {
        const payload: Record<string, unknown> = {};
        for (const [origKey, sanitizedKey] of fieldByOriginalKey.entries()) {
          if (origKey in row) {
            payload[sanitizedKey] = row[origKey];
          }
        }
        const res = await addRow(supabase, {
          tableId: create.tableId,
          data: payload,
        });
        if (res.success) inserted++;
        else failed++;
      }

      toast.success(
        `Created "${tableName.trim()}" with ${inserted} row${inserted === 1 ? "" : "s"}` +
          (failed > 0 ? ` (${failed} failed)` : ""),
        {
          action: {
            label: "Open",
            onClick: () => {
              dispatch(
                openOverlay({
                  overlayId: "quickDataWindow",
                  data: { selectedTable: create.tableId },
                }),
              );
            },
          },
        },
      );

      // Auto-open the table in the QuickData window for instant feedback.
      dispatch(
        openOverlay({
          overlayId: "quickDataWindow",
          data: { selectedTable: create.tableId },
        }),
      );

      onOpenChange(false);
    } catch (err) {
      console.error("Save-as-table failed:", err);
      setError(
        err instanceof Error ? err.message : "Unexpected error saving table",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Save JSON as Data Table</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2">
          {error && (
            <div className="bg-red-50 dark:bg-red-950 p-3 rounded-md text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="json-table-name">Table name</Label>
              <Input
                id="json-table-name"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="e.g. My Imported Data"
                style={{ fontSize: "16px" }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="json-table-desc">Description (optional)</Label>
              <Textarea
                id="json-table-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">
                Columns ({fields.length} detected, {rows.length} row
                {rows.length === 1 ? "" : "s"})
              </Label>
              <div className="text-xs text-muted-foreground">
                Edit names, types, or exclude
              </div>
            </div>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="px-2 py-1.5 text-left w-10">Use</th>
                    <th className="px-2 py-1.5 text-left">Display name</th>
                    <th className="px-2 py-1.5 text-left">Field name</th>
                    <th className="px-2 py-1.5 text-left w-32">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, idx) => (
                    <tr
                      key={field.field_order}
                      className="border-t border-border/40"
                    >
                      <td className="px-2 py-1.5">
                        <Checkbox
                          checked={field.included}
                          onCheckedChange={() => toggleIncluded(idx)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={field.display_name}
                          onChange={(e) =>
                            updateDisplayName(idx, e.target.value)
                          }
                          className="h-7 text-xs"
                          style={{ fontSize: "16px" }}
                          disabled={!field.included}
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">
                        {field.field_name}
                      </td>
                      <td className="px-2 py-1.5">
                        <Select
                          value={field.data_type}
                          onValueChange={(v) => updateFieldType(idx, v)}
                          disabled={!field.included}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VALID_DATA_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !tableName.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <ExternalLink className="w-4 h-4 mr-2" />
                Save & open
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default JsonToTableDialog;

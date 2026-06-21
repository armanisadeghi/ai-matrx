"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Copy } from "lucide-react";
import { buildBookmarkReferenceFence } from "@/features/matrx-envelope/bookmarkToReference";

interface TableField {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
  is_required: boolean;
}

interface TableInfo {
  table_name: string;
  description?: string;
}

interface TableReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  tableInfo: TableInfo | null;
  rowId: string | null;
  rowData: any;
  fields: TableField[];
}

export default function TableReferenceModal({
  isOpen,
  onClose,
  tableId,
  tableInfo,
  rowId,
  rowData,
  fields,
}: TableReferenceModalProps) {
  const [copiedReference, setCopiedReference] = useState<string | null>(null);

  // Copy reference to clipboard
  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedReference(type);
      setTimeout(() => setCopiedReference(null), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  const tableName = tableInfo?.table_name || "Unknown Table";

  // Canonical ```matrx``` reference fence for the entire table.
  const generateTableReference = () =>
    buildBookmarkReferenceFence({
      type: "full_table",
      table_id: tableId,
      table_name: tableName,
    });

  // Canonical ```matrx``` reference fence for a single row.
  const generateRowReference = (rowId: string) =>
    buildBookmarkReferenceFence({
      type: "table_row",
      table_id: tableId,
      table_name: tableName,
      row_id: rowId,
    });

  // Canonical ```matrx``` reference fence for a single cell.
  const generateCellReference = (
    rowId: string,
    fieldName: string,
    fieldDisplayName: string,
  ) =>
    buildBookmarkReferenceFence({
      type: "table_cell",
      table_id: tableId,
      table_name: tableName,
      row_id: rowId,
      column_name: fieldName,
      column_display_name: fieldDisplayName,
    });

  if (!rowId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[40vw] max-h-[90dvh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Get Table/Row/Cell Reference</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto max-h-[calc(90dvh-120px)] pr-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Create references to use this data in workflows. Choose between
            table, row, or specific cell references.
          </p>

          {/* Table Reference */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Full Table Reference
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(generateTableReference(), "table")
                }
                className="flex items-center space-x-1"
              >
                <Copy className="h-3 w-3" />
                <span>{copiedReference === "table" ? "Copied!" : "Copy"}</span>
              </Button>
            </div>
            <Textarea
              value={generateTableReference()}
              readOnly
              rows={7}
              className="text-xs font-mono bg-gray-50 dark:bg-gray-900"
            />
          </div>

          {/* Row Reference */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Full Row Reference</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(generateRowReference(rowId), "row")
                }
                className="flex items-center space-x-1"
              >
                <Copy className="h-3 w-3" />
                <span>{copiedReference === "row" ? "Copied!" : "Copy"}</span>
              </Button>
            </div>
            <Textarea
              value={generateRowReference(rowId)}
              readOnly
              rows={7}
              className="text-xs font-mono bg-gray-50 dark:bg-gray-900"
            />
          </div>

          {/* Cell References */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Individual Cell References
            </Label>
            <div className="grid gap-2 max-h-[400px] overflow-y-auto border rounded-md p-3">
              {fields.map((field) => (
                <div
                  key={field.id}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <div className="flex-1">
                    <span className="text-sm font-medium">
                      {field.display_name}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      ({field.field_name})
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(
                        generateCellReference(
                          rowId,
                          field.field_name,
                          field.display_name,
                        ),
                        `cell-${field.field_name}`,
                      )
                    }
                    className="flex items-center space-x-1"
                  >
                    <Copy className="h-3 w-3" />
                    <span>
                      {copiedReference === `cell-${field.field_name}`
                        ? "Copied!"
                        : "Copy"}
                    </span>
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Usage Instructions */}
          <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-md">
            <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
              How to use
            </h4>
            <ul className="text-xs text-blue-600 dark:text-blue-300 space-y-1">
              <li>
                • <strong>Table references</strong> bring all data from the
                table into context
              </li>
              <li>
                • <strong>Row references</strong> bring all field values for a
                specific row
              </li>
              <li>
                • <strong>Cell references</strong> bring a specific field value
                from a specific row
              </li>
              <li>
                • Copy a reference and paste it into chat — it resolves to a
                live reference chip
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

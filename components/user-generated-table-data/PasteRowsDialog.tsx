"use client";

import { useState } from "react";
import Papa from "papaparse";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";
import { bulkWrite } from "@/features/data-tables/service";
import {
  isServiceFailure,
  type BulkInsertOp,
} from "@/features/data-tables/types";

interface PasteRowsField {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  is_required: boolean;
}

interface PasteRowsDialogProps {
  tableId: string;
  fields: PasteRowsField[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ParsedRow = Record<string, unknown>;

// Map of incoming paste-header → matched dataset field (or null when skipped).
// Built once at parse time so stage 2 can render preview + column mapping AND
// reuse the same resolution to build the bulkWrite payload.
interface PasteColumnMapping {
  pasteHeader: string;
  matchedField: PasteRowsField | null;
}

export default function PasteRowsDialog({
  tableId,
  fields,
  isOpen,
  onClose,
  onSuccess,
}: PasteRowsDialogProps) {
  const [stage, setStage] = useState<"paste" | "preview">("paste");
  const [pasteData, setPasteData] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [columnMappings, setColumnMappings] = useState<PasteColumnMapping[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const resetAll = () => {
    setStage("paste");
    setPasteData("");
    setParseError(null);
    setParsedRows([]);
    setColumnMappings([]);
    setSubmitting(false);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleParse = () => {
    if (!pasteData.trim()) {
      setParseError("Please paste some data");
      return;
    }
    setParseError(null);

    Papa.parse<ParsedRow>(pasteData.trim(), {
      header: true,
      skipEmptyLines: true,
      delimiter: "", // auto-detect tab vs comma
      complete: (results) => {
        const rows = results.data;
        if (!rows || rows.length === 0) {
          setParseError("No valid rows found");
          return;
        }
        const headers = results.meta.fields ?? [];
        if (headers.length === 0) {
          setParseError("Could not detect a header row");
          return;
        }

        const mappings: PasteColumnMapping[] = headers.map((pasteHeader) => {
          const sanitized = sanitizeFieldName(pasteHeader);
          const matched =
            fields.find((f) => f.field_name === sanitized) ?? null;
          return { pasteHeader, matchedField: matched };
        });

        setParsedRows(rows);
        setColumnMappings(mappings);
        setStage("preview");
      },
      error: (err: Error) => {
        setParseError(`Error parsing data: ${err.message}`);
      },
    });
  };

  // Dataset columns that won't be filled by any paste column — surfaced in
  // stage 2 so the user can see what's going to be blank.
  const unmatchedDatasetFields = fields.filter(
    (f) =>
      !columnMappings.some(
        (m) => m.matchedField && m.matchedField.field_name === f.field_name,
      ),
  );

  const matchedCount = columnMappings.filter((m) => m.matchedField).length;

  const handleConfirm = async () => {
    if (parsedRows.length === 0) return;

    const operations: BulkInsertOp[] = parsedRows.map((row) => {
      const data: Record<string, unknown> = {};
      for (const mapping of columnMappings) {
        if (!mapping.matchedField) continue;
        const value = row[mapping.pasteHeader];
        data[mapping.matchedField.field_name] = value;
      }
      return { op: "insert", data };
    });

    try {
      setSubmitting(true);
      const result = await bulkWrite({ tableId, operations });
      if (isServiceFailure(result)) {
        toast({
          title: "Paste failed",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Rows pasted",
        description: `Pasted ${operations.length} row${operations.length === 1 ? "" : "s"}`,
        variant: "success",
      });
      onSuccess();
      handleClose();
    } catch (err) {
      toast({
        title: "Paste failed",
        description:
          err instanceof Error ? err.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90dvh] overflow-hidden flex flex-col bg-card">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {stage === "paste" ? "Paste Rows" : "Confirm Pasted Rows"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-4">
          {stage === "paste" ? (
            <div className="space-y-2">
              <Label htmlFor="pasteData">
                Paste from Excel, Google Sheets, or a CSV
              </Label>
              <Textarea
                id="pasteData"
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                placeholder={
                  "Name\tAge\tEmail\n" +
                  "John\t25\tjohn@example.com\n" +
                  "Jane\t30\tjane@example.com"
                }
                rows={12}
                className="font-mono text-sm"
              />
              {parseError && (
                <p className="text-sm text-red-500">{parseError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                The first row must be a header. Tab- and comma-separated values
                are both supported.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Column mapping summary */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Column mapping</Label>
                  <span className="text-xs text-muted-foreground">
                    {matchedCount} of {columnMappings.length} paste columns
                    matched
                  </span>
                </div>
                <div className="border border-border rounded-lg p-3 space-y-1 max-h-[180px] overflow-y-auto bg-card">
                  {columnMappings.map((m) => (
                    <div
                      key={m.pasteHeader}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="font-medium truncate min-w-[160px]">
                        {m.pasteHeader}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      {m.matchedField ? (
                        <span className="truncate">
                          {m.matchedField.display_name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">
                          (skipped — no matching column)
                        </span>
                      )}
                    </div>
                  ))}
                  {unmatchedDatasetFields.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <span className="italic min-w-[160px] truncate">
                        {f.display_name}
                      </span>
                      <span>—</span>
                      <span className="italic">
                        (unmatched dataset column — will be empty)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview of first 5 parsed rows */}
              <div className="space-y-2">
                <Label>Preview (first 5 rows)</Label>
                <div className="border border-border rounded-lg overflow-auto max-h-[260px] bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        {columnMappings.map((m) => (
                          <th
                            key={m.pasteHeader}
                            className="px-3 py-2 text-left font-medium text-xs"
                          >
                            {m.pasteHeader}
                            {!m.matchedField && (
                              <span className="ml-1 text-muted-foreground italic">
                                (skipped)
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-border">
                          {columnMappings.map((m) => {
                            const cell = row[m.pasteHeader];
                            const display =
                              cell === null || cell === undefined
                                ? ""
                                : String(cell);
                            return (
                              <td
                                key={m.pasteHeader}
                                className="px-3 py-2 text-xs truncate max-w-[200px]"
                              >
                                {display}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  {parsedRows.length} row{parsedRows.length === 1 ? "" : "s"}{" "}
                  ready to paste.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          {stage === "preview" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStage("paste")}
              disabled={submitting}
            >
              Back
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          {stage === "paste" ? (
            <Button
              type="button"
              onClick={handleParse}
              disabled={!pasteData.trim()}
            >
              Parse
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || matchedCount === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pasting...
                </>
              ) : (
                `Paste ${parsedRows.length} Row${parsedRows.length === 1 ? "" : "s"}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import {
  checkImportAgainstColumnRules,
  type ImportRuleCheck,
} from "@/features/data-tables/import-rule-check";
import { FieldRuleRefusal } from "@/features/data-tables/components/FieldRuleRefusal";

interface PasteRowsField {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  is_required: boolean;
  /**
   * The column's own rules and its declared format — read BEFORE the import, not
   * discovered from the store's refusal afterwards. Both arrive on the table
   * config row this dialog is already handed; until lane REFUSAL-SWEEP they were
   * simply not declared here, which is the whole reason the wizard never asked.
   */
  validation_rules?: unknown;
  metadata?: unknown;
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
  /**
   * Columns the person has taken out of this import, by dataset field name. The
   * refusal notice offers it: fixing a whole column of a file is often not worth
   * it, and leaving the column out is a real answer the wizard used to make
   * impossible (the mapping was automatic and unchangeable).
   */
  const [droppedFields, setDroppedFields] = useState<string[]>([]);

  const resetAll = () => {
    setStage("paste");
    setPasteData("");
    setParseError(null);
    setParsedRows([]);
    setColumnMappings([]);
    setDroppedFields([]);
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
        setDroppedFields([]);
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

  /**
   * 🚨 THE COLUMN'S RULES, ASKED BEFORE THE WRITE (lane REFUSAL-SWEEP, 2026-09-23).
   *
   * This dialog used to hand every mapped value straight to `bulkWrite` and let
   * the STORE answer — row by row, after the round trip, in an envelope that
   * reached the person as one destructive toast naming nothing. The same judge
   * every other surface uses now runs over the mapped rows HERE, and the
   * refusals are on screen, per column, before the import button does anything.
   */
  const activeColumns = columnMappings
    .filter(
      (m) =>
        m.matchedField !== null &&
        !droppedFields.includes(m.matchedField.field_name),
    )
    .map((m) => ({
      sourceHeader: m.pasteHeader,
      field: m.matchedField as PasteRowsField,
    }));

  const ruleCheck: ImportRuleCheck = checkImportAgainstColumnRules({
    rows: parsedRows,
    columns: activeColumns,
  });

  /**
   * A column whose rules could not be read has had NOTHING checked, so importing
   * it would be importing as if the column were unconstrained — which is exactly
   * the lie this lane exists to remove. It blocks its own import until the person
   * leaves it out; every other refusal only costs the rows that fail.
   */
  const uncheckedColumns = ruleCheck.verdicts.filter((v) => v.rulesUnreadable);
  const refusedRowIndexes = new Set(ruleCheck.failingRowIndexes);
  const importableRowCount =
    uncheckedColumns.length > 0 ? 0 : ruleCheck.passingRowCount;
  const importIsBlocked = activeColumns.length === 0 || importableRowCount === 0;

  const dropColumn = (fieldName: string) =>
    setDroppedFields((prev) =>
      prev.includes(fieldName) ? prev : [...prev, fieldName],
    );
  const restoreColumn = (fieldName: string) =>
    setDroppedFields((prev) => prev.filter((name) => name !== fieldName));

  const handleConfirm = async () => {
    if (parsedRows.length === 0) return;
    // Nothing is written while a column's rules are unread or unmet: the button
    // that gets here is only reachable once the refusals have been answered by
    // dropping the column or by accepting that the refused rows are left out.
    if (importIsBlocked) return;

    const operations: BulkInsertOp[] = parsedRows
      // THE REFUSED ROWS ARE LEFT OUT, EXPLICITLY. The person has read which
      // column refused them and how many there were; this is the choice they
      // made, not a silent drop.
      .filter((_row, index) => !refusedRowIndexes.has(index))
      .map((row) => {
        const data: Record<string, unknown> = {};
        for (const { sourceHeader, field } of activeColumns) {
          data[field.field_name] = row[sourceHeader];
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
      const leftOut = parsedRows.length - operations.length;
      toast({
        title: "Rows pasted",
        description:
          `Pasted ${operations.length} row${operations.length === 1 ? "" : "s"}` +
          (leftOut > 0
            ? `. ${leftOut} row${leftOut === 1 ? " was" : "s were"} left out because a column refused ${leftOut === 1 ? "its" : "their"} value.`
            : ""),
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
                        droppedFields.includes(m.matchedField.field_name) ? (
                          <span className="flex items-center gap-2 truncate">
                            <span className="truncate line-through text-muted-foreground">
                              {m.matchedField.display_name}
                            </span>
                            <button
                              type="button"
                              data-matrx-import-restore-column={
                                m.matchedField.field_name
                              }
                              className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted"
                              onClick={() =>
                                restoreColumn(
                                  (m.matchedField as PasteRowsField).field_name,
                                )
                              }
                            >
                              Put it back
                            </button>
                          </span>
                        ) : (
                          <span className="truncate">
                            {m.matchedField.display_name}
                          </span>
                        )
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

              {/*
                🚨 THE REFUSALS, BEFORE THE WRITE — never a report afterwards.
                One notice per refused column, through the ONE primitive
                (`columnRuleRefusal` → `<FieldRuleRefusal>`), so a value this
                wizard refuses and a value the grid refuses are the same object
                on screen. Each carries how many of the parsed rows fail it and
                the door out that costs nothing: leave the column out.
              */}
              {ruleCheck.verdicts.length > 0 && (
                <div className="space-y-2" data-matrx-import-refusals="">
                  <Label>
                    {ruleCheck.verdicts.length === 1
                      ? "1 column refuses what you pasted"
                      : `${ruleCheck.verdicts.length} columns refuse what you pasted`}
                  </Label>
                  <div className="space-y-3">
                    {ruleCheck.verdicts.map((verdict) => (
                      <div
                        key={verdict.fieldName}
                        className="space-y-1"
                        data-matrx-import-refusal={verdict.fieldName}
                      >
                        <FieldRuleRefusal refusal={verdict.refusal} />
                        <p className="text-xs text-muted-foreground">
                          {verdict.rulesUnreadable
                            ? `${verdict.fieldDisplayName} is mapped from "${verdict.sourceHeader}". Nothing has been checked against its rules, so it cannot be imported until you leave it out.`
                            : `${verdict.failingRowCount} of the ${verdict.checkedRowCount} row${verdict.checkedRowCount === 1 ? "" : "s"} you pasted fail this — they are mapped from "${verdict.sourceHeader}".`}
                        </p>
                        <button
                          type="button"
                          data-matrx-import-drop-column={verdict.fieldName}
                          className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted"
                          onClick={() => dropColumn(verdict.fieldName)}
                        >
                          Leave {verdict.fieldDisplayName} out of this import
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                  {ruleCheck.verdicts.length === 0
                    ? `${parsedRows.length} row${parsedRows.length === 1 ? "" : "s"} ready to paste.`
                    : `${importableRowCount} of ${parsedRows.length} row${parsedRows.length === 1 ? "" : "s"} pass every column's rules.`}
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
            /*
              🚨 A SCREEN NEVER LIES AND A BUTTON IS NEVER DEAD. When a column
              refuses everything, the button says what is true — that there is
              nothing left to import and why — rather than sitting there greyed
              out with its old label, or worse, importing rows the store is about
              to refuse one at a time.
            */
            <div className="flex flex-col items-end gap-1">
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={submitting || matchedCount === 0 || importIsBlocked}
                data-matrx-import-confirm=""
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Pasting...
                  </>
                ) : importIsBlocked ? (
                  "Nothing here can be imported yet"
                ) : ruleCheck.verdicts.length > 0 ? (
                  `Paste the ${importableRowCount} Row${importableRowCount === 1 ? "" : "s"} That Pass`
                ) : (
                  `Paste ${parsedRows.length} Row${parsedRows.length === 1 ? "" : "s"}`
                )}
              </Button>
              {importIsBlocked && !submitting && (
                <p
                  className="text-xs text-muted-foreground text-right max-w-[22rem]"
                  data-matrx-import-blocked-reason=""
                >
                  {activeColumns.length === 0
                    ? "Every column has been left out, so there is nothing to write. Put one back, or go back and paste again."
                    : uncheckedColumns.length > 0
                      ? `${uncheckedColumns.map((v) => v.fieldDisplayName).join(", ")} carries rules this screen could not read, so nothing was checked against them. Leave that column out and the rest can be imported.`
                      : "Every row you pasted breaks a column's rules. Fix them in the file and paste again, or leave the refusing column out."}
                </p>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState, useEffect } from "react";
import { upsertRow } from "@/features/data-tables/service";
import { isServiceFailure } from "@/features/data-tables/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import {
  CalendarIcon,
  Zap,
  ClipboardCopy,
  Download,
  CheckCircle,
  MoreHorizontal
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import {
  FormatAwareInput,
  formatHasOwnInput,
} from "@/features/data-tables/components/FormatAwareInput";
import { resolveFieldFormat } from "@/lib/field-formats/format";
import { withResolvedChoices } from "@/lib/field-formats/choices";
import type { FieldChoice } from "@/lib/field-formats/types";
import { isComputedColumn } from "@/features/data-tables/formulas";
import {
  describeValidationRules,
  parseValidationRules,
  validateCellValue,
} from "@/features/data-tables/validation";
import { columnRuleRefusal, type ColumnRuleRefusal } from "@/features/data-tables/validation-refusal";
import { FieldRuleRefusal } from "@/features/data-tables/components/FieldRuleRefusal";
import { ProTextarea } from "@/components/official/ProTextarea";

interface TableField {
  id: string;
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
  is_required: boolean;
  metadata?: Record<string, unknown> | null;
  /**
   * The column's validation rules, as the field row carries them. Optional
   * because the shape is declared locally here while the rows arrive from
   * `get_full_table`, which has always returned this column.
   */
  validation_rules?: unknown;
}

interface EditRowModalProps {
  tableId: string;
  rowId: string | null;
  rowData: Record<string, any> | null;
  fields: TableField[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cleanCellValue?: (text: string) => string;
  isCellValueDirty?: (text: string) => boolean;
  /**
   * THE WORDS EVERY `relation` CELL READS, keyed by machine field name —
   * `{ value: <the stored record id>, label: <the words> }`, exactly what the
   * grid is handed.
   *
   * It comes from the ONE resolver (`features/data-tables/relation-words` +
   * `-client`), resolved ONCE for the whole table by `UserTableViewer` and
   * passed down, so this form and the grid cell two clicks away cannot offer
   * different names or resolve a different set of ids. Folded into the column's
   * format below, which is the same seam the grid uses
   * (`withResolvedChoices`), so the ONE picker (`ChoiceInput`) serves both with
   * nothing added to it.
   *
   * Absent (an older caller, or a table with no relation column) is not a
   * failure: the picker then has no options and the cell falls to the amber
   * identifier rendering, never to a raw uuid.
   */
  relationChoices?: ReadonlyMap<string, FieldChoice[]>;
}

export default function EditRowModal({
  tableId,
  rowId,
  rowData: initialRowData,
  fields,
  isOpen,
  onClose,
  onSuccess,
  cleanCellValue,
  isCellValueDirty,
  relationChoices,
}: EditRowModalProps) {
  const [rowData, setRowData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * fieldName → why this value is refused. Inline and beside the input, never a
   * single sentence at the top of the form: a form that says "something is
   * wrong" without saying WHERE is a dead end on a table with twenty columns.
   */
  const [fieldErrors, setFieldErrors] = useState<Record<string, ColumnRuleRefusal>>({});

  // Initialize row data when modal opens
  useEffect(() => {
    if (isOpen && initialRowData) {
      setRowData(initialRowData);
    }
  }, [isOpen, initialRowData]);

  // Handle field value change
  const handleValueChange = (fieldName: string, value: any) => {
    setRowData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
    // Typing is the user answering the complaint — clear it as they do, rather
    // than leaving a stale red line under a field they have already fixed.
    setFieldErrors((prev) => {
      if (!(fieldName in prev)) return prev;
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  };

  // Handle HTML cleanup for a specific field
  const handleFieldCleanup = (fieldName: string) => {
    if (!cleanCellValue) return;

    const currentValue = rowData[fieldName];
    if (currentValue && typeof currentValue === "string") {
      const cleanedValue = cleanCellValue(currentValue);
      handleValueChange(fieldName, cleanedValue);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!rowId) {
      setError("No row selected for editing");
      return;
    }

    // Validate required fields
    const missingFields = fields
      .filter(
        (field) =>
          field.is_required &&
          !isComputedColumn(field) &&
          (rowData[field.field_name] === null ||
            rowData[field.field_name] === undefined),
      )
      .map((field) => field.display_name);

    if (missingFields.length > 0) {
      setError(`Please fill in required fields: ${missingFields.join(", ")}`);
      return;
    }

    // Column validation rules, checked before anything is sent. `unique` is
    // skipped here on purpose: this form holds one row, not the table, and a
    // uniqueness claim made without the other rows would be a guess.
    const nextErrors: Record<string, ColumnRuleRefusal> = {};
    for (const field of fields) {
      if (isComputedColumn(field)) continue;
      const verdict = validateCellValue({
        rules: parseValidationRules(field.validation_rules),
        dataType: field.data_type,
        format: resolveFieldFormat(field.data_type, field.metadata),
        value: rowData[field.field_name],
      });
      if (!verdict.ok) {
        // THE ONE REFUSAL SHAPE. The bare red sentence this used to be said what
        // was wrong and nothing about what to do, and it looked nothing like the
        // refusal the same person meets on the grid two clicks away.
        nextErrors[field.field_name] = columnRuleRefusal({
          fieldDisplayName: field.display_name,
          reason: verdict.reason,
          rules: parseValidationRules(field.validation_rules),
        });
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      // 🚨 THE REFUSAL HAS TO BE VISIBLE FROM THE BUTTON. The inline message
      // renders beside its own field, inside the scrolling list below — so on
      // any table with more than a handful of columns the offending field is
      // out of sight when Save is pressed, and the click reads as a dead
      // button: nothing moves, nothing says no (found on live review
      // 2026-09-15, where a refused 20-character Capital produced no visible
      // response at all). The summary goes in the same always-visible banner
      // the required-field refusal already uses, above the scroller; the
      // inline messages stay where the fixing actually happens.
      const broken = fields.filter((field) => nextErrors[field.field_name]);
      // 🚨 A NOTICE NEVER SAYS THE SAME THING TWICE (lane VALIDATION-REFUSAL,
      // 2026-09-23, measured on the modal at 375 wide). This banner used to repeat
      // the single refusal's whole sentence, which now also appears verbatim in the
      // notice beside the field — so a person read "Must be at most 8 characters
      // (this is 19)" twice, four lines apart. The banner's ONE job is to be visible
      // from the Save button and say WHERE to look; the notice below says what and
      // what to do.
      setError(
        broken.length === 1
          ? `${broken[0].display_name} needs fixing — the reason is beside it below.`
          : `These columns need fixing: ${broken
              .map((field) => field.display_name)
              .join(", ")}`,
      );
      return;
    }
    setFieldErrors({});

    try {
      setLoading(true);
      setError(null);

      // udt_upsert_row scopes by both table_id and row_id, fires the validation
      // and version triggers, and routes through the owner-or-editor permission
      // gate — replaces the legacy update_data_row_in_user_table RPC.
      const result = await upsertRow({ tableId, rowId, data: rowData });
      if (isServiceFailure(result)) {
        throw new Error(result.error);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error updating row:", err);
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  // Render different input based on data type
  const renderFieldInput = (field: TableField) => {
    const value = rowData[field.field_name];

    // A declared display format gets first refusal on the input; when it has
    // no opinion the storage-type switch below runs unchanged.
    // A formula column stores nothing and is computed from the row's other
    // cells; this form offers no input for it, and says why, so nobody types a
    // value that could never be kept.
    if (isComputedColumn(field)) {
      return (
        <p
          id={field.field_name}
          className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          Filled in by the table itself — calculated from this row, or stamped
          automatically — so there is nothing to type here.
        </p>
      );
    }

    // A `relation` column's options are the record ids on this table with the
    // words the store resolved for them. Folded in HERE, the same way the grid
    // folds them before handing a cell to `EditableCell`, so `FormatAwareInput`
    // and `ChoiceInput` need to know nothing about relations.
    const fieldFormat = withResolvedChoices(
      resolveFieldFormat(field.data_type, field.metadata),
      relationChoices?.get(field.field_name) ?? [],
    );
    if (formatHasOwnInput(fieldFormat)) {
      return (
        <FormatAwareInput
          id={field.field_name}
          format={fieldFormat}
          dataType={field.data_type}
          value={value}
          placeholder={`Enter ${field.display_name.toLowerCase()}`}
          onChange={(next) => handleValueChange(field.field_name, next)}
          // The LIVE draft, not the saved row: a dependent column must
          // re-narrow the moment its controlling field changes in this form,
          // not after a save-and-reopen.
          row={rowData}
        />
      );
    }

    switch (field.data_type) {
      case "boolean":
        return (
          <Checkbox
            id={field.field_name}
            checked={value === true}
            onCheckedChange={(checked) =>
              handleValueChange(field.field_name, checked)
            }
          />
        );

      case "date":
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
              >
                {value ? (
                  format(new Date(value), "PPP")
                ) : (
                  <span>Pick a date</span>
                )}
                <CalendarIcon className="ml-auto h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent /* sizing: fixed — content already decides its own width; no fixed box to remove */ className="w-auto p-0">
              <Calendar
                mode="single"
                selected={value ? new Date(value) : undefined}
                onSelect={(date) =>
                  handleValueChange(
                    field.field_name,
                    date ? format(date, "yyyy-MM-dd") : null,
                  )
                }
                autoFocus
              />
            </PopoverContent>
          </Popover>
        );

      case "number":
      case "integer":
        return (
          <Input
            id={field.field_name}
            type="number"
            value={value === null || value === undefined ? "" : value}
            onChange={(e) => {
              const val =
                e.target.value === ""
                  ? null
                  : field.data_type === "integer"
                    ? parseInt(e.target.value)
                    : parseFloat(e.target.value);
              handleValueChange(field.field_name, val);
            }}
            step={field.data_type === "integer" ? 1 : 0.01}
          />
        );

      case "datetime":
        return (
          <Input
            id={field.field_name}
            type="datetime-local"
            value={value || ""}
            onChange={(e) =>
              handleValueChange(field.field_name, e.target.value)
            }
          />
        );

      default: // string and other types
        const stringValue =
          value === null || value === undefined ? "" : String(value);
        const hasCleanableHtml =
          isCellValueDirty && isCellValueDirty(stringValue);

        return (
          <div className="relative">
            <ProTextarea
              id={field.field_name}
              value={stringValue}
              onChange={(e) =>
                handleValueChange(field.field_name, e.target.value)
              }
              rows={6}
              className="resize-y pr-10"
            />
            {hasCleanableHtml && cleanCellValue && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                onClick={() => handleFieldCleanup(field.field_name)}
                title={`Clean up HTML formatting in ${field.display_name}`}
              >
                <Zap className="h-3 w-3 text-purple-500 dark:text-purple-400" />
              </Button>
            )}
          </div>
        );
    }
  };

  // Build a human-readable row object using display names
  const getRowAsObject = () => {
    const obj: Record<string, unknown> = {};
    fields
      .sort((a, b) => a.field_order - b.field_order)
      .forEach((field) => {
        obj[field.display_name] = rowData[field.field_name] ?? null;
      });
    return obj;
  };

  const [copiedRow, setCopiedRow] = useState(false);

  const copyRowAsJson = async () => {
    try {
      const json = JSON.stringify(getRowAsObject(), null, 2);
      await navigator.clipboard.writeText(json);
      setCopiedRow(true);
      toast({
        title: "Copied",
        description: "Row copied as JSON",
        variant: "success",
      });
      setTimeout(() => setCopiedRow(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const copyRowAsCsv = async () => {
    try {
      const sortedFields = [...fields].sort(
        (a, b) => a.field_order - b.field_order,
      );
      const headers = sortedFields
        .map((f) => `"${f.display_name.replace(/"/g, '""')}"`)
        .join(",");
      const values = sortedFields
        .map((f) => {
          const val = rowData[f.field_name] ?? "";
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",");
      await navigator.clipboard.writeText(`${headers}\n${values}`);
      setCopiedRow(true);
      toast({
        title: "Copied",
        description: "Row copied as CSV",
        variant: "success",
      });
      setTimeout(() => setCopiedRow(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const downloadRowAsJson = () => {
    const json = JSON.stringify(getRowAsObject(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `row_${rowId}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const downloadRowAsCsv = () => {
    const sortedFields = [...fields].sort(
      (a, b) => a.field_order - b.field_order,
    );
    const headers = sortedFields
      .map((f) => `"${f.display_name.replace(/"/g, '""')}"`)
      .join(",");
    const values = sortedFields
      .map((f) => {
        const val = rowData[f.field_name] ?? "";
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(",");
    const csv = `${headers}\n${values}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `row_${rowId}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (!rowId || !fields.length) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Edit Row</DialogTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0"
                  aria-label="Row actions"
                >
                  {copiedRow ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <MoreHorizontal className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={copyRowAsJson}>
                  <ClipboardCopy className="h-4 w-4 mr-2" />
                  Copy as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyRowAsCsv}>
                  <ClipboardCopy className="h-4 w-4 mr-2" />
                  Copy as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={downloadRowAsJson}>
                  <Download className="h-4 w-4 mr-2" />
                  Download as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={downloadRowAsCsv}>
                  <Download className="h-4 w-4 mr-2" />
                  Download as CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 p-2 rounded-md text-red-500 text-sm">
              {error}
            </div>
          )}

          <div className="max-h-[60dvh] overflow-y-auto space-y-4 pr-2 scrollbar-none">
            {fields
              .sort((a, b) => a.field_order - b.field_order)
              .map((field) => (
                <div key={field.id} className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor={field.field_name} className="flex-grow">
                      {field.display_name}
                      {field.is_required && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {field.data_type}
                    </span>
                  </div>
                  {renderFieldInput(field)}
                  {fieldErrors[field.field_name] ? (
                    <FieldRuleRefusal
                      refusal={fieldErrors[field.field_name]!}
                    />
                  ) : (
                    describeValidationRules(
                      parseValidationRules(field.validation_rules),
                    ).length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {describeValidationRules(
                          parseValidationRules(field.validation_rules),
                        ).join(" • ")}
                      </p>
                    )
                  )}
                </div>
              ))}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

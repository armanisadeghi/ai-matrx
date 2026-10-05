'use client'

import { offerToAddChoiceOption } from "@/features/data-tables/choice-option-nudge";
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DateFieldInput } from "@/features/data-tables/components/DateFieldInput";
import { type TableField } from '@/features/data-tables/table-shapes';
import { addTableRow, readTableDetails } from '@/features/data-tables/service';
import {
  FormatAwareInput,
  formatHasOwnInput,
} from '@/features/data-tables/components/FormatAwareInput';
import { resolveFieldFormat } from '@ai-matrx/design-system/field-formats';
import { withResolvedChoices } from '@/lib/field-formats/choices';
import type { FieldChoice } from '@ai-matrx/design-system/field-formats';
import { isComputedColumn } from '@ai-matrx/design-system/formulas';
import {
  describeValidationRules,
  parseValidationRules,
  validateCellValue,
} from '@/features/data-tables/validation';
import { readRowFormWords } from '@/features/data-tables/row-form-words';
import { columnRuleRefusal, type ColumnRuleRefusal } from '@/features/data-tables/validation-refusal';
import { FieldRuleRefusal } from '@/features/data-tables/components/FieldRuleRefusal';
import { ProInput } from "@/components/official/ProInput";
import { columnKindWord } from "@/features/data-tables/column-kind-word";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface AddRowModalProps {
  tableId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * THE WORDS EVERY `relation` CELL READS, keyed by machine field name — the
   * same `{ value: <record id>, label: <words> }` list the grid's own picker
   * offers, resolved ONCE for the table by `UserTableViewer` through the ONE
   * resolver (`features/data-tables/relation-words` + `-client`) and passed
   * down. A new row picks from exactly what an existing row's cell picks from.
   */
  relationChoices?: ReadonlyMap<string, FieldChoice[]>;
}

export default function AddRowModal({ tableId, isOpen, onClose, onSuccess, relationChoices }: AddRowModalProps) {
  const [fields, setFields] = useState<TableField[]>([]);
  const [rowData, setRowData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingFields, setLoadingFields] = useState(true);
  /**
   * fieldName → why this value is refused. Inline and beside the input, never a
   * single sentence at the top of the form: a form that says "something is
   * wrong" without saying WHERE is a dead end on a table with twenty columns.
   */
  const [fieldErrors, setFieldErrors] = useState<Record<string, ColumnRuleRefusal>>({});

  // Load field definitions
  useEffect(() => {
    const fetchFields = async () => {
      if (!isOpen || !tableId) return;
      
      try {
        setLoadingFields(true);
        
        const result = await readTableDetails(tableId);
        
        if (!result.success || !result.fields) {
          throw new Error(result.error || 'Failed to load table fields');
        }
        
        // Filter out any ID fields that should be auto-generated
        const filteredFields = result.fields.filter((field: TableField) => {
          const fieldNameLower = field.field_name.toLowerCase();
          // Skip fields named exactly 'id' or ending with '_id'
          return fieldNameLower !== 'id' && !fieldNameLower.endsWith('_id');
        });
        
        setFields(filteredFields);
        
        // Initialize row data with default values
        const initialData: Record<string, any> = {};
        filteredFields.forEach((field: TableField) => {
          initialData[field.field_name] = field.default_value !== null ? field.default_value : null;
        });
        
        setRowData(initialData);
      } catch (err) {
        console.error('Error loading fields:', err);
        setError(err instanceof Error ? err.message : 'Failed to load table fields');
      } finally {
        setLoadingFields(false);
      }
    };
    
    fetchFields();
  }, [tableId, isOpen]);
  
  // The first field a person can type into takes focus once the fields are drawn.
  useEffect(() => {
    if (!isOpen || loadingFields) return;
    const first = [...fields]
      .sort((a, b) => a.field_order - b.field_order)
      .find((field) => !isComputedColumn(field));
    if (!first) return;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(first.field_name);
      const target = el && (el.matches("input, textarea, button, [tabindex]") ? el : el.querySelector<HTMLElement>("input, textarea, button"));
      target?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, loadingFields, fields]);

  // Handle field value change
  const handleValueChange = (fieldName: string, value: any) => {
    setRowData((prev) => ({
      ...prev,
      [fieldName]: value
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
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields (excluding any ID fields)
    const missingFields = fields
      .filter(field => field.is_required && !isComputedColumn(field) && (rowData[field.field_name] === null || rowData[field.field_name] === undefined))
      .map(field => field.display_name);
    
    if (missingFields.length > 0) {
      setError(`Please fill in required fields: ${missingFields.join(', ')}`);
      return;
    }

    // Column validation rules, checked before anything is sent. `unique` is
    // skipped here on purpose: this form has not loaded the table's rows, and a
    // uniqueness claim made without them would be a guess.
    // Typed numbers are read first, by the one reader (row-form-words.ts): "(150)" is -150.
    const typed = readRowFormWords(fields, rowData);
    const nextErrors: Record<string, ColumnRuleRefusal> = {};
    for (const [fieldName, why] of Object.entries(typed.refusals)) {
      const field = fields.find((f) => f.field_name === fieldName);
      if (field) nextErrors[fieldName] = columnRuleRefusal({ fieldDisplayName: field.display_name, reason: why });
    }
    for (const field of fields) {
      if (isComputedColumn(field) || nextErrors[field.field_name]) continue;
      const verdict = validateCellValue({
        rules: parseValidationRules(field.validation_rules),
        dataType: field.data_type,
        format: resolveFieldFormat(field.data_type, field.metadata),
        value: typed.data[field.field_name],
      });
      if (!verdict.ok) {
        // THE ONE REFUSAL SHAPE. The bare red sentence this used to be said what
        // was wrong and nothing about what to do, and it looked nothing like the
        // refusal the same person meets on the grid two clicks away.
        nextErrors[field.field_name] = columnRuleRefusal({
          fieldDisplayName: field.display_name,
          reason: verdict.reason,
          rules: parseValidationRules(field.validation_rules),
          format: resolveFieldFormat(field.data_type, field.metadata),
        });
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      // 🚨 THE REFUSAL HAS TO BE VISIBLE FROM THE BUTTON — see the same block
      // in EditRowModal for the failure this kills: the inline message lives
      // inside the scrolling field list, so Save on an off-screen offender
      // looked like a dead button. The summary goes in the always-visible
      // banner the required-field refusal already uses.
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
      
      // Use the utility function
      const result = await addTableRow({
        tableId,
        data: typed.data
      });
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      // An off-list value on a choice column: offer to make it an option.
      for (const field of fields) {
        if (field.field_name in rowData) {
          offerToAddChoiceOption({ tableId, field, saved: rowData[field.field_name], onAdded: onSuccess });
        }
      }

      // Reset form and close modal
      setRowData({});
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error adding row:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Render different input based on data type
  const renderFieldInput = (field: TableField) => {
    const value = rowData[field.field_name];

    // A declared display format gets first refusal on the input (email
    // keyboard, color swatch, big box). It returns null when it has no
    // opinion, and the storage-type switch below takes over unchanged.
    // A formula column stores nothing and is computed from the row's other
    // cells; this form offers no input for it, and says why, so nobody types a
    // value that could never be kept.
    if (isComputedColumn(field)) {
      return (
        <p
          id={field.field_name}
          className='rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground'
        >
          Filled in by the table itself — calculated from this row, or stamped
          automatically — so there is nothing to type here.
        </p>
      );
    }

    // A `relation` column's options — record ids with the words the store
    // resolved for them — fold into the format here, the same seam the grid
    // uses before handing a cell to `EditableCell`, so the ONE picker serves
    // both surfaces with nothing added to it.
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
      case 'boolean':
        return (
          <Checkbox
            id={field.field_name}
            checked={value === true}
            onCheckedChange={(checked) => handleValueChange(field.field_name, checked)}
          />
        );
        
      case "date":
      case "datetime":
        // The Sheet cell's own date editor — one date control everywhere (BREAKER-3 B3-03).
        return (
          <DateFieldInput
            id={field.field_name}
            kind={field.data_type === "date" ? "date" : "datetime"}
            value={value}
            onChange={(next) => handleValueChange(field.field_name, next)}
          />
        );

      case 'number':
      case 'integer':
        // A TEXT BOX THAT KEEPS WHAT WAS TYPED (grids review 3): the browser's number control could not
        // hold "(150)" or "$1,250.50", and the column was saved empty. Read on Save (row-form-words.ts).
        return (
          <Input
            id={field.field_name}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => handleValueChange(field.field_name, e.target.value === '' ? null : e.target.value)}
            placeholder={`Enter ${field.display_name.toLowerCase()}`}
          />
        );
        
      case 'json':
        return (
          <Input
            id={field.field_name}
            value={value === null || value === undefined ? '' : 
                  typeof value === 'object' ? JSON.stringify(value) : value}
            onChange={(e) => {
              try {
                // Try to parse as JSON if possible
                const jsonValue = e.target.value.trim() === '' ? null : JSON.parse(e.target.value);
                handleValueChange(field.field_name, jsonValue);
              } catch {
                // If not valid JSON, store as string
                handleValueChange(field.field_name, e.target.value);
              }
            }}
            placeholder={`Enter JSON (e.g., {"key": "value"})`}
          />
        );
        
      case 'array':
        return (
          <Input
            id={field.field_name}
            value={value === null || value === undefined ? '' : 
                  Array.isArray(value) ? JSON.stringify(value) : value}
            onChange={(e) => {
              try {
                // Try to parse as array if possible
                const arrayValue = e.target.value.trim() === '' ? null : JSON.parse(e.target.value);
                if (Array.isArray(arrayValue) || arrayValue === null) {
                  handleValueChange(field.field_name, arrayValue);
                } else {
                  handleValueChange(field.field_name, [arrayValue]);
                }
              } catch {
                // If not valid array, store as string
                handleValueChange(field.field_name, e.target.value);
              }
            }}
            placeholder={`Enter array elements (e.g., ["item1", "item2"])`}
          />
        );
        
      default: // string and other types
        // A plain text column is one line, the way the grid's cell edits it (DATA-V2-BASICS-2,
        // B-F3): three-line boxes under every name made a four-column row a page tall. Long text
        // and Markdown columns have their own box (FormatAwareInput, above).
        return (
          <ProInput
            id={field.field_name}
            // Tab moves field to field (grids review 3: it walked each field's voice and menu buttons,
            // and fast-typed values landed in them). The buttons stay one click away.
            auxiliaryControlsTabIndex={-1}
            value={value === null || value === undefined ? '' : value}
            onChange={(e) => handleValueChange(field.field_name, e.target.value)}
            placeholder={`Enter ${field.display_name.toLowerCase()}`}
          />
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[500px]"
        // FOCUS STARTS IN THE FIRST FIELD (grids review 3): the fields arrive after the dialog opens, so
        // the dialog's own first stop was Cancel and typing went nowhere. The first field takes focus
        // the moment it is drawn (below).
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add New Row</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 p-2 rounded-md text-red-500 text-sm">
              {error}
              <ErrorAlchemyMenu error={error} />
            </div>
          )}
          
          {loadingFields ? (
            <div className="py-4 text-center">Loading fields...</div>
          ) : (
            <div className="max-h-[60dvh] overflow-y-auto space-y-4 pr-2 scrollbar-none">
              {fields.sort((a, b) => a.field_order - b.field_order).map((field) => (
                <div key={field.id} className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor={field.field_name} className="flex-grow">
                      {field.display_name}
                      {field.is_required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {columnKindWord(field)}
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
                      resolveFieldFormat(field.data_type, field.metadata),
                    ).length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {describeValidationRules(
                          parseValidationRules(field.validation_rules),
                          resolveFieldFormat(field.data_type, field.metadata),
                        ).join(' • ')}
                      </p>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || loadingFields}>
              {loading ? 'Adding...' : 'Add Row'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

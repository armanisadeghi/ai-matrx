'use client';
import { useEffect, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { VALID_DATA_TYPES } from '@/utils/user-table-utls/table-utils';
import { storageTypeLabel } from '@/features/data-tables/column-storage-types';
import { addTableColumn } from '@/features/data-tables/service';
import { sanitizeFieldName } from '@/utils/user-table-utls/field-name-sanitizer';
import { setFieldFormat } from '@/features/data-tables/service';
import { FormulaExpressionEditor } from '@/features/data-tables/components/FormulaExpressionEditor';
import { isServiceFailure } from '@/features/data-tables/types';
import { columnNameProblem, columnNameToKeep } from '@/features/data-tables/column-name-taken';
import { offListChoiceWords, readCellWord, takesOtherWords } from '@/features/data-tables/cell-word';
import { FieldFormatPicker } from '@/lib/field-formats/FieldFormatPicker';
import {
  offerFormatWhereRelationIs,
  useRelationColumnsEnabled,
} from "@/features/data-tables/relation-knob";
import { defaultFormatForBase } from '@ai-matrx/design-system/field-formats';
import type { FieldFormatConfig } from '@ai-matrx/design-system/field-formats';
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";

interface AddColumnModalProps {
  tableId: string;
  /**
   * The organization this table belongs to. It decides which column types this
   * picker offers — `data_tables.relation.relation_columns_enabled` is an
   * organization's own setting (OLD-TABLES-CUTOVER rev 2, W6), default off.
   */
  organizationId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * Insert the new column at this `field_order` instead of appending — the
   * right-click "Insert column left / right". The caller shifts the columns
   * at and after this order by one once the column exists.
   */
  insertAtOrder?: number;
  /** The table's existing columns — offered as references by the formula editor. */
  siblingFields?: { field_name: string; display_name: string }[];
}

export default function AddColumnModal({ tableId, organizationId, isOpen, onClose, onSuccess, insertAtOrder, siblingFields = [] }: AddColumnModalProps) {
  const relationEnabled = useRelationColumnsEnabled(organizationId);
  const [displayName, setDisplayName] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [dataType, setDataType] = useState('string');
  const [format, setFormat] = useState<FieldFormatConfig>({ id: 'text' });
  const [isRequired, setIsRequired] = useState(false);
  // Formula + system columns store nothing: no default, never required.
  const isComputedFormat =
    format.id === 'formula' ||
    format.id === 'created_time' ||
    format.id === 'modified_time' ||
    format.id === 'autonumber';
  const [defaultValue, setDefaultValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The modal stays mounted between opens, so without this every field keeps
  // whatever the last (possibly cancelled) attempt left behind — reopening it
  // showed a stale column name and a format that no longer matched the type.
  useEffect(() => {
    if (!isOpen) return;
    setDisplayName('');
    setFieldName('');
    setDataType('string');
    setFormat({ id: 'text' });
    setIsRequired(false);
    setDefaultValue('');
    setError(null);
  }, [isOpen]);

  // Generate field name from display name
  const generateFieldName = (name: string) => {
    return sanitizeFieldName(name);
  };

  // Handle display name change
  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value);
    setFieldName(generateFieldName(value));
  };

  // Handle form submission
  // A name another column already has is said as it is typed, and never sent (column-name-taken.ts).
  // Blank is said once the person has typed something (three spaces, BREAKER-2 B2-08); the rest at once.
  const nameTaken = displayName === '' ? null : columnNameProblem(displayName, siblingFields);

  // THE DEFAULT, READ AS THE COLUMN WILL READ IT, AS IT IS TYPED (BREAKER-2 B2-01 S1, B2-14): "abc" on a
  // Whole number column, or "Rutine" on a Choice column without it, used to be accepted and then made
  // every new row fail or carry a word nobody chose. The store refuses them too; this says it first.
  const defaultColumn = { display_name: columnNameToKeep(displayName) || 'This column', data_type: dataType, metadata: { format } };
  const defaultRead = defaultValue.trim() === '' ? null : readCellWord(defaultValue, defaultColumn);
  const defaultOffList = defaultRead?.ok ? offListChoiceWords(defaultRead.value, defaultColumn) : [];
  const defaultProblem = !defaultRead
    ? null
    : !defaultRead.ok
      ? defaultRead.why
      : defaultOffList.length > 0 && !takesOtherWords(defaultColumn)
        ? `“${defaultOffList.join(', ')}” is not one of the choices, so it cannot be the default. Pick one of the choices, or add it to them first.`
        : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameProblem = columnNameProblem(displayName, siblingFields);
    if (nameProblem) {
      setError(nameProblem);
      return;
    }
    if (defaultProblem && !isComputedFormat) {
      setError(defaultProblem);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Use the utility function
      const result = await addTableColumn({
        tableId,
        fieldName: generateFieldName(columnNameToKeep(displayName)),
        displayName: columnNameToKeep(displayName),
        dataType,
        isRequired: isComputedFormat ? false : isRequired,
        // The default as the column keeps it ("$30" → 30, "yes" → ticked), never the raw words.
        defaultValue: isComputedFormat || !defaultRead?.ok ? null : (defaultRead.value as string | number | boolean | null),
        ...(typeof insertAtOrder === "number" ? { fieldOrder: insertAtOrder } : {}),
      });
      
      if (!result.success) {
        // A refusal is the store's answer, said in the dialog — not an error in the console.
        setError(result.error ?? "The column could not be added.");
        return;
      }

      // Attach the display format if the user picked a non-plain one. This is a
      // second call rather than an argument to add_column because the format is
      // a UI layer over the stored type — the column is fully created and valid
      // either way, so a failure here never leaves a half-made column.
      if (
        result.columnId &&
        format.id !== defaultFormatForBase(dataType)
      ) {
        const formatResult = await setFieldFormat({
          tableId,
          fieldId: result.columnId,
          format,
        });
        if (isServiceFailure(formatResult)) {
          // NEVER SILENT (lane CHOICE-COLUMN-EDIT b, BREAKER-1): a Choice column whose format was
          // refused used to stay plain Text with only this console line. The column exists; say so,
          // with what it is instead and where to finish it.
          toast.error(
            `"${displayName}" was added, but not as ${format.id.replace(/_/g, ' ')}: ${formatResult.error} Open its column settings to try again.`,
          );
        }
      }

      // Reset form and close modal
      setDisplayName('');
      setFieldName('');
      setDataType('string');
      setFormat({ id: 'text' });
      setIsRequired(false);
      setDefaultValue('');
      
      // Call the onSuccess callback first, then close the modal
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error adding column:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === 'object' && err !== null) {
        setError(JSON.stringify(err));
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Column</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 p-2 rounded-md text-red-500 text-sm">
              {error}
              <ErrorAlchemyMenu error={error} />
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="displayName">Column Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder="e.g. Total Revenue"
              required
              aria-invalid={nameTaken ? true : undefined}
              aria-describedby={nameTaken ? "displayName-taken" : undefined}
            />
            {nameTaken && !error ? (
              <p id="displayName-taken" className="text-xs text-destructive">
                {nameTaken}
              </p>
            ) : null}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="dataType">Data Type</Label>
            <Select
              value={dataType}
              onValueChange={(next) => {
                setDataType(next);
                // A format only fits certain storage types — reset to plain.
                setFormat({ id: defaultFormatForBase(next) });
              }}
            >
              <SelectTrigger id="dataType">
                <SelectValue placeholder="Select data type" />
              </SelectTrigger>
              <SelectContent>
                {VALID_DATA_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {/* The person's word for it (DATA-V2-BASICS-2 T3), never "String" or "Json". */}
                    {storageTypeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Shows as</Label>
            <FieldFormatPicker
              dataType={dataType}
              value={format}
              onChange={setFormat}
              offerFormat={offerFormatWhereRelationIs(relationEnabled)}
              onDataTypeChange={(base, next) => {
                setDataType(base);
                setFormat(next);
              }}
              triggerClassName="h-9 w-full text-sm"
            />
            {format.id === "formula" && (
              <FormulaExpressionEditor
                value={format}
                onChange={setFormat}
                siblingFields={siblingFields}
                disabled={loading}
              />
            )}
            <p className="text-xs text-muted-foreground">
              How this column is displayed and edited. The stored data type stays exactly as chosen above.
            </p>
          </div>

          {/* A formula column stores nothing, so "required" and "default" have
              no meaning for it; the two controls are absent rather than dead. */}
          {isComputedFormat ? (
            <p className="text-xs text-muted-foreground">
              This column is filled in by the table itself for every row, so it has no default and is never required.
            </p>
          ) : (
          <>
          <div className="flex items-center space-x-2">
            <Switch
              id="isRequired"
              checked={isRequired}
              onCheckedChange={setIsRequired}
            />
            <Label htmlFor="isRequired">Required Field</Label>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="defaultValue">Default Value (optional)</Label>
            <Input
              id="defaultValue"
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
              aria-invalid={defaultProblem ? true : undefined}
              placeholder={`e.g. ${
                dataType === 'boolean' ? 'true/false' :
                dataType === 'number' || dataType === 'integer' ? '0' : 
                dataType === 'date' ? 'YYYY-MM-DD' :
                dataType === 'datetime' ? 'YYYY-MM-DD HH:MM:SS' : 
                dataType === 'json' ? '{}' :
                dataType === 'array' ? '[]' :
                'Default text'
              }`}
            />
            {defaultProblem ? <p className="text-xs text-destructive" data-default-problem="">{defaultProblem}</p> : null}
          </div>
          </>
          )}
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Column'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

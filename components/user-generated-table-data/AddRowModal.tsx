'use client'

import { useState, useEffect } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { supabase } from '@/utils/supabase/client';
import { getTableDetails, addRow, type TableField } from '@/utils/user-table-utls/table-utils';
import {
  FormatAwareInput,
  formatHasOwnInput,
} from '@/features/data-tables/components/FormatAwareInput';
import { resolveFieldFormat } from '@/lib/field-formats/format';
import { isFormulaColumn } from '@/features/data-tables/formulas';
import {
  describeValidationRules,
  parseValidationRules,
  validateCellValue,
} from '@/features/data-tables/validation';
import { ProTextarea } from "@/components/official/ProTextarea";

interface AddRowModalProps {
  tableId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddRowModal({ tableId, isOpen, onClose, onSuccess }: AddRowModalProps) {
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Load field definitions
  useEffect(() => {
    const fetchFields = async () => {
      if (!isOpen || !tableId) return;
      
      try {
        setLoadingFields(true);
        
        const result = await getTableDetails(supabase, tableId);
        
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
      .filter(field => field.is_required && !isFormulaColumn(field) && (rowData[field.field_name] === null || rowData[field.field_name] === undefined))
      .map(field => field.display_name);
    
    if (missingFields.length > 0) {
      setError(`Please fill in required fields: ${missingFields.join(', ')}`);
      return;
    }

    // Column validation rules, checked before anything is sent. `unique` is
    // skipped here on purpose: this form has not loaded the table's rows, and a
    // uniqueness claim made without them would be a guess.
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      if (isFormulaColumn(field)) continue;
      const verdict = validateCellValue({
        rules: parseValidationRules(field.validation_rules),
        dataType: field.data_type,
        format: resolveFieldFormat(field.data_type, field.metadata),
        value: rowData[field.field_name],
      });
      if (!verdict.ok) nextErrors[field.field_name] = verdict.reason;
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError(null);
      return;
    }
    setFieldErrors({});
    
    try {
      setLoading(true);
      setError(null);
      
      // Use the utility function
      const result = await addRow(supabase, {
        tableId,
        data: rowData
      });
      
      if (!result.success) {
        throw new Error(result.error);
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
    if (isFormulaColumn(field)) {
      return (
        <p
          id={field.field_name}
          className='rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground'
        >
          Calculated from the other columns in this row — it updates on its own
          once the row is saved.
        </p>
      );
    }

    const fieldFormat = resolveFieldFormat(field.data_type, field.metadata);
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
        
      case 'date':
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
              >
                {value ? format(new Date(value), 'PPP') : <span>Pick a date</span>}
                <CalendarIcon className="ml-auto h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={value ? new Date(value) : undefined}
                onSelect={(date) => handleValueChange(field.field_name, date ? format(date, 'yyyy-MM-dd') : null)}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        );
        
      case 'number':
      case 'integer':
        return (
          <Input
            id={field.field_name}
            type="number"
            value={value === null || value === undefined ? '' : value}
            onChange={(e) => {
              const val = e.target.value === '' ? null : 
                field.data_type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value);
              handleValueChange(field.field_name, val);
            }}
            step={field.data_type === 'integer' ? 1 : 0.01}
            placeholder={`Enter ${field.display_name.toLowerCase()}`}
          />
        );
        
      case 'datetime':
        // For simplicity, we're using a text input for datetime
        // In a real app, you might want a proper datetime picker
        return (
          <Input
            id={field.field_name}
            type="datetime-local"
            value={value || ''}
            onChange={(e) => handleValueChange(field.field_name, e.target.value)}
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
        return (
          <ProTextarea
            id={field.field_name}
            value={value === null || value === undefined ? '' : value}
            onChange={(e) => handleValueChange(field.field_name, e.target.value)}
            rows={3}
            className="resize-y"
            placeholder={`Enter ${field.display_name.toLowerCase()}`}
          />
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Row</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 p-2 rounded-md text-red-500 text-sm">
              {error}
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
                      {field.data_type}
                    </span>
                  </div>
                  {renderFieldInput(field)}
                  {fieldErrors[field.field_name] ? (
                    <p className="text-xs text-destructive">
                      {fieldErrors[field.field_name]}
                    </p>
                  ) : (
                    describeValidationRules(
                      parseValidationRules(field.validation_rules),
                    ).length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {describeValidationRules(
                          parseValidationRules(field.validation_rules),
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

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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { supabase } from '@/utils/supabase/client';
import { getTableDetails, addRow, type TableField } from '@/utils/user-table-utls/table-utils';

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
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields (excluding any ID fields)
    const missingFields = fields
      .filter(field => field.is_required && (rowData[field.field_name] === null || rowData[field.field_name] === undefined))
      .map(field => field.display_name);
    
    if (missingFields.length > 0) {
      setError(`Please fill in required fields: ${missingFields.join(', ')}`);
      return;
    }
    
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
                initialFocus
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
          <Textarea
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
'use client';

import React, { useState, useEffect } from 'react';
import { DatabaseEnum, CreateEnumRequest, UpdateEnumRequest } from '@/types/enum-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Save, X, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface EnumFormProps {
  enumData?: DatabaseEnum;
  onSubmit: (request: CreateEnumRequest | UpdateEnumRequest) => Promise<boolean>;
  onCancel: () => void;
}

export default function EnumForm({
  enumData,
  onSubmit,
  onCancel,
}: EnumFormProps) {
  const isEdit = !!enumData;
  
  // Initialize form state
  const [name, setName] = useState(enumData?.name || '');
  const [schema, setSchema] = useState(enumData?.schema || 'public');
  const [description, setDescription] = useState(enumData?.description || '');
  const [values, setValues] = useState<string[]>(enumData?.values || ['']);
  const [newValues, setNewValues] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  
  // Handle adding a new value input
  const addValueInput = () => {
    if (isEdit) {
      setNewValues([...newValues, '']);
    } else {
      setValues([...values, '']);
    }
  };
  
  // Handle removing a value input
  const removeValueInput = (index: number) => {
    if (isEdit) {
      const updated = newValues.filter((_, i) => i !== index);
      setNewValues(updated);
    } else {
      const updated = values.filter((_, i) => i !== index);
      setValues(updated);
    }
  };
  
  // Handle updating a value
  const updateValue = (index: number, value: string) => {
    if (isEdit) {
      const updated = [...newValues];
      updated[index] = value;
      setNewValues(updated);
    } else {
      const updated = [...values];
      updated[index] = value;
      setValues(updated);
    }
  };
  
  // Validate form
  const validateForm = (): boolean => {
    if (!name.trim()) {
      setError('Enum name is required');
      return false;
    }
    
    if (!schema.trim()) {
      setError('Schema is required');
      return false;
    }
    
    if (isEdit) {
      // For edits, we only need to validate new values
      const filteredNewValues = newValues.filter(v => v.trim());
      if (filteredNewValues.length === 0) {
        setError('At least one new value is required for updates');
        return false;
      }
    } else {
      // For creates, we need at least one value
      const filteredValues = values.filter(v => v.trim());
      if (filteredValues.length === 0) {
        setError('At least one enum value is required');
        return false;
      }
    }
    
    return true;
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      let request: CreateEnumRequest | UpdateEnumRequest;
      
      if (isEdit) {
        // Filter out empty values for updates
        const filteredNewValues = newValues.filter(v => v.trim());
        
        request = {
          schema,
          name,
          valuesToAdd: filteredNewValues.length > 0 ? filteredNewValues : undefined,
          description: description.trim() || undefined,
        } as UpdateEnumRequest;
      } else {
        // Filter out empty values for creates
        const filteredValues = values.filter(v => v.trim());
        
        request = {
          name,
          schema,
          values: filteredValues,
          description: description.trim() || undefined,
        } as CreateEnumRequest;
      }
      
      const success = await onSubmit(request);
      if (success) {
        setShowSuccessMessage(true);
        setTimeout(() => {
          setShowSuccessMessage(false);
        }, 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving the enum');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive" className="bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {showSuccessMessage && (
        <Alert className="bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>
            {isEdit ? 'Enum updated successfully' : 'Enum created successfully'}
          </AlertDescription>
        </Alert>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="name" className="text-slate-700 dark:text-slate-300">
              Enum Name *
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_enum"
              required
              disabled={isEdit} // Can't change name in edit mode
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700"
            />
          </div>
          
          <div>
            <Label htmlFor="schema" className="text-slate-700 dark:text-slate-300">
              Schema *
            </Label>
            <Input
              id="schema"
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              placeholder="public"
              required
              disabled={isEdit} // Can't change schema in edit mode
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700"
            />
          </div>
          
          <div>
            <Label htmlFor="description" className="text-slate-700 dark:text-slate-300">
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description for the enum"
              rows={3}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700"
            />
          </div>
        </div>
        
        <div className="space-y-4">
          {isEdit && enumData && (
            <div>
              <Label className="text-slate-700 dark:text-slate-300">
                Current Values ({enumData.values.length})
              </Label>
              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-md border border-slate-200 dark:border-slate-700 max-h-40 overflow-y-auto">
                <div className="flex flex-wrap gap-2">
                  {enumData.values.map((value, index) => (
                    <Badge 
                      key={index}
                      variant="secondary"
                      className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                    >
                      {value}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Note: PostgreSQL doesn't support removing or renaming enum values. You can only add new values.
              </p>
            </div>
          )}
          
          <div>
            <Label className="text-slate-700 dark:text-slate-300">
              {isEdit ? 'New Values to Add' : 'Enum Values *'}
            </Label>
            <div className="space-y-2">
              {(isEdit ? newValues : values).map((value, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Input
                    value={value}
                    onChange={(e) => updateValue(index, e.target.value)}
                    placeholder={`Value ${index + 1}`}
                    className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeValueInput(index)}
                    disabled={(isEdit ? newValues : values).length === 1}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addValueInput}
                className="w-full text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Value
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-end space-x-3">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          disabled={loading}
          className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={loading}
          className="bg-slate-700 hover:bg-slate-600 text-white dark:bg-slate-700 dark:hover:bg-slate-600"
        >
          <Save className="h-4 w-4 mr-2" />
          {isEdit ? 'Update Enum' : 'Create Enum'}
        </Button>
      </div>
    </form>
  );
} 
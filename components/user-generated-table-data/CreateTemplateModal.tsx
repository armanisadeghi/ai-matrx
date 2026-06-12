'use client';

import { useState } from 'react';
import { supabase } from '@/utils/supabase/client';
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
import { Switch } from "@/components/ui/switch";
import { Plus, Trash, MoveUp, MoveDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VALID_DATA_TYPES, type FieldDefinition } from '@/utils/user-table-utls/table-utils';
import { createSchemaTemplate } from '@/utils/user-table-utls/template-utils';
import { sanitizeFieldName } from '@/utils/user-table-utls/field-name-sanitizer';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (templateId: string) => void;
}

export default function CreateTemplateModal({ isOpen, onClose, onSuccess }: CreateTemplateModalProps) {
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('details');
  const [currentField, setCurrentField] = useState<number | null>(null);

  // Reset form when modal opens
  const resetForm = () => {
    setTemplateName('');
    setDescription('');
    setFields([]);
    setError(null);
    setActiveTab('details');
    setCurrentField(null);
  };

  // Handle field name generation from display name
  const generateFieldName = (name: string) => {
    return sanitizeFieldName(name);
  };

  // Add a new field
  const addField = () => {
    const newField: FieldDefinition = {
      field_name: '',
      display_name: '',
      data_type: 'string',
      field_order: fields.length + 1,
      is_required: false
    };
    
    setFields([...fields, newField]);
    setCurrentField(fields.length);
    setActiveTab('fields');
  };

  // Remove a field
  const removeField = (index: number) => {
    const newFields = [...fields];
    newFields.splice(index, 1);
    
    // Update field_order for remaining fields
    const updatedFields = newFields.map((field, idx) => ({
      ...field,
      field_order: idx + 1
    }));
    
    setFields(updatedFields);
    
    // Update current field selection if needed
    if (currentField === index) {
      setCurrentField(index < newFields.length ? index : newFields.length - 1);
    } else if (currentField !== null && currentField > index) {
      setCurrentField(currentField - 1);
    }
  };

  // Move field up in order
  const moveFieldUp = (index: number) => {
    if (index === 0) return; // Already at the top
    
    const newFields = [...fields];
    const temp = newFields[index];
    newFields[index] = newFields[index - 1];
    newFields[index - 1] = temp;
    
    // Update field_order for all fields
    const updatedFields = newFields.map((field, idx) => ({
      ...field,
      field_order: idx + 1
    }));
    
    setFields(updatedFields);
    setCurrentField(index - 1);
  };

  // Move field down in order
  const moveFieldDown = (index: number) => {
    if (index === fields.length - 1) return; // Already at the bottom
    
    const newFields = [...fields];
    const temp = newFields[index];
    newFields[index] = newFields[index + 1];
    newFields[index + 1] = temp;
    
    // Update field_order for all fields
    const updatedFields = newFields.map((field, idx) => ({
      ...field,
      field_order: idx + 1
    }));
    
    setFields(updatedFields);
    setCurrentField(index + 1);
  };

  // Update a field property
  const updateField = (index: number, property: keyof FieldDefinition, value: any) => {
    const newFields = [...fields];
    newFields[index] = {
      ...newFields[index],
      [property]: value
    };
    
    // If display name changes, update field_name
    if (property === 'display_name') {
      newFields[index].field_name = generateFieldName(value);
    }
    
    setFields(newFields);
  };

  // Validate template before submission
  const validateTemplate = () => {
    if (!templateName.trim()) {
      setError('Template name is required');
      setActiveTab('details');
      return false;
    }
    
    if (fields.length === 0) {
      setError('At least one field is required');
      setActiveTab('fields');
      return false;
    }
    
    // Check for duplicate field names
    const fieldNames = fields.map(f => f.field_name);
    const hasDuplicates = new Set(fieldNames).size !== fieldNames.length;
    
    if (hasDuplicates) {
      setError('Duplicate field names are not allowed');
      setActiveTab('fields');
      return false;
    }
    
    // Check for empty field names or display names
    const hasEmptyFields = fields.some(field => !field.field_name || !field.display_name);
    
    if (hasEmptyFields) {
      setError('All fields must have a name and display name');
      setActiveTab('fields');
      return false;
    }
    
    return true;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateTemplate()) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Call createSchemaTemplate from our utility
      const result = await createSchemaTemplate(supabase, {
        templateName,
        description,
        fields
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create template');
      }
      
      // Reset form and close modal
      resetForm();
      
      // Call success callback with the new template ID
      if (result.templateId) {
        onSuccess(result.templateId);
      }
      
      onClose();
    } catch (err) {
      console.error('Error creating template:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose();
      if (open) resetForm();
    }}>
      <DialogContent className="sm:max-w-[650px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Schema Template</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-red-50 p-2 rounded-md text-red-500 text-sm">
              {error}
            </div>
          )}
          
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Template Details</TabsTrigger>
              <TabsTrigger value="fields">Fields ({fields.length})</TabsTrigger>
            </TabsList>
            
            <TabsContent value="details" className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="templateName">Template Name</Label>
                <Input
                  id="templateName"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Customer Information"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the purpose of this template"
                  rows={3}
                />
              </div>
            </TabsContent>
            
            <TabsContent value="fields" className="py-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-medium">Field Definitions</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addField}
                >
                  <Plus className="h-4 w-4" />
                  Add Field
                </Button>
              </div>
              
              <div className="grid md:grid-cols-5 gap-4">
                <div className="md:col-span-2 space-y-2 border-r pr-4">
                  {fields.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No fields added yet. Click 'Add Field' to begin.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {fields.map((field, index) => (
                        <div 
                          key={index} 
                          className={`flex justify-between items-center p-2 rounded cursor-pointer ${
                            currentField === index 
                              ? 'bg-primary/10 border border-primary/30' 
                              : 'hover:bg-muted'
                          }`}
                          onClick={() => setCurrentField(index)}
                        >
                          <div className="overflow-hidden">
                            <div className="font-medium truncate">{field.display_name || '(Unnamed Field)'}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {field.field_name || '(no-name)'} • {field.data_type} {field.is_required && '• required'}
                            </div>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveFieldUp(index);
                              }}
                              disabled={index === 0}
                            >
                              <MoveUp className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveFieldDown(index);
                              }}
                              disabled={index === fields.length - 1}
                            >
                              <MoveDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="md:col-span-3">
                  {currentField !== null && fields[currentField] ? (
                    <Card>
                      <CardContent className="pt-4 space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-medium">Edit Field</h3>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removeField(currentField)}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="field-display-name">Field Name</Label>
                          <Input
                            id="field-display-name"
                            value={fields[currentField].display_name}
                            onChange={(e) => updateField(currentField, 'display_name', e.target.value)}
                            placeholder="e.g. Total Revenue"
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            Internal field name: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">{fields[currentField].field_name || 'auto-generated'}</code>
                          </p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="field-type">Data Type</Label>
                          <Select
                            value={fields[currentField].data_type}
                            onValueChange={(value) => updateField(currentField, 'data_type', value)}
                          >
                            <SelectTrigger id="field-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {VALID_DATA_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="field-required"
                            checked={fields[currentField].is_required}
                            onCheckedChange={(checked) => updateField(currentField, 'is_required', checked)}
                          />
                          <Label htmlFor="field-required">Required Field</Label>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="field-default">Default Value (optional)</Label>
                          <Input
                            id="field-default"
                            value={fields[currentField].default_value !== undefined ? String(fields[currentField].default_value) : ''}
                            onChange={(e) => {
                              let value = e.target.value;
                              
                              // Convert value based on data type
                              if (value === '') {
                                updateField(currentField, 'default_value', undefined);
                                return;
                              }
                              
                              switch (fields[currentField].data_type) {
                                case 'number':
                                case 'integer':
                                  const num = fields[currentField].data_type === 'integer' 
                                    ? parseInt(value) 
                                    : parseFloat(value);
                                  if (!isNaN(num)) {
                                    updateField(currentField, 'default_value', num);
                                  }
                                  break;
                                case 'boolean':
                                  updateField(currentField, 'default_value', value.toLowerCase() === 'true');
                                  break;
                                case 'json':
                                case 'array':
                                  try {
                                    const parsed = JSON.parse(value);
                                    updateField(currentField, 'default_value', parsed);
                                  } catch (e) {
                                    // If not valid JSON, leave as string
                                    updateField(currentField, 'default_value', value);
                                  }
                                  break;
                                default:
                                  updateField(currentField, 'default_value', value);
                              }
                            }}
                            placeholder={`Default value for ${fields[currentField].data_type} type`}
                          />
                          <p className="text-xs text-muted-foreground">
                            {fields[currentField].data_type === 'json' && 'Enter a valid JSON object'}
                            {fields[currentField].data_type === 'array' && 'Enter a valid JSON array'}
                            {fields[currentField].data_type === 'boolean' && 'Enter true or false'}
                            {(fields[currentField].data_type === 'number' || fields[currentField].data_type === 'integer') && 'Enter a valid number'}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-8 text-center text-muted-foreground">
                      <p>{fields.length === 0 ? 'Add fields to create your template' : 'Select a field to edit'}</p>
                      {fields.length === 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-4"
                          onClick={addField}
                        >
                          <Plus className="h-4 w-4" />
                          Add First Field
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 
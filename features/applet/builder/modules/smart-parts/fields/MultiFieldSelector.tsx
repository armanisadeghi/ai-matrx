'use client';
import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Check, ChevronDown, RefreshCw, LayoutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { idMatchesQuery } from '@/utils/search-scoring';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldDefinition } from '@/types/customAppTypes';
import { getAllFieldComponents } from '@/lib/redux/app-builder/service/fieldComponentService';

// Define type for fieldIds
type FieldId = string;

type SmartFieldsListRefType = {
  refresh: (specificFieldIds?: FieldId[]) => Promise<FieldDefinition[]>;
};

type MultiFieldSelectorProps = {
  selectedFields: FieldDefinition[];
  onFieldsChange: (fields: FieldDefinition[]) => void;
  buttonLabel?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  buttonClassName?: string;
  dialogTitle?: string;
  showCreateOption?: boolean;
  onCreateField?: () => void;
  onEditField?: (field: FieldDefinition) => void;
  onDuplicateField?: (field: FieldDefinition) => void;
  triggerComponent?: React.ReactNode;
  defaultOpen?: boolean;
  maxSelections?: number;
  emptySelectionText?: string;
  fieldFilter?: (field: FieldDefinition) => boolean;
}

/**
 * A component that allows selecting multiple fields
 */
const MultiFieldSelector: React.FC<MultiFieldSelectorProps> & {
  refresh: () => Promise<FieldDefinition[]>;
} = ({
  selectedFields = [],
  onFieldsChange,
  buttonLabel = 'Choose Fields',
  buttonVariant = 'outline',
  buttonSize = 'default',
  buttonClassName = '',
  dialogTitle = 'Select Fields',
  showCreateOption = true,
  onCreateField,
  onEditField,
  onDuplicateField,
  triggerComponent,
  defaultOpen = false,
  maxSelections,
  emptySelectionText = 'No fields selected',
  fieldFilter
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [filteredFields, setFilteredFields] = useState<FieldDefinition[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Keep track of selected IDs for easier operations
  const selectedFieldIds = selectedFields.map(field => field.id);
  
  // Refs for programmatic refresh
  const fieldListRef = useRef<SmartFieldsListRefType | null>(null);
  
  // Initial load of fields
  useEffect(() => {
    loadFields();
  }, []);
  
  // Filter fields based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredFields(fields);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = fields.filter(field =>
      field.label?.toLowerCase().includes(term) ||
      field.description?.toLowerCase().includes(term) ||
      field.component?.toLowerCase().includes(term) ||
      idMatchesQuery(field, term)
    );
    
    setFilteredFields(filtered);
  }, [searchTerm, fields]);
  
  // Function to load all fields
  const loadFields = async () => {
    setIsLoading(true);
    try {
      const fetchedFields = await getAllFieldComponents();
      
      // Apply fieldFilter if provided
      const filteredByType = fieldFilter 
        ? fetchedFields.filter(fieldFilter) 
        : fetchedFields;
      
      setFields(filteredByType);
      setFilteredFields(filteredByType);
      return filteredByType;
    } catch (error) {
      console.error('Failed to load fields:', error);
      toast({
        title: "Error",
        description: "Failed to load fields",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle refresh
  const handleRefresh = async (): Promise<FieldDefinition[]> => {
    setIsRefreshing(true);
    try {
      const refreshedFields = await loadFields();
      return refreshedFields || [];
    } catch (error) {
      console.error('Error refreshing fields:', error);
      return [];
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Toggle selection of a field
  const toggleFieldSelection = (field: FieldDefinition) => {
    const isSelected = selectedFieldIds.includes(field.id);
    
    if (isSelected) {
      // Remove from selection
      const updatedFields = selectedFields.filter(f => f.id !== field.id);
      onFieldsChange(updatedFields);
    } else {
      // Add to selection if not exceeding max
      if (maxSelections && selectedFields.length >= maxSelections) {
        toast({
          title: "Maximum Selections Reached",
          description: `You can only select up to ${maxSelections} fields`,
          variant: "destructive",
        });
        return;
      }
      
      onFieldsChange([...selectedFields, field]);
    }
  };
  
  // Remove a single field from selection
  const removeField = (fieldId: string) => {
    const updatedFields = selectedFields.filter(f => f.id !== fieldId);
    onFieldsChange(updatedFields);
  };
  
  // Handle create field action
  const handleCreateField = () => {
    setOpen(false);
    if (onCreateField) {
      onCreateField();
    } else {
      toast({
        title: "Create New Field",
        description: "Please implement the field creation flow",
      });
    }
  };
  
  // Get style by component type
  const getComponentStyle = (componentType: string) => {
    const types = {
      'text': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
      'number': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
      'select': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
      'checkbox': { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' },
      'radio': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
      'date': { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800' },
      'textarea': { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' },
      'toggle': { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-200 dark:border-pink-800' },
      'file': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
      'richtext': { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
      'multiselect': { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800' },
      'slider': { bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-700 dark:text-lime-300', border: 'border-lime-200 dark:border-lime-800' },
      'signature': { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800' },
      'calendar': { bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-200 dark:border-sky-800' },
      'autocomplete': { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
      'color': { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/30', text: 'text-fuchsia-700 dark:text-fuchsia-300', border: 'border-fuchsia-200 dark:border-fuchsia-800' },
    };

    // Default to a neutral color if the component type isn't recognized
    return types[componentType.toLowerCase()] || { 
      bg: 'bg-gray-100 dark:bg-gray-900/30', 
      text: 'text-gray-700 dark:text-gray-300', 
      border: 'border-gray-200 dark:border-gray-800' 
    };
  };
  
  // Function to render selected fields in the compact view
  const renderSelectedFields = () => {
    if (selectedFields.length === 0) {
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400 italic">
          {emptySelectionText}
        </div>
      );
    }
    
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {selectedFields.map(field => {
          const componentStyle = getComponentStyle(field.component);
          
          return (
            <Badge 
              key={field.id} 
              className={`
                flex items-center gap-1.5 py-1.5 px-3
                ${componentStyle.bg} ${componentStyle.text} ${componentStyle.border}
              `}
            >
              <span className="flex items-center gap-1">
                <span className="max-w-[150px] truncate">{field.label}</span>
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeField(field.id);
                }}
                className="ml-1 rounded-full hover:bg-black/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className="w-full">
      {/* Selected fields display and trigger button */}
      <div className="space-y-2 w-full">
        <div 
className={`
    flex items-center justify-between w-full p-3
    bg-gray-50 dark:bg-gray-800 
    border-border 
    rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700
    transition-colors
  `}
  onClick={() => setOpen(true)}
>
  <div className="flex-1">
    {renderSelectedFields()}
  </div>
  
  <div className="flex items-center space-x-2 ml-2">
    {triggerComponent ? (
      triggerComponent
    ) : (
      <Button
        variant={buttonVariant}
        size={buttonSize}
        className={buttonClassName}
      >
        {buttonLabel}
        <ChevronDown className="ml-1 h-4 w-4" />
      </Button>
    )}
  </div>
</div>
</div>

{/* Field selector dialog */}
<Dialog open={open} onOpenChange={setOpen}>
<DialogContent className="p-0 border-gray-200 dark:border-gray-700 sm:max-w-[90vw] sm:max-h-[90dvh]">
  <DialogHeader className="px-6 py-4 border-b border-border">
    <div className="flex items-center justify-between">
      <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        {dialogTitle}
      </DialogTitle>
      <div className="flex items-center space-x-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  </DialogHeader>
  
  <div className="p-6">
    {/* Search and selected count */}
    <div className="flex items-center justify-between mb-4">
      <div className="relative w-full sm:w-64 md:w-72">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          className="pl-10 pr-4 py-2 border-gray-200 dark:border-gray-700 bg-textured"
          placeholder="Search fields..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      <div className="ml-4 text-sm text-gray-500 dark:text-gray-400">
        {selectedFields.length} selected
        {maxSelections && ` / ${maxSelections}`}
      </div>
    </div>
    
    {/* Selected fields */}
    {selectedFields.length > 0 && (
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Selected Fields</h4>
        <div className="flex flex-wrap gap-2">
          {selectedFields.map(field => {
            const componentStyle = getComponentStyle(field.component);
            
            return (
              <Badge 
                key={field.id} 
                className={`
                  flex items-center gap-1.5 py-1.5 px-3
                  ${componentStyle.bg} ${componentStyle.text} ${componentStyle.border}
                `}
              >
                <span className="flex items-center gap-1">
                  <span>{field.label}</span>
                  <span className="text-xs opacity-75">({field.component})</span>
                </span>
                <button
                  onClick={() => removeField(field.id)}
                  className="ml-1 rounded-full hover:bg-black/20 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      </div>
    )}
    
    {/* Available fields */}
    <div>
      <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Available Fields</h4>
      <ScrollArea className="h-[400px] rounded-md border-border">
        {isLoading ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            Loading fields...
          </div>
        ) : filteredFields.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            No fields found
            {searchTerm && ` for "${searchTerm}"`}
          </div>
        ) : (
          <div className="p-2">
            {filteredFields.map(field => {
              const isSelected = selectedFieldIds.includes(field.id);
              const componentStyle = getComponentStyle(field.component);
              
              return (
                <div 
                  key={field.id}
                  className={`
                    flex items-center justify-between p-3 mb-2 rounded-lg cursor-pointer
                    ${isSelected 
                      ? `${componentStyle.bg} border ${componentStyle.border}` 
                      : `bg-textured border-border hover:bg-gray-50 dark:hover:bg-gray-700`
                    }
                  `}
                  onClick={() => toggleFieldSelection(field)}
                >
                  <div className="flex items-center space-x-3">
                    <Checkbox 
                      checked={isSelected}
                      onCheckedChange={() => toggleFieldSelection(field)}
                      className={isSelected ? `${componentStyle.text} border-0` : ""}
                    />
                    
                    <div>
                      <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {field.label}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <Badge 
                          className={`
                            ${componentStyle.bg} ${componentStyle.text} ${componentStyle.border}
                            text-xs capitalize
                          `}
                        >
                          {field.component}
                        </Badge>
                        {field.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                            {field.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    {field.required && (
                      <Badge variant="outline" className="text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
                        Required
                      </Badge>
                    )}
                    {isSelected && (
                      <div className="flex items-center justify-center h-6 w-6 bg-indigo-500 dark:bg-indigo-600 rounded-full text-white">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
    
    {/* Footer actions */}
    <div className="flex justify-between mt-6">
      {showCreateOption && (
        <Button 
          variant="outline" 
          onClick={handleCreateField}
          className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
        >
          <Plus className="h-4 w-4" /> New Field
        </Button>
      )}
      
      <div className="space-x-2">
        <Button variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button 
          onClick={() => setOpen(false)}
          className="bg-indigo-500 hover:bg-indigo-600"
        >
          Done
        </Button>
      </div>
    </div>
  </div>
</DialogContent>
</Dialog>
</div>
);
};

// Static refresh method
MultiFieldSelector.refresh = async (): Promise<FieldDefinition[]> => {
return Promise.resolve([]);
};

export default MultiFieldSelector;

// Usage examples:
// 1. Basic usage with default button
// const [selectedFields, setSelectedFields] = useState<FieldDefinition[]>([]);
// 
// <MultiFieldSelector
//   selectedFields={selectedFields}
//   onFieldsChange={setSelectedFields}
// />

// 2. With field type filter - only show text fields
// <MultiFieldSelector
//   selectedFields={selectedFields}
//   onFieldsChange={setSelectedFields}
//   fieldFilter={(field) => field.component === 'text'}
// />

// 3. With maximum selection limit
// <MultiFieldSelector
//   selectedFields={selectedFields}
//   onFieldsChange={setSelectedFields}
//   maxSelections={5}
//   emptySelectionText="Select form fields"
// />

// 4. Custom styling
// <MultiFieldSelector
//   selectedFields={selectedFields}
//   onFieldsChange={setSelectedFields}
//   buttonLabel="Add Fields"
//   buttonVariant="default"
//   buttonClassName="bg-indigo-500 text-white"
// />

// 5. Integration with form builder
// const [formFields, setFormFields] = useState<FieldDefinition[]>([]);
// 
// const handleFieldsChange = (fields: FieldDefinition[]) => {
//   setFormFields(fields);
//   // Additional logic to update form structure
// };
// 
// <MultiFieldSelector
//   selectedFields={formFields}
//   onFieldsChange={handleFieldsChange}
//   dialogTitle="Form Fields"
//   maxSelections={10}
// />
'use client';
import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Check, ChevronDown, RefreshCw, FormInput, Pencil, Copy, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Card, 
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'motion/react';

import { FieldDefinition } from '@/types/customAppTypes';
import { getAllFieldComponents, getFieldComponentById } from '@/lib/redux/app-builder/service';

// Define type for fieldIds
type FieldId = string;

type SmartFieldListRefType = {
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
  onRefreshField?: (field: FieldDefinition) => void;
  onEditField?: (field: FieldDefinition) => void;
  onDuplicateField?: (field: FieldDefinition) => void;
  triggerComponent?: React.ReactNode;
  defaultOpen?: boolean;
  maxSelections?: number;
  emptySelectionText?: string;
  showPrettySelection?: boolean;
  selectedDisplayColumns?: number;
  selectionCardClassName?: string;
}

/**
 * An enhanced component that allows selecting multiple fields with a pretty display
 */
const EnhancedMultiFieldSelector: React.FC<MultiFieldSelectorProps> & {
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
  onRefreshField,
  onEditField,
  onDuplicateField,
  triggerComponent,
  defaultOpen = false,
  maxSelections,
  emptySelectionText = 'No fields selected',
  showPrettySelection = true,
  selectedDisplayColumns = 1,
  selectionCardClassName = '',
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [filteredFields, setFilteredFields] = useState<FieldDefinition[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [displayMode, setDisplayMode] = useState<'compact' | 'cards'>('compact');
  
  // Keep track of selected IDs for easier operations
  const selectedFieldIds = selectedFields.map(field => field.id);
  
  // Refs for programmatic refresh
  const fieldListRef = useRef<SmartFieldListRefType | null>(null);
  
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
      field.id?.toLowerCase().includes(term) ||
      field.component?.toLowerCase().includes(term)
    );
    
    setFilteredFields(filtered);
  }, [searchTerm, fields]);
  
  // Function to load all fields
  const loadFields = async () => {
    setIsLoading(true);
    try {
      const fetchedFields = await getAllFieldComponents();
      setFields(fetchedFields);
      setFilteredFields(fetchedFields);
      return fetchedFields;
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
  
  // Handle refresh for a specific field
  const handleRefreshField = (field: FieldDefinition) => {
    if (onRefreshField) {
      onRefreshField(field);
    } else {
      toast({
        title: "Refresh Field",
        description: `Refreshing field "${field.label}"`,
      });
    }
  };
  
  // Handle edit for a specific field
  const handleEditField = (field: FieldDefinition, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    
    if (onEditField) {
      onEditField(field);
    } else {
      toast({
        title: "Edit Field",
        description: `Editing field "${field.label}"`,
      });
    }
  };
  
  // Handle duplicate for a specific field
  const handleDuplicateField = (field: FieldDefinition, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    
    if (onDuplicateField) {
      onDuplicateField(field);
    } else {
      toast({
        title: "Duplicate Field",
        description: `Duplicating field "${field.label}"`,
      });
    }
  };
  
  // Get component icon and color based on field type
  const getFieldTypeInfo = (componentType: string | undefined) => {
    const defaultIcon = <FormInput className="h-4 w-4" />;
    const defaultColor = 'purple';
    
    if (!componentType) return { icon: defaultIcon, color: defaultColor };
    
    const componentTypeLower = componentType.toLowerCase();
    
    // Define icons and colors for different field types
    if (componentTypeLower.includes('text')) {
      return { icon: <FormInput className="h-4 w-4" />, color: 'purple' };
    } else if (componentTypeLower.includes('select')) {
      return { icon: <Search className="h-4 w-4" />, color: 'blue' };
    } else if (componentTypeLower.includes('checkbox')) {
      return { icon: <Checkbox className="h-4 w-4" />, color: 'amber' };
    } else if (componentTypeLower.includes('date')) {
      return { icon: <div className="text-xs font-bold">📅</div>, color: 'emerald' };
    }
    
    return { icon: defaultIcon, color: defaultColor };
  };
  
  // Function to render compact selection chips
  const renderCompactSelection = () => {
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
          const { color } = getFieldTypeInfo(field.component);
          return (
            <Badge 
              key={field.id} 
              className={`
                flex items-center gap-1.5 py-1.5 px-3
                bg-${color}-500 hover:bg-${color}-600 text-white
              `}
            >
              <span className="flex items-center gap-1">
                <FormInput className="h-3 w-3" />
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
  
  // Function to render pretty card-based selection
  const renderPrettySelection = () => {
    if (selectedFields.length === 0) {
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400 italic p-3">
          {emptySelectionText}
        </div>
      );
    }
    
    return (
      <div className={`grid grid-cols-1 md:grid-cols-${selectedDisplayColumns} gap-3`}>
        <AnimatePresence mode="popLayout">
          {selectedFields.map(field => {
            const { icon, color } = getFieldTypeInfo(field.component);
            
            return (
              <motion.div
                key={field.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                layout
              >
                <Card 
                  className={`
                    border border-${color}-200 dark:border-${color}-700 
                    bg-${color}-50 dark:bg-${color}-900/10
                    hover:shadow-md transition-shadow duration-200
                    overflow-hidden
                    ${selectionCardClassName}
                  `}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 bg-${color}-100 dark:bg-${color}-800 rounded-md text-${color}-600 dark:text-${color}-300`}>
                          {icon}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{field.label}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{field.component || 'Custom Field'}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-more-vertical">
                                <circle cx="12" cy="12" r="1"></circle>
                                <circle cx="12" cy="5" r="1"></circle>
                                <circle cx="12" cy="19" r="1"></circle>
                              </svg>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => handleEditField(field, e)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => handleDuplicateField(field, e)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => removeField(field.id)}>
                              <Trash className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    
                    {field.description && (
                      <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                        {field.description}
                      </div>
                    )}
                  </CardContent>
                  
                  <CardFooter className={`flex justify-between p-2 border-t border-${color}-200 dark:border-${color}-700 bg-${color}-100/50 dark:bg-${color}-900/20`}>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={`text-${color}-600 dark:text-${color}-400 text-xs px-2 py-1 h-auto`}
                      onClick={() => handleRefreshField(field)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Refresh
                    </Button>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 text-xs px-2 py-1 h-auto"
                      onClick={() => removeField(field.id)}
                    >
                      <X className="h-3 w-3" />
                      Remove
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
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
            {renderCompactSelection()}
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
        
        {/* Pretty Selection Cards (if enabled) */}
        {showPrettySelection && selectedFields.length > 0 && (
          <div className="mt-3">
            {renderPrettySelection()}
          </div>
        )}
      </div>
      
      {/* Field selector dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 border-gray-200 dark:border-gray-700 sm:max-w-[90vw] sm:max-h-[90dvh]">
          <DialogHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                <FormInput className="h-5 w-5 mr-2 text-purple-500" />
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
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
              
              <div className="flex space-x-4 items-center">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedFields.length} selected
                  {maxSelections && ` / ${maxSelections}`}
                </div>
                
                <Tabs value={displayMode} onValueChange={(value) => setDisplayMode(value as 'compact' | 'cards')}>
                  <TabsList className="h-8">
                    <TabsTrigger value="compact" className="text-xs h-7 px-2">Compact</TabsTrigger>
                    <TabsTrigger value="cards" className="text-xs h-7 px-2">Cards</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
            
            {/* Selected fields */}
            {selectedFields.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 flex items-center">
                  <FormInput className="h-4 w-4 mr-1 text-purple-500" />
                  Selected Fields
                </h4>
                
                {displayMode === 'compact' ? (
                  <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border-border">
                    {selectedFields.map(field => {
                      const { color } = getFieldTypeInfo(field.component);
                      return (
                        <Badge 
                          key={field.id} 
                          className={`
                            flex items-center gap-1.5 py-1.5 px-3
                            bg-${color}-500 hover:bg-${color}-600 text-white
                          `}
                        >
                          <span className="flex items-center gap-1">
                            <FormInput className="h-3 w-3" />
                            <span>{field.label}</span>
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
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {renderPrettySelection()}
                  </div>
                )}
              </div>
            )}
            
            {/* Available fields */}
            <div>
              <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300 flex items-center">
                <FormInput className="h-4 w-4 mr-1 text-purple-500" />
                Available Fields
              </h4>
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
                      const { icon, color } = getFieldTypeInfo(field.component);
                      
                      return (
                        <div 
                          key={field.id}
                          className={`
                            flex items-center justify-between p-3 mb-2 rounded-lg cursor-pointer
                            ${isSelected 
                              ? `bg-${color}-50 dark:bg-${color}-900/30 border border-${color}-200 dark:border-${color}-800` 
                              : `bg-textured border-border hover:bg-gray-50 dark:hover:bg-gray-700`
                            }
                          `}
                          onClick={() => toggleFieldSelection(field)}
                        >
                          <div className="flex items-center space-x-3">
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={() => toggleFieldSelection(field)}
                              className={isSelected ? `text-${color}-500` : ""}
                            />
                            
                            <div className={`rounded-lg flex items-center justify-center bg-${color}-100 dark:bg-${color}-800 p-2 text-${color}-600 dark:text-${color}-300`}>
                              {icon}
                            </div>
                            
                            <div>
                              <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                {field.label}
                              </h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                                {field.component || 'Custom Field'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex space-x-2 items-center">
                            {field.description && (
                              <Badge variant="outline" className={`text-xs bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-800`}>
                                Has Description
                              </Badge>
                            )}
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-6 w-6 rounded-full text-${color}-500 hover:text-${color}-600 hover:bg-${color}-50 dark:hover:bg-${color}-900/20`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditField(field);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            
                            {isSelected && (
                              <div className={`flex items-center justify-center h-6 w-6 bg-${color}-500 dark:bg-${color}-600 rounded-full text-white`}>
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
                  className="text-purple-600 border-purple-200 hover:bg-purple-50 hover:text-purple-700"
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
                  className="bg-purple-500 hover:bg-purple-600 text-white"
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
EnhancedMultiFieldSelector.refresh = async (): Promise<FieldDefinition[]> => {
  return Promise.resolve([]);
};

export default EnhancedMultiFieldSelector;
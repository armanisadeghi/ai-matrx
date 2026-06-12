'use client';
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import SmartFieldsList, { SmartFieldsListRefType } from './SmartFieldsList';
import { FieldDefinition } from '@/types/customAppTypes';

// Define type for fieldIds
type FieldId = string;

export type FieldSelectorOverlayProps = {
  onFieldSelected: (field: FieldDefinition) => void;
  buttonLabel?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  buttonClassName?: string;
  dialogTitle?: string;
  showCreateOption?: boolean;
  onCreateField?: () => void;
  onEditField?: (field: FieldDefinition) => void;
  onDuplicateField?: (field: FieldDefinition) => void;
  onDeleteField?: (field: FieldDefinition) => void;
  triggerComponent?: React.ReactNode;
  defaultOpen?: boolean;
  isFullscreen?: boolean;
  fieldIds?: FieldId[];
  onRefreshComplete?: (fields: FieldDefinition[]) => void;
  hideActions?: boolean;
}

/**
 * An overlay component that allows selecting a field from a list
 * Can be triggered by a button or custom trigger component
 */
const FieldSelectorOverlay = forwardRef<SmartFieldsListRefType, FieldSelectorOverlayProps>(({
  onFieldSelected,
  buttonLabel = 'Select Field',
  buttonVariant = 'default',
  buttonSize = 'default',
  buttonClassName = '',
  dialogTitle = 'Select a Field',
  showCreateOption = true,
  onCreateField,
  onEditField,
  onDuplicateField,
  onDeleteField,
  triggerComponent,
  defaultOpen = false,
  isFullscreen = false,
  fieldIds,
  onRefreshComplete,
  hideActions = false
}, ref) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fieldListRef = useRef<SmartFieldsListRefType | null>(null);

  // Forward the ref to the internal SmartFieldsList component
  useImperativeHandle(ref, () => ({
    refresh: async (specificFieldIds?: FieldId[]) => {
      if (fieldListRef.current && typeof fieldListRef.current.refresh === 'function') {
        return fieldListRef.current.refresh(specificFieldIds);
      }
      return [];
    }
  }));

  const handleFieldSelect = (field: FieldDefinition) => {
    if (onFieldSelected) {
      onFieldSelected(field);
      setOpen(false);
      toast({
        title: "Field Selected",
        description: `You selected "${field.label}"`,
      });
    }
  };

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

  // Handle refresh
  const handleRefresh = async (): Promise<FieldDefinition[]> => {
    if (fieldListRef.current && typeof fieldListRef.current.refresh === 'function') {
      setIsRefreshing(true);
      try {
        const refreshedFields = await fieldListRef.current.refresh(fieldIds);
        if (onRefreshComplete) {
          onRefreshComplete(refreshedFields);
        }
        return refreshedFields;
      } catch (error) {
        console.error('Error refreshing fields:', error);
        return [];
      } finally {
        setIsRefreshing(false);
      }
    }
    return [];
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerComponent ? (
          triggerComponent
        ) : (
          <Button 
            variant={buttonVariant} 
            size={buttonSize}
            className={buttonClassName}
          >
            {buttonLabel}
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent 
        className={`
          p-0 border-gray-200 dark:border-gray-700
          ${isFullscreen ? 'w-screen h-dvh max-w-none rounded-none' : 'sm:max-w-[90vw] max-h-[90dvh]'}
        `}
      >
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
        
        <div className={`overflow-y-auto p-6 ${isFullscreen ? 'h-[calc(100dvh-10rem)]' : 'max-h-[70dvh]'}`}>
          <SmartFieldsList
            ref={fieldListRef}
            onSelectField={handleFieldSelect}
            showCreateButton={showCreateOption}
            onCreateField={handleCreateField}
            onEditField={onEditField}
            onDuplicateField={onDuplicateField}
            onDeleteField={onDeleteField}
            className="pb-4"
            fieldIds={fieldIds}
            onRefreshComplete={onRefreshComplete}
            hideActions={hideActions}
            selectable={true}
            multiSelect={false}
            onSelectionChange={() => {}}
          />
        </div>
        
        <div className="px-6 py-4 border-t border-border bg-gray-50 dark:bg-gray-800 flex justify-end space-x-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

FieldSelectorOverlay.displayName = 'FieldSelectorOverlay';

export default FieldSelectorOverlay;

// Usage examples:
// 1. Basic usage with default button
// <FieldSelectorOverlay
//   onFieldSelected={(field) => console.log('Selected field:', field)}
// />

// 2. Custom button label and styling
// <FieldSelectorOverlay
//   buttonLabel="Choose a Field"
//   buttonVariant="outline"
//   buttonSize="lg"
//   buttonClassName="border-indigo-500 text-indigo-500"
//   onFieldSelected={handleFieldSelected}
// />

// 3. Custom trigger component
// <FieldSelectorOverlay
//   triggerComponent={
//     <div className="cursor-pointer p-4 border border-dashed border-gray-300 rounded-lg text-center">
//       <p>Click to select a field</p>
//     </div>
//   }
//   onFieldSelected={handleFieldSelected}
// />

// 4. With field creation handling
// <FieldSelectorOverlay
//   onFieldSelected={handleFieldSelected}
//   showCreateOption={true}
//   onCreateField={() => router.push('/fields/create')}
// />

// 5. Fullscreen mode
// <FieldSelectorOverlay
//   isFullscreen={true}
//   dialogTitle="Browse All Fields"
//   onFieldSelected={handleFieldSelected}
// />
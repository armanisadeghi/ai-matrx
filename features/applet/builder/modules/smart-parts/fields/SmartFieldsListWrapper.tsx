'use client';
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import SmartFieldsList, { SmartFieldsListRefType } from './SmartFieldsList';
import { FieldDefinition } from '@/types/customAppTypes';

// Define type for fieldIds
type FieldId = string;

export type SmartFieldsListWrapperProps = {
  isOverlay?: boolean;
  onSelectField?: (field: FieldDefinition) => void;
  showCreateButton?: boolean;
  onCreateField?: () => void;
  onEditField?: (field: FieldDefinition) => void;
  onDuplicateField?: (field: FieldDefinition) => void;
  onDeleteField?: (field: FieldDefinition) => void;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
  fieldIds?: FieldId[];
  onRefreshComplete?: (fields: FieldDefinition[]) => void;
  hideActions?: boolean;
  selectable?: boolean;
  multiSelect?: boolean;
  selectedFieldIds?: string[];
  onSelectionChange?: (fields: FieldDefinition[]) => void;
  overlayTitle?: string;
};

/**
 * A component that wraps SmartFieldsList and can display it either as an overlay or inline
 */
const SmartFieldsListWrapper = forwardRef<SmartFieldsListRefType, SmartFieldsListWrapperProps>(({
  isOverlay = false,
  onSelectField,
  showCreateButton = true,
  onCreateField,
  onEditField,
  onDuplicateField,
  onDeleteField,
  isOpen = false,
  onClose,
  className = '',
  fieldIds,
  onRefreshComplete,
  hideActions = false,
  selectable = false,
  multiSelect = false,
  selectedFieldIds = [],
  onSelectionChange,
  overlayTitle = "Select a Field"
}, ref) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Use proper typing for the ref
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

  // Provide default onSelectField that closes the overlay
  const handleSelectField = (field: FieldDefinition) => {
    if (onSelectField) {
      onSelectField(field);
    }
    if (isOverlay && onClose && !multiSelect) {
      onClose();
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

  // If not an overlay, just render the SmartFieldsList component
  if (!isOverlay) {
    return (
      <div className={className}>
        <SmartFieldsList
          ref={fieldListRef}
          onSelectField={handleSelectField}
          showCreateButton={showCreateButton}
          onCreateField={onCreateField}
          onEditField={onEditField}
          onDuplicateField={onDuplicateField}
          onDeleteField={onDeleteField}
          className="pb-6"
          fieldIds={fieldIds}
          onRefreshComplete={onRefreshComplete}
          hideActions={hideActions}
          selectable={selectable}
          multiSelect={multiSelect}
          selectedFieldIds={selectedFieldIds}
          onSelectionChange={onSelectionChange}
        />
      </div>
    );
  }

  // If it's an overlay, render a modal
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, type: 'spring', damping: 25 }}
            className={`
              fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
              w-[calc(100%-2rem)] md:w-[90%] lg:w-[80%] xl:w-[70%] max-w-6xl
              max-h-[calc(100dvh-4rem)] flex flex-col
              bg-textured rounded-xl shadow-2xl z-50
              ${className}
            `}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {overlayTitle}
              </h2>
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
                  onClick={onClose}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <SmartFieldsList
                ref={fieldListRef}
                onSelectField={handleSelectField}
                showCreateButton={showCreateButton}
                onCreateField={onCreateField}
                onEditField={onEditField}
                onDuplicateField={onDuplicateField}
                onDeleteField={onDeleteField}
                className="pb-6"
                fieldIds={fieldIds}
                onRefreshComplete={onRefreshComplete}
                hideActions={hideActions}
                selectable={selectable}
                multiSelect={multiSelect}
                selectedFieldIds={selectedFieldIds}
                onSelectionChange={onSelectionChange}
              />
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-border flex justify-end">
              {multiSelect ? (
                <Button 
                  variant="default"
                  onClick={onClose}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white"
                >
                  Done
                </Button>
              ) : (
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

SmartFieldsListWrapper.displayName = 'SmartFieldsListWrapper';

export default SmartFieldsListWrapper;
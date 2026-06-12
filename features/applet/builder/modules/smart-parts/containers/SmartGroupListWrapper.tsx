'use client';
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import SmartContainerList, { SmartContainerListRefType } from './SmartContainerList';
import { ComponentGroup } from '@/types/customAppTypes';

// Define type for groupIds
type GroupId = string;

export type SmartGroupListWrapperProps = {
  isOverlay?: boolean;
  onSelectGroup: (group: ComponentGroup) => void;
  showCreateButton?: boolean;
  onCreateGroup?: () => void;
  onRefreshGroup?: (group: ComponentGroup) => void;
  onDeleteGroup?: (group: ComponentGroup) => void;
  onEditGroup?: (group: ComponentGroup) => void;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
  groupIds?: GroupId[];
  onRefreshComplete?: (groups: ComponentGroup[]) => void;
};

/**
 * A component that wraps SmartGroupList and can display it either as an overlay or inline
 */
const SmartGroupListWrapper = forwardRef<SmartContainerListRefType, SmartGroupListWrapperProps>(({
  isOverlay = false,
  onSelectGroup,
  showCreateButton = true,
  onCreateGroup,
  onRefreshGroup,
  onDeleteGroup,
  onEditGroup,
  isOpen = false,
  onClose,
  className = '',
  groupIds,
  onRefreshComplete
}, ref) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Use proper typing for the ref
  const groupListRef = useRef<SmartContainerListRefType | null>(null);

  // Forward the ref to the internal SmartGroupList component
  useImperativeHandle(ref, () => ({
    refresh: async (specificGroupIds?: GroupId[]) => {
      if (groupListRef.current && typeof groupListRef.current.refresh === 'function') {
        return groupListRef.current.refresh(specificGroupIds);
      }
      return [];
    }
  }));

  // Provide default onSelectGroup that closes the overlay
  const handleSelectGroup = (group: ComponentGroup) => {
    if (onSelectGroup) {
      onSelectGroup(group);
    }
    if (isOverlay && onClose) {
      onClose();
    }
  };

  // Handle refresh
  const handleRefresh = async (): Promise<ComponentGroup[]> => {
    if (groupListRef.current && typeof groupListRef.current.refresh === 'function') {
      setIsRefreshing(true);
      try {
        const refreshedGroups = await groupListRef.current.refresh(groupIds);
        if (onRefreshComplete) {
          onRefreshComplete(refreshedGroups);
        }
        return refreshedGroups;
      } catch (error) {
        console.error('Error refreshing groups:', error);
        return [];
      } finally {
        setIsRefreshing(false);
      }
    }
    return [];
  };

  // If not an overlay, just render the SmartGroupList component
  if (!isOverlay) {
    return (
      <div className={className}>
        <SmartContainerList
          ref={groupListRef}
          onSelectGroup={handleSelectGroup}
          onRefreshGroup={onRefreshGroup}
          onDeleteGroup={onDeleteGroup}
          onEditGroup={onEditGroup}
          showCreateButton={showCreateButton}
          onCreateGroup={onCreateGroup}
          groupIds={groupIds}
          onRefreshComplete={onRefreshComplete}
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
                Select a Group
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
              <SmartContainerList
                ref={groupListRef}
                onSelectGroup={handleSelectGroup}
                onRefreshGroup={onRefreshGroup}
                onDeleteGroup={onDeleteGroup}
                onEditGroup={onEditGroup}
                showCreateButton={showCreateButton}
                onCreateGroup={onCreateGroup}
                className="pb-6"
                groupIds={groupIds}
                onRefreshComplete={onRefreshComplete}
              />
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-border flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

SmartGroupListWrapper.displayName = 'SmartGroupListWrapper';

export default SmartGroupListWrapper;
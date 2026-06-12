'use client';
import React, { useState, useRef } from 'react';
import { X, RefreshCw, LayersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import SmartContainerList from './SmartContainerList';
import { ComponentGroup } from '@/types/customAppTypes';

// Define type for groupIds
type GroupId = string;

type SmartGroupListRefType = {
  refresh: (specificGroupIds?: GroupId[]) => Promise<ComponentGroup[]>;
};

type GroupSelectorOverlayProps = {
  onGroupSelected: (group: ComponentGroup) => void;
  buttonLabel?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  buttonClassName?: string;
  dialogTitle?: string;
  showCreateOption?: boolean;
  onCreateGroup?: () => void;
  onRefreshGroup?: (group: ComponentGroup) => void;
  onDeleteGroup?: (group: ComponentGroup) => void;
  onEditGroup?: (group: ComponentGroup) => void;
  triggerComponent?: React.ReactNode;
  defaultOpen?: boolean;
  isFullscreen?: boolean;
  groupIds?: GroupId[];
  onRefreshComplete?: (groups: ComponentGroup[]) => void;
}

/**
 * An overlay component that allows selecting a group from a list
 * Can be triggered by a button or custom trigger component
 */
const GroupSelectorOverlay: React.FC<GroupSelectorOverlayProps> & {
  refresh: () => Promise<ComponentGroup[]>;
} = ({
  onGroupSelected,
  buttonLabel = 'Select Group',
  buttonVariant = 'default',
  buttonSize = 'default',
  buttonClassName = '',
  dialogTitle = 'Select a Group',
  showCreateOption = true,
  onCreateGroup,
  onRefreshGroup,
  onDeleteGroup,
  onEditGroup,
  triggerComponent,
  defaultOpen = false,
  isFullscreen = false,
  groupIds,
  onRefreshComplete
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const groupListRef = useRef<SmartGroupListRefType | null>(null);

  const handleGroupSelect = (group: ComponentGroup) => {
    if (onGroupSelected) {
      onGroupSelected(group);
      setOpen(false);
      toast({
        title: "Group Selected",
        description: `You selected "${group.label}"`,
      });
      
      // Console log the selected container information
      console.log('Selected container:', group);
    }
  };

  const handleCreateGroup = () => {
    setOpen(false);
    if (onCreateGroup) {
      onCreateGroup();
    } else {
      toast({
        title: "Create New Group",
        description: "Please implement the group creation flow",
      });
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
          <SmartContainerList
            ref={groupListRef}
            onSelectGroup={handleGroupSelect}
            onRefreshGroup={onRefreshGroup}
            onDeleteGroup={onDeleteGroup}
            onEditGroup={onEditGroup}
            showCreateButton={showCreateOption}
            onCreateGroup={handleCreateGroup}
            className="pb-4"
            groupIds={groupIds}
            onRefreshComplete={onRefreshComplete}
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
};

// Static refresh method
GroupSelectorOverlay.refresh = async (): Promise<ComponentGroup[]> => {
  return Promise.resolve([]);
};

export default GroupSelectorOverlay;

// Usage examples:
// 1. Basic usage with default button
// <GroupSelectorOverlay
//   onGroupSelected={(group) => console.log('Selected group:', group)}
// />

// 2. Custom button label and styling
// <GroupSelectorOverlay
//   buttonLabel="Choose a Group"
//   buttonVariant="outline"
//   buttonSize="lg"
//   buttonClassName="border-amber-500 text-amber-500"
//   onGroupSelected={handleGroupSelected}
// />

// 3. Custom trigger component
// <GroupSelectorOverlay
//   triggerComponent={
//     <div className="cursor-pointer p-4 border border-dashed border-gray-300 rounded-lg text-center">
//       <p>Click to select a group</p>
//     </div>
//   }
//   onGroupSelected={handleGroupSelected}
// />

// 4. With group creation handling
// <GroupSelectorOverlay
//   onGroupSelected={handleGroupSelected}
//   showCreateOption={true}
//   onCreateGroup={() => router.push('/groups/create')}
// />

// 5. Fullscreen mode
// <GroupSelectorOverlay
//   isFullscreen={true}
//   dialogTitle="Browse All Groups"
//   onGroupSelected={handleGroupSelected}
// />

// 6. With specific group IDs and refresh callback
// <GroupSelectorOverlay
//   groupIds={['group-1', 'group-2', 'group-3']}
//   onRefreshComplete={(groups) => console.log('Refreshed groups:', groups)}
//   onGroupSelected={handleGroupSelected}
// />

// 7. Used with FieldComponentCard
// <FieldComponentCard
//   component={component}
//   isSelected={isSelected}
//   onEdit={handleEdit}
//   onDelete={handleDelete}
//   onDuplicate={handleDuplicate}
//   onPublicToggle={handlePublicToggle}
//   onSelect={() => {
//     // Show the group selector overlay when a field card is clicked
//     setSelectedFieldId(component.id);
//     setShowGroupSelector(true);
//   }}
// />
// {showGroupSelector && (
//   <GroupSelectorOverlay
//     defaultOpen={true}
//     dialogTitle="Select Container for Field"
//     onGroupSelected={(group) => {
//       console.log(`Assigning field ${selectedFieldId} to container ${group.id}`);
//       setShowGroupSelector(false);
//     }}
//   />
// )}
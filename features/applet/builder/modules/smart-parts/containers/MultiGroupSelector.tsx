'use client';
import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Check, ChevronDown, RefreshCw, LayersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ComponentGroup } from '@/types/customAppTypes';
import { getAllComponentGroups, getComponentGroupById } from '@/lib/redux/app-builder/service';

// Define type for groupIds
type GroupId = string;

type SmartGroupListRefType = {
  refresh: (specificGroupIds?: GroupId[]) => Promise<ComponentGroup[]>;
};

type MultiGroupSelectorProps = {
  selectedGroups: ComponentGroup[];
  onGroupsChange: (groups: ComponentGroup[]) => void;
  buttonLabel?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  buttonClassName?: string;
  dialogTitle?: string;
  showCreateOption?: boolean;
  onCreateGroup?: () => void;
  onRefreshGroup?: (group: ComponentGroup) => void;
  triggerComponent?: React.ReactNode;
  defaultOpen?: boolean;
  maxSelections?: number;
  emptySelectionText?: string;
}

/**
 * A component that allows selecting multiple groups
 */
const MultiGroupSelector: React.FC<MultiGroupSelectorProps> & {
  refresh: () => Promise<ComponentGroup[]>;
} = ({
  selectedGroups = [],
  onGroupsChange,
  buttonLabel = 'Choose Groups',
  buttonVariant = 'outline',
  buttonSize = 'default',
  buttonClassName = '',
  dialogTitle = 'Select Groups',
  showCreateOption = true,
  onCreateGroup,
  onRefreshGroup,
  triggerComponent,
  defaultOpen = false,
  maxSelections,
  emptySelectionText = 'No groups selected'
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<ComponentGroup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Keep track of selected IDs for easier operations
  const selectedGroupIds = selectedGroups.map(group => group.id);
  
  // Refs for programmatic refresh
  const groupListRef = useRef<SmartGroupListRefType | null>(null);
  
  // Initial load of groups
  useEffect(() => {
    loadGroups();
  }, []);
  
  // Filter groups based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredGroups(groups);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = groups.filter(group => 
      group.label?.toLowerCase().includes(term) || 
      group.description?.toLowerCase().includes(term) ||
      group.id?.toLowerCase().includes(term) ||
      group.shortLabel?.toLowerCase().includes(term)
    );
    
    setFilteredGroups(filtered);
  }, [searchTerm, groups]);
  
  // Function to load all groups
  const loadGroups = async () => {
    setIsLoading(true);
    try {
      const fetchedGroups = await getAllComponentGroups();
      setGroups(fetchedGroups);
      setFilteredGroups(fetchedGroups);
      return fetchedGroups;
    } catch (error) {
      console.error('Failed to load groups:', error);
      toast({
        title: "Error",
        description: "Failed to load groups",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle refresh
  const handleRefresh = async (): Promise<ComponentGroup[]> => {
    setIsRefreshing(true);
    try {
      const refreshedGroups = await loadGroups();
      return refreshedGroups || [];
    } catch (error) {
      console.error('Error refreshing groups:', error);
      return [];
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Toggle selection of a group
  const toggleGroupSelection = (group: ComponentGroup) => {
    const isSelected = selectedGroupIds.includes(group.id);
    
    if (isSelected) {
      // Remove from selection
      const updatedGroups = selectedGroups.filter(g => g.id !== group.id);
      onGroupsChange(updatedGroups);
    } else {
      // Add to selection if not exceeding max
      if (maxSelections && selectedGroups.length >= maxSelections) {
        toast({
          title: "Maximum Selections Reached",
          description: `You can only select up to ${maxSelections} groups`,
          variant: "destructive",
        });
        return;
      }
      
      onGroupsChange([...selectedGroups, group]);
    }
  };
  
  // Remove a single group from selection
  const removeGroup = (groupId: string) => {
    const updatedGroups = selectedGroups.filter(g => g.id !== groupId);
    onGroupsChange(updatedGroups);
  };
  
  // Handle create group action
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
  
  // Handle refresh for a specific group
  const handleRefreshGroup = (group: ComponentGroup) => {
    if (onRefreshGroup) {
      onRefreshGroup(group);
    } else {
      toast({
        title: "Refresh Group",
        description: `Refreshing fields for "${group.label}"`,
      });
    }
  };
  
  // Function to render selected groups in the compact view
  const renderSelectedGroups = () => {
    if (selectedGroups.length === 0) {
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400 italic">
          {emptySelectionText}
        </div>
      );
    }
    
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {selectedGroups.map(group => (
          <Badge 
            key={group.id} 
            className="flex items-center gap-1.5 py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-white"
          >
            <span className="flex items-center gap-1">
              <LayersIcon className="h-3 w-3" />
              <span className="max-w-[150px] truncate">{group.label}</span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeGroup(group.id);
              }}
              className="ml-1 rounded-full hover:bg-black/20 p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    );
  };
  
  return (
    <div className="w-full">
      {/* Selected groups display and trigger button */}
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
            {renderSelectedGroups()}
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
      
      {/* Group selector dialog */}
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
                  placeholder="Search groups..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="ml-4 text-sm text-gray-500 dark:text-gray-400">
                {selectedGroups.length} selected
                {maxSelections && ` / ${maxSelections}`}
              </div>
            </div>
            
            {/* Selected groups */}
            {selectedGroups.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Selected Groups</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedGroups.map(group => (
                    <Badge 
                      key={group.id} 
                      className="flex items-center gap-1.5 py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      <span className="flex items-center gap-1">
                        <LayersIcon className="h-3 w-3" />
                        <span>{group.label}</span>
                      </span>
                      <button
                        onClick={() => removeGroup(group.id)}
                        className="ml-1 rounded-full hover:bg-black/20 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {/* Available groups */}
            <div>
              <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Available Groups</h4>
              <ScrollArea className="h-[400px] rounded-md border-border">
                {isLoading ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    Loading groups...
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    No groups found
                    {searchTerm && ` for "${searchTerm}"`}
                  </div>
                ) : (
                  <div className="p-2">
                    {filteredGroups.map(group => {
                      const isSelected = selectedGroupIds.includes(group.id);
                      return (
                        <div 
                          key={group.id}
                          className={`
                            flex items-center justify-between p-3 mb-2 rounded-lg cursor-pointer
                            ${isSelected 
                              ? `bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800` 
                              : `bg-textured border-border hover:bg-gray-50 dark:hover:bg-gray-700`
                            }
                          `}
                          onClick={() => toggleGroupSelection(group)}
                        >
                          <div className="flex items-center space-x-3">
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={() => toggleGroupSelection(group)}
                              className={isSelected ? "text-amber-500" : ""}
                            />
                            
                            <div className="rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-700 p-2">
                              <LayersIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                            </div>
                            
                            <div>
                              <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                {group.label}
                              </h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                                {group.description || group.id}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex space-x-2 items-center">
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {group.fields?.length || 0} fields
                            </div>
                            
                            {group.isPublic && (
                              <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                                Public
                              </Badge>
                            )}
                            
                            {group.fields && group.fields.length > 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-full text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRefreshGroup(group);
                                }}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            )}
                            
                            {isSelected && (
                              <div className="flex items-center justify-center h-6 w-6 bg-amber-500 dark:bg-amber-600 rounded-full text-white">
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
                  onClick={handleCreateGroup}
                  className="text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                >
                  <Plus className="h-4 w-4" /> New Group
                </Button>
              )}
              
              <div className="space-x-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => setOpen(false)}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
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

MultiGroupSelector.refresh = async (): Promise<ComponentGroup[]> => {
    return Promise.resolve([]);
  };
  
  export default MultiGroupSelector;
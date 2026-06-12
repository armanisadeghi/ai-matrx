'use client';
import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Check, ChevronDown, RefreshCw, BoxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CustomAppletConfig } from '@/types/customAppTypes';
import { getAllCustomAppletConfigs, getCustomAppletConfigById } from '@/lib/redux/app-builder/service/customAppletService';
import { ICON_OPTIONS, COLOR_VARIANTS } from '@/features/applet/styles/StyledComponents';
import { filterAndSortBySearch } from '@/utils/search-scoring';

// Define type for appletIds
type AppletId = string;

type SmartAppletListRefType = {
  refresh: (specificAppletIds?: AppletId[]) => Promise<CustomAppletConfig[]>;
};

type MultiAppletSelectorProps = {
  selectedApplets: CustomAppletConfig[];
  onAppletsChange: (applets: CustomAppletConfig[]) => void;
  buttonLabel?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  buttonClassName?: string;
  dialogTitle?: string;
  showCreateOption?: boolean;
  onCreateApplet?: () => void;
  triggerComponent?: React.ReactNode;
  defaultOpen?: boolean;
  maxSelections?: number;
  emptySelectionText?: string;
  shouldFetch?: boolean;
}

/**
 * A component that allows selecting multiple applets
 */
const MultiAppletSelector: React.FC<MultiAppletSelectorProps> & {
  refresh: () => Promise<CustomAppletConfig[]>;
} = ({
  selectedApplets = [],
  onAppletsChange,
  buttonLabel = 'Choose Applets',
  buttonVariant = 'outline',
  buttonSize = 'default',
  buttonClassName = '',
  dialogTitle = 'Select Applets',
  showCreateOption = true,
  onCreateApplet,
  triggerComponent,
  defaultOpen = false,
  maxSelections,
  emptySelectionText = 'No applets selected',
  shouldFetch = true,
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [applets, setApplets] = useState<CustomAppletConfig[]>([]);
  const [filteredApplets, setFilteredApplets] = useState<CustomAppletConfig[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Keep track of selected IDs for easier operations
  const selectedAppletIds = selectedApplets.map(applet => applet.id);
  
  // Refs for programmatic refresh
  const appletListRef = useRef<SmartAppletListRefType | null>(null);
  
  // Initial load of applets
  useEffect(() => {
    if (shouldFetch) {
      loadApplets();
    }
  }, [shouldFetch]);
  
  // Filter applets based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredApplets(applets);
      return;
    }
    
    const filtered = filterAndSortBySearch(applets, searchTerm, [
      { get: (a) => a.name, weight: 'title' },
      { get: (a) => a.slug, weight: 'subtitle' },
      { get: (a) => a.creator, weight: 'subtitle' },
      { get: (a) => a.description, weight: 'body' },
    ]);

    setFilteredApplets(filtered);
  }, [searchTerm, applets]);
  
  // Function to load all applets
  const loadApplets = async () => {
    setIsLoading(true);
    try {
      const fetchedApplets = await getAllCustomAppletConfigs();
      setApplets(fetchedApplets);
      setFilteredApplets(fetchedApplets);
    } catch (error) {
      console.error('Failed to load applets:', error);
      toast({
        title: "Error",
        description: "Failed to load applets",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle refresh
  const handleRefresh = async (): Promise<CustomAppletConfig[]> => {
    setIsRefreshing(true);
    try {
      await loadApplets();
      return applets;
    } catch (error) {
      console.error('Error refreshing applets:', error);
      return [];
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Toggle selection of an applet
  const toggleAppletSelection = (applet: CustomAppletConfig) => {
    const isSelected = selectedAppletIds.includes(applet.id);
    
    if (isSelected) {
      // Remove from selection
      const updatedApplets = selectedApplets.filter(a => a.id !== applet.id);
      onAppletsChange(updatedApplets);
    } else {
      // Add to selection if not exceeding max
      if (maxSelections && selectedApplets.length >= maxSelections) {
        toast({
          title: "Maximum Selections Reached",
          description: `You can only select up to ${maxSelections} applets`,
          variant: "destructive",
        });
        return;
      }
      
      onAppletsChange([...selectedApplets, applet]);
    }
  };
  
  // Remove a single applet from selection
  const removeApplet = (appletId: string) => {
    const updatedApplets = selectedApplets.filter(a => a.id !== appletId);
    onAppletsChange(updatedApplets);
  };
  
  // Handle create applet action
  const handleCreateApplet = () => {
    setOpen(false);
    if (onCreateApplet) {
      onCreateApplet();
    } else {
      toast({
        title: "Create New Applet",
        description: "Please implement the applet creation flow",
      });
    }
  };
  
  // Helper function to render the icon
  const renderIcon = (iconName: string | undefined) => {
    if (!iconName) return <BoxIcon className="h-4 w-4" />;
    
    const IconComponent = ICON_OPTIONS[iconName];
    if (!IconComponent) return <BoxIcon className="h-4 w-4" />;
    
    return <IconComponent className="h-4 w-4" />;
  };
  
  // Function to render selected applets in the compact view
  const renderSelectedApplets = () => {
    if (selectedApplets.length === 0) {
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400 italic">
          {emptySelectionText}
        </div>
      );
    }
    
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {selectedApplets.map(applet => (
          <Badge 
            key={applet.id} 
            className={`
              flex items-center gap-1.5 py-1.5 px-3
              ${COLOR_VARIANTS.buttonBg[applet.primaryColor || 'emerald']}
            `}
          >
            <span className="flex items-center gap-1">
              {renderIcon(applet.appletIcon)}
              <span className="max-w-[150px] truncate">{applet.name}</span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeApplet(applet.id);
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
      {/* Selected applets display and trigger button */}
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
            {renderSelectedApplets()}
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
      
      {/* Applet selector dialog */}
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
                  placeholder="Search applets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="ml-4 text-sm text-gray-500 dark:text-gray-400">
                {selectedApplets.length} selected
                {maxSelections && ` / ${maxSelections}`}
              </div>
            </div>
            
            {/* Selected applets */}
            {selectedApplets.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Selected Applets</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedApplets.map(applet => (
                    <Badge 
                      key={applet.id} 
                      className={`
                        flex items-center gap-1.5 py-1.5 px-3
                        ${COLOR_VARIANTS.buttonBg[applet.primaryColor || 'emerald']}
                      `}
                    >
                      <span className="flex items-center gap-1">
                        {renderIcon(applet.appletIcon)}
                        <span>{applet.name}</span>
                      </span>
                      <button
                        onClick={() => removeApplet(applet.id)}
                        className="ml-1 rounded-full hover:bg-black/20 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {/* Available applets */}
            <div>
              <h4 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Available Applets</h4>
              <ScrollArea className="h-[400px] rounded-md border-border">
                {isLoading ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    Loading applets...
                  </div>
                ) : filteredApplets.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    No applets found
                    {searchTerm && ` for "${searchTerm}"`}
                  </div>
                ) : (
                  <div className="p-2">
                    {filteredApplets.map(applet => {
                      const isSelected = selectedAppletIds.includes(applet.id);
                      return (
                        <div 
                          key={applet.id}
                          className={`
                            flex items-center justify-between p-3 mb-2 rounded-lg cursor-pointer
                            ${isSelected 
                              ? `bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800` 
                              : `bg-textured border-border hover:bg-gray-50 dark:hover:bg-gray-700`
                            }
                          `}
                          onClick={() => toggleAppletSelection(applet)}
                        >
                          <div className="flex items-center space-x-3">
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={() => toggleAppletSelection(applet)}
                              className={isSelected ? "text-emerald-500" : ""}
                            />
                            
                            <div className={`
                              rounded-lg flex items-center justify-center bg-white/90 dark:bg-gray-800/90 p-2
                            `}>
                              {renderIcon(applet.appletIcon)}
                            </div>
                            
                            <div>
                              <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                {applet.name}
                              </h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                                {applet.description || applet.slug}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex space-x-2">
                            {applet.layoutType && (
                              <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                                {applet.layoutType}
                              </Badge>
                            )}
                            {isSelected && (
                              <div className="flex items-center justify-center h-6 w-6 bg-emerald-500 dark:bg-emerald-600 rounded-full text-white">
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
                  onClick={handleCreateApplet}
                  className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  <Plus className="h-4 w-4" /> New Applet
                </Button>
              )}
              
              <div className="space-x-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => setOpen(false)}
                  className="bg-emerald-500 hover:bg-emerald-600"
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
MultiAppletSelector.refresh = async (): Promise<CustomAppletConfig[]> => {
  return Promise.resolve([]);
};

export default MultiAppletSelector;
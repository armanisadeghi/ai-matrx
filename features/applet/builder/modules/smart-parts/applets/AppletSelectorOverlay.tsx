'use client';
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import SmartAppletList, { SmartAppletListRefType } from './SmartAppletList';
import { CustomAppletConfig } from '@/types/customAppTypes';

// Define type for appletIds
type AppletId = string;

export type AppletSelectorOverlayProps = {
  onAppletSelected: (applet: CustomAppletConfig) => void;
  buttonLabel?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  buttonClassName?: string;
  dialogTitle?: string;
  showCreateOption?: boolean;
  onCreateApplet?: () => void;
  triggerComponent?: React.ReactNode;
  defaultOpen?: boolean;
  isFullscreen?: boolean;
  appletIds?: AppletId[];
  onRefreshComplete?: (applets: CustomAppletConfig[]) => void;
  shouldFetch?: boolean;
}

/**
 * An overlay component that allows selecting an applet from a list
 * Can be triggered by a button or custom trigger component
 */
const AppletSelectorOverlay = forwardRef<SmartAppletListRefType, AppletSelectorOverlayProps>(({
  onAppletSelected,
  buttonLabel = 'Select Applet',
  buttonVariant = 'default',
  buttonSize = 'default',
  buttonClassName = '',
  dialogTitle = 'Select an Applet',
  showCreateOption = true,
  onCreateApplet,
  triggerComponent,
  defaultOpen = false,
  isFullscreen = false,
  appletIds,
  onRefreshComplete,
  shouldFetch = true,
}, ref) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const appletListRef = useRef<SmartAppletListRefType | null>(null);

  // Forward the ref to the internal SmartAppletList component
  useImperativeHandle(ref, () => ({
    refresh: async (specificAppletIds?: AppletId[]) => {
      if (appletListRef.current && typeof appletListRef.current.refresh === 'function') {
        return appletListRef.current.refresh(specificAppletIds);
      }
      return [];
    }
  }));

  const handleAppletSelect = (applet: CustomAppletConfig) => {
    if (onAppletSelected) {
      onAppletSelected(applet);
      setOpen(false);
      toast({
        title: "Applet Selected",
        description: `You selected "${applet.name}"`,
      });
    }
  };

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

  // Handle refresh
  const handleRefresh = async (): Promise<CustomAppletConfig[]> => {
    if (appletListRef.current && typeof appletListRef.current.refresh === 'function') {
      setIsRefreshing(true);
      try {
        const refreshedApplets = await appletListRef.current.refresh(appletIds);
        if (onRefreshComplete) {
          onRefreshComplete(refreshedApplets);
        }
        return refreshedApplets;
      } catch (error) {
        console.error('Error refreshing applets:', error);
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
          <SmartAppletList
            ref={appletListRef}
            onSelectApplet={handleAppletSelect}
            showCreateButton={showCreateOption}
            onCreateApplet={handleCreateApplet}
            className="pb-4"
            appletIds={appletIds}
            onRefreshComplete={onRefreshComplete}
            shouldFetch={shouldFetch}
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

AppletSelectorOverlay.displayName = 'AppletSelectorOverlay';

export default AppletSelectorOverlay;

// Usage examples:
// 1. Basic usage with default button
// <AppletSelectorOverlay
//   onAppletSelected={(applet) => console.log('Selected applet:', applet)}
// />

// 2. Custom button label and styling
// <AppletSelectorOverlay
//   buttonLabel="Choose an Applet"
//   buttonVariant="outline"
//   buttonSize="lg"
//   buttonClassName="border-emerald-500 text-emerald-500"
//   onAppletSelected={handleAppletSelected}
// />

// 3. Custom trigger component
// <AppletSelectorOverlay
//   triggerComponent={
//     <div className="cursor-pointer p-4 border border-dashed border-gray-300 rounded-lg text-center">
//       <p>Click to select an applet</p>
//     </div>
//   }
//   onAppletSelected={handleAppletSelected}
// />

// 4. With applet creation handling
// <AppletSelectorOverlay
//   onAppletSelected={handleAppletSelected}
//   showCreateOption={true}
//   onCreateApplet={() => router.push('/applets/create')}
// />

// 5. Fullscreen mode
// <AppletSelectorOverlay
//   isFullscreen={true}
//   dialogTitle="Browse All Applets"
//   onAppletSelected={handleAppletSelected}
// />

// 6. With specific applet IDs and refresh callback
// <AppletSelectorOverlay
//   appletIds={['applet-1', 'applet-2', 'applet-3']}
//   onRefreshComplete={(applets) => console.log('Refreshed applets:', applets)}
//   onAppletSelected={handleAppletSelected}
// />

// 7. Using with forwardRef to access refresh method
// import { useRef } from 'react';
// 
// const MyComponent = () => {
//   const appletSelectorRef = useRef();
//   
//   const handleRefreshClick = () => {
//     if (appletSelectorRef.current) {
//       appletSelectorRef.current.refresh();
//     }
//   };
//   
//   return (
//     <>
//       <Button onClick={handleRefreshClick}>Refresh Applets</Button>
//       <AppletSelectorOverlay
//         ref={appletSelectorRef}
//         onAppletSelected={handleAppletSelected}
//       />
//     </>
//   );
// };
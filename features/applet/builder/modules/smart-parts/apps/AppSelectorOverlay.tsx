'use client';
import React, { useState, useRef, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import SmartAppList, { SmartAppListRefType } from './SmartAppList';
import { CustomAppConfig } from "@/types/customAppTypes";


// Define type for appIds
type AppId = string;

type AppSelectorOverlayProps = {
  onAppSelected: (app: CustomAppConfig) => void;
  buttonLabel?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  buttonClassName?: string;
  dialogTitle?: string;
  showCreateOption?: boolean;
  onCreateApp?: () => void;
  triggerComponent?: React.ReactNode;
  defaultOpen?: boolean;
  isFullscreen?: boolean;
  appIds?: AppId[];
  onRefreshComplete?: (apps: CustomAppConfig[]) => void;
  gridColumns?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
}

/**
 * An overlay component that allows selecting an app from a list
 * Can be triggered by a button or custom trigger component
 */
const AppSelectorOverlay: React.FC<AppSelectorOverlayProps> & {
  refresh: () => Promise<CustomAppConfig[]>;
} = ({
  onAppSelected,
  buttonLabel = 'Select App',
  buttonVariant = 'default',
  buttonSize = 'default',
  buttonClassName = '',
  dialogTitle = 'Select an App',
  showCreateOption = true,
  onCreateApp,
  triggerComponent,
  defaultOpen = false,
  isFullscreen = false,
  appIds,
  onRefreshComplete,
  gridColumns
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const appListRef = useRef<SmartAppListRefType | null>(null);

  const handleAppSelect = (app: CustomAppConfig) => {
    if (onAppSelected) {
      onAppSelected(app);
      setOpen(false);
      toast({
        title: "App Selected",
        description: `You selected "${app.name}"`,
      });
    }
  };

  const handleCreateApp = () => {
    setOpen(false);
    if (onCreateApp) {
      onCreateApp();
    } else {
      toast({
        title: "Create New App",
        description: "Please implement the app creation flow",
      });
    }
  };

  // Handle refresh
  const handleRefresh = async (): Promise<CustomAppConfig[]> => {
    if (appListRef.current && typeof appListRef.current.refresh === 'function') {
      setIsRefreshing(true);
      try {
        await appListRef.current.refresh();
        
        // Since refresh() returns void, use the current apps from state
        if (onRefreshComplete) {
          // We'll need to pass the current apps from the parent component
          // Since we can't get them directly from the refresh() call
          onRefreshComplete([]);
        }
        return [];
      } catch (error) {
        console.error('Error refreshing apps:', error);
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
          <SmartAppList
            ref={appListRef}
            onSelectApp={handleAppSelect}
            showCreateButton={showCreateOption}
            onCreateApp={handleCreateApp}
            className="pb-4"
            appIds={appIds}
            onRefreshComplete={onRefreshComplete}
            gridColumns={gridColumns}
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
AppSelectorOverlay.refresh = async (): Promise<CustomAppConfig[]> => {
  return Promise.resolve([]);
};

export default AppSelectorOverlay;

// Usage examples:
// 1. Basic usage with default button
// <AppSelectorOverlay
//   onAppSelected={(app) => console.log('Selected app:', app)}
// />

// 2. Custom button label and styling
// <AppSelectorOverlay
//   buttonLabel="Choose an App"
//   buttonVariant="outline"
//   buttonSize="lg"
//   buttonClassName="border-blue-500 text-blue-500"
//   onAppSelected={handleAppSelected}
// />

// 3. Custom trigger component
// <AppSelectorOverlay
//   triggerComponent={
//     <div className="cursor-pointer p-4 border border-dashed border-gray-300 rounded-lg text-center">
//       <p>Click to select an app</p>
//     </div>
//   }
//   onAppSelected={handleAppSelected}
// />

// 4. With app creation handling
// <AppSelectorOverlay
//   onAppSelected={handleAppSelected}
//   showCreateOption={true}
//   onCreateApp={() => router.push('/apps/create')}
// />

// 5. Fullscreen mode
// <AppSelectorOverlay
//   isFullscreen={true}
//   dialogTitle="Browse All Applications"
//   onAppSelected={handleAppSelected}
// />

// 6. With specific app IDs and refresh callback
// <AppSelectorOverlay
//   appIds={['app-1', 'app-2', 'app-3']}
//   onRefreshComplete={(apps) => console.log('Refreshed apps:', apps)}
//   onAppSelected={handleAppSelected}
// />

// 7. Using with forwardRef to access refresh method
// import { useRef } from 'react';
// 
// const MyComponent = () => {
//   const appSelectorRef = useRef();
//   
//   const handleRefreshClick = () => {
//     if (appSelectorRef.current) {
//       appSelectorRef.current.refresh();
//     }
//   };
//   
//   return (
//     <>
//       <Button onClick={handleRefreshClick}>Refresh Apps</Button>
//       <AppSelectorOverlay
//         ref={appSelectorRef}
//         onAppSelected={handleAppSelected}
//       />
//     </>
//   );
// };
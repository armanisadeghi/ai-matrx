'use client';
import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import SmartAppList, { SmartAppListRefType } from './SmartAppList';
import { CustomAppConfig } from "@/types/customAppTypes";

// Define type for appIds
type AppId = string;

export type SmartAppListWrapperProps = {
  isOverlay?: boolean;
  onSelectApp: (app: CustomAppConfig) => void;
  showCreateButton?: boolean;
  onCreateApp?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
  appIds?: AppId[];
  onRefreshComplete?: (apps: CustomAppConfig[]) => void;
  gridColumns?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
};

/**
 * A component that wraps SmartAppList and can display it either as an overlay or inline
 */
const SmartAppListWrapper = forwardRef<SmartAppListRefType, SmartAppListWrapperProps>(({
  isOverlay = false,
  onSelectApp,
  showCreateButton = true,
  onCreateApp,
  isOpen = false,
  onClose,
  className = '',
  appIds,
  onRefreshComplete,
  gridColumns
}, ref) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Use proper typing for the ref
  const appListRef = useRef<SmartAppListRefType | null>(null);

  // Forward the ref to the internal SmartAppList component
  useImperativeHandle(ref, () => ({
    refresh: async () => {
      if (appListRef.current && typeof appListRef.current.refresh === 'function') {
        await appListRef.current.refresh();
      }
    }
  }));

  // Provide default onSelectApp that closes the overlay
  const handleSelectApp = (app: CustomAppConfig) => {
    if (onSelectApp) {
      onSelectApp(app);
    }
    if (isOverlay && onClose) {
      onClose();
    }
  };

  // Handle refresh
  const handleRefresh = async (): Promise<CustomAppConfig[]> => {
    if (appListRef.current && typeof appListRef.current.refresh === 'function') {
      setIsRefreshing(true);
      try {
        await appListRef.current.refresh();
        // Return empty array since we can't get refreshed apps directly
        if (onRefreshComplete) {
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

  // If not an overlay, just render the SmartAppList component
  if (!isOverlay) {
    return (
      <div className={className}>
        <SmartAppList
          ref={appListRef}
          onSelectApp={handleSelectApp}
          showCreateButton={showCreateButton}
          onCreateApp={onCreateApp}
          appIds={appIds}
          onRefreshComplete={onRefreshComplete}
          gridColumns={gridColumns}
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
                Select an App
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
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <SmartAppList
                ref={appListRef}
                onSelectApp={handleSelectApp}
                showCreateButton={showCreateButton}
                onCreateApp={onCreateApp}
                className="pb-6"
                appIds={appIds}
                onRefreshComplete={onRefreshComplete}
                gridColumns={gridColumns}
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

SmartAppListWrapper.displayName = 'SmartAppListWrapper';

export default SmartAppListWrapper;
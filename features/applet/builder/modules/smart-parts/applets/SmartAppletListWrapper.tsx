'use client';
import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import SmartAppletList, { SmartAppletListRefType } from './SmartAppletList';
import { CustomAppletConfig } from '@/types/customAppTypes';

// Define type for appletIds
type AppletId = string;

export type SmartAppletListWrapperProps = {
  isOverlay?: boolean;
  onSelectApplet: (applet: CustomAppletConfig) => void;
  showCreateButton?: boolean;
  onCreateApplet?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
  appletIds?: AppletId[];
  onRefreshComplete?: (applets: CustomAppletConfig[]) => void;
  // New prop for appId filtering
  appId?: string;
  initialViewMode?: "grid" | "list";
  shouldFetch?: boolean;
};

/**
 * A component that wraps SmartAppletList and can display it either as an overlay or inline
 */
const SmartAppletListWrapper = forwardRef<SmartAppletListRefType, SmartAppletListWrapperProps>(({
  isOverlay = false,
  onSelectApplet,
  showCreateButton = true,
  onCreateApplet,
  isOpen = false,
  onClose,
  className = '',
  appletIds,
  onRefreshComplete,
  appId, // New prop
  initialViewMode = "grid",
  shouldFetch = true,
}, ref) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Use proper typing for the ref
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

  // Provide default onSelectApplet that closes the overlay
  const handleSelectApplet = (applet: CustomAppletConfig) => {
    if (onSelectApplet) {
      onSelectApplet(applet);
    }
    if (isOverlay && onClose) {
      onClose();
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

  // If not an overlay, just render the SmartAppletList component
  if (!isOverlay) {
    return (
      <div className={className}>
        <SmartAppletList
          ref={appletListRef}
          onSelectApplet={handleSelectApplet}
          showCreateButton={showCreateButton}
          onCreateApplet={onCreateApplet}
          appletIds={appletIds}
          onRefreshComplete={onRefreshComplete}
          appId={appId} // Pass appId to SmartAppletList
          initialViewMode={initialViewMode}
          shouldFetch={shouldFetch}
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
                Select an Applet
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
              <SmartAppletList
                ref={appletListRef}
                onSelectApplet={handleSelectApplet}
                showCreateButton={showCreateButton}
                onCreateApplet={onCreateApplet}
                className="pb-6"
                appletIds={appletIds}
                onRefreshComplete={onRefreshComplete}
                appId={appId} // Pass appId to SmartAppletList
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

SmartAppletListWrapper.displayName = 'SmartAppletListWrapper';

export default SmartAppletListWrapper;
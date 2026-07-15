"use client";
import React, { useState, useCallback, useEffect } from "react";
import { Minimize, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppletById } from "@/lib/redux/app-builder/selectors/appletSelectors";
import LiveAppAndAppletPreview from "@/features/applet/builder/previews/LiveAppAndAppletPreview";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// Custom hook to manage the fullscreen preview state
export function useFullScreenPreview() {
    const [isVisible, setIsVisible] = useState(false);
    const [previewKey, setPreviewKey] = useState(Date.now());
    
    const show = useCallback(() => setIsVisible(true), []);
    const hide = useCallback(() => setIsVisible(false), []);
    const toggle = useCallback(() => setIsVisible(prev => !prev), []);
    const refresh = useCallback(() => setPreviewKey(Date.now()), []);
    
    return {
        isVisible,
        previewKey,
        show,
        hide,
        toggle,
        refresh
    };
}

interface FullScreenAppletPreviewProps {
    appletId: string;
    allowRefresh?: boolean;
    isVisible: boolean;
    previewKey: number;
    onClose: () => void;
    onRefresh?: () => void;
}

export default function FullScreenAppletPreview({
    appletId,
    allowRefresh = true,
    isVisible,
    previewKey,
    onClose,
    onRefresh
}: FullScreenAppletPreviewProps) {
    const applet = useAppSelector((state) => selectAppletById(state, appletId));
    const [showNotification, setShowNotification] = useState(false);

    useEffect(() => {
        // Show notification when component becomes visible
        if (isVisible) {
            setShowNotification(true);
            
            // Hide after 5 seconds
            const timer = setTimeout(() => {
                setShowNotification(false);
            }, 5000);
            
            return () => clearTimeout(timer);
        }

        return undefined;
    }, [isVisible]);

    if (!isVisible || !applet) return null;

    const handleRefresh = () => {
        if (onRefresh) onRefresh();
    };

    return (
        <div className="fixed inset-0 z-50 bg-gray-100 dark:bg-gray-900 border-dashed border-3 border-blue-500">
            {/* Notification message */}
            {showNotification && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-[60] px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-700 shadow-md backdrop-blur-sm text-sm font-medium animate-in fade-in-0">
                    <span>Sizing May Not Be Exact</span>
                </div>
            )}
            
            {/* Floating controls */}
            <div className="fixed bottom-8 right-8 z-[60] flex flex-col gap-2">
                <TooltipProvider>
                    {allowRefresh && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="secondary" 
                                    size="icon" 
                                    onClick={handleRefresh} 
                                    className="w-10 h-10 rounded-full shadow-md bg-blue-100/90 dark:bg-blue-900/90 hover:bg-blue-200 dark:hover:bg-blue-800 border-dashed border-1 border-blue-500"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    <span className="sr-only">Refresh Preview</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                                Refresh Preview
                            </TooltipContent>
                        </Tooltip>
                    )}
                    
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="secondary" 
                                size="icon" 
                                onClick={onClose} 
                                className="w-10 h-10 rounded-full shadow-md bg-blue-100/90 dark:bg-blue-900/90 hover:bg-blue-200 dark:hover:bg-blue-800 border-dashed border-1 border-blue-500"
                            >
                                <Minimize className="h-4 w-4" />
                                <span className="sr-only">Exit Fullscreen</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                            Exit Fullscreen
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
            
            {/* Fullscreen preview */}
            <div className="h-full w-full">
                <LiveAppAndAppletPreview
                    key={previewKey}
                    appId={applet.appId}
                    appletSlug={applet.slug}
                    isPreview={true}
                    hideHeader={false}
                    forceHeaderDisplay={true}
                    isFullScreenPreview={true}
                    className="h-full w-full"
                />
            </div>
        </div>
    );
}

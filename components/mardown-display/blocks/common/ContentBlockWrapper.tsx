"use client";

import React, { useState, useEffect, ReactNode } from "react";
import {
    Maximize2,
    Minimize2,
    Download,
    Upload,
    Save,
    Cloud,
    CloudOff,
    ExternalLink,
    X,
    LucideIcon,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectCanvasIsAvailable, type CanvasContentType } from "@/features/canvas/redux/canvasSlice";
import IconButton from "@/components/official/IconButton";

export interface ContentBlockAction {
    icon: LucideIcon;
    tooltip: string;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    hidden?: boolean;
}

export interface ContentBlockWrapperProps {
    // Content
    children: ReactNode;
    
    // Metadata
    title?: string;
    subtitle?: string;
    
    // Canvas integration
    enableCanvas?: boolean;
    canvasType?: CanvasContentType;
    canvasData?: any;
    canvasMetadata?: Record<string, any>;
    taskId?: string; // Task ID for canvas deduplication
    
    // Save/Download functionality
    onDownload?: () => void;
    onUpload?: () => Promise<void>;
    onSave?: () => Promise<void>;
    
    // Save status (for external save management)
    isSaving?: boolean;
    lastSaved?: Date | null;
    saveError?: string | null;
    
    // Fullscreen
    defaultFullscreen?: boolean;
    allowFullscreen?: boolean;
    
    // Custom actions
    customActions?: ContentBlockAction[];
    
    // Header content (rendered between title and actions)
    headerContent?: ReactNode;
    
    // Styling
    className?: string;
    contentClassName?: string;
    fullscreenClassName?: string;
    
    // Behavior
    closeOnEscape?: boolean;
}

const ContentBlockWrapper: React.FC<ContentBlockWrapperProps> = ({
    children,
    title,
    subtitle,
    enableCanvas = true,
    canvasType,
    canvasData,
    canvasMetadata,
    taskId,
    onDownload,
    onUpload,
    onSave,
    isSaving = false,
    lastSaved = null,
    saveError = null,
    defaultFullscreen = false,
    allowFullscreen = true,
    customActions = [],
    headerContent,
    className = "",
    contentClassName = "",
    fullscreenClassName = "",
    closeOnEscape = true,
}) => {
    const [isFullScreen, setIsFullScreen] = useState(defaultFullscreen);
    
    // Canvas integration
    const { open: openCanvas } = useCanvas();
    const isCanvasAvailable = useAppSelector(selectCanvasIsAvailable);
    
    // ESC key handler
    useEffect(() => {
        if (!closeOnEscape) return undefined;
        
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isFullScreen) {
                setIsFullScreen(false);
            }
        };
        
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [isFullScreen, closeOnEscape]);
    
    const handleCanvasOpen = () => {
        if (!canvasType || !canvasData) return;
        
        openCanvas({
            type: canvasType as CanvasContentType,
            data: canvasData,
            metadata: {
                ...canvasMetadata,
                sourceTaskId: taskId
            }
        });
    };
    
    const handleUpload = async () => {
        if (!onUpload) return;
        
        try {
            await onUpload();
        } catch (error) {
            console.error("Upload failed:", error);
            alert("Failed to upload. Please check the file format.");
        }
    };
    
    // Build action buttons
    const actionButtons: ContentBlockAction[] = [];
    
    // Save button (if save function provided)
    if (onSave) {
        actionButtons.push({
            icon: Save,
            tooltip: "Save now",
            onClick: onSave,
            disabled: isSaving,
            className: "bg-green-500 dark:bg-green-600 text-white hover:bg-green-600 dark:hover:bg-green-700"
        });
    }
    
    // Download button
    if (onDownload) {
        actionButtons.push({
            icon: Download,
            tooltip: "Download as file",
            onClick: onDownload,
            className: "bg-gray-500 dark:bg-gray-600 text-white hover:bg-gray-600 dark:hover:bg-gray-700"
        });
    }
    
    // Upload button
    if (onUpload) {
        actionButtons.push({
            icon: Upload,
            tooltip: "Import from file",
            onClick: handleUpload,
            className: "bg-gray-500 dark:bg-gray-600 text-white hover:bg-gray-600 dark:hover:bg-gray-700"
        });
    }
    
    // Canvas button (only when not in fullscreen)
    if (enableCanvas && !isFullScreen && canvasType && canvasData && isCanvasAvailable) {
        actionButtons.push({
            icon: ExternalLink,
            tooltip: "Open in Canvas",
            onClick: handleCanvasOpen,
            className: "bg-purple-500 dark:bg-purple-600 text-white hover:bg-purple-600 dark:hover:bg-purple-700"
        });
    }
    
    // Custom actions
    actionButtons.push(...customActions.filter(action => !action.hidden));
    
    // Fullscreen toggle
    if (allowFullscreen) {
        actionButtons.push({
            icon: isFullScreen ? Minimize2 : Maximize2,
            tooltip: isFullScreen ? "Exit focus mode" : "Enter focus mode",
            onClick: () => setIsFullScreen(!isFullScreen),
            className: isFullScreen
                ? "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                : "bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-700"
        });
    }
    
    // Render
    return (
        <div
            className={`w-full ${isFullScreen ? "fixed inset-0 z-50 bg-textured" : className}`}
        >
            <div className={isFullScreen ? `h-full flex flex-col ${fullscreenClassName}` : ""}>
                {/* Close button for fullscreen */}
                {isFullScreen && (
                    <div className="absolute top-3 right-3 z-10">
                        <IconButton
                            icon={X}
                            tooltip="Exit focus mode (ESC)"
                            onClick={() => setIsFullScreen(false)}
                            size="md"
                            className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 shadow-lg"
                        />
                    </div>
                )}
                
                {/* Scrollable content area */}
                <div className={isFullScreen ? "flex-1 overflow-y-auto p-3" : "p-3"}>
                    {/* Header */}
                    {(title || subtitle || headerContent || actionButtons.length > 0) && (
                        <div className="mb-4">
                            {/* Title section */}
                            {(title || subtitle) && (
                                <div className="mb-3">
                                    {title && (
                                        <h1
                                            className={`font-bold text-center text-gray-800 dark:text-gray-100 ${
                                                isFullScreen ? "text-3xl" : "text-2xl"
                                            }`}
                                        >
                                            {title}
                                        </h1>
                                    )}
                                    {subtitle && (
                                        <div className="text-center mt-2">
                                            <span className="text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full">
                                                {subtitle}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* Custom header content */}
                            {headerContent}
                            
                            {/* Action buttons */}
                            {actionButtons.length > 0 && (
                                <div className="flex items-center justify-end gap-1 flex-wrap">
                                    {/* Save status indicators */}
                                    {onSave && (
                                        <div className="flex items-center gap-1 mr-2">
                                            {isSaving && (
                                                <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs" title="Saving...">
                                                    <Cloud className="h-4 w-4 animate-pulse" />
                                                </div>
                                            )}
                                            {!isSaving && lastSaved && (
                                                <div
                                                    className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs"
                                                    title={`Last saved: ${lastSaved.toLocaleTimeString()}`}
                                                >
                                                    <Cloud className="h-4 w-4" />
                                                </div>
                                            )}
                                            {saveError && (
                                                <div className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs" title={saveError}>
                                                    <CloudOff className="h-4 w-4" />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    
                                    {/* Action buttons */}
                                    {actionButtons.map((action, index) => (
                                        <IconButton
                                            key={index}
                                            icon={action.icon}
                                            tooltip={action.tooltip}
                                            onClick={action.onClick}
                                            disabled={action.disabled}
                                            size="md"
                                            className={action.className}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Main content */}
                    <div className={contentClassName}>{children}</div>
                </div>
            </div>
        </div>
    );
};

export default ContentBlockWrapper;


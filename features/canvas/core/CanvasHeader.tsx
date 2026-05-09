"use client";

import React, { ReactNode } from "react";
import { X, Eye, Code, Cloud, Share2, CloudOff, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ViewMode = 'preview' | 'source' | 'library';

export interface CanvasHeaderProps {
  title: string | ReactNode;
  subtitle?: string | ReactNode;
  onClose: () => void;
  
  // View mode toggle
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  hideViewToggle?: boolean;
  showLibraryToggle?: boolean;
  
  // Cloud sync
  isSynced?: boolean;
  isSyncing?: boolean;
  onSync?: () => void;
  hideSync?: boolean;
  
  // Share
  onShare?: () => void;
  hideShare?: boolean;
  
  // Custom actions - rendered between sync and close
  customActions?: ReactNode;
  
  // Style customization
  className?: string;
  variant?: 'default' | 'minimal' | 'compact';
}

/**
 * CanvasHeader - Flexible header component for canvas panels
 * 
 * Features:
 * - Source/Preview toggle for all canvas types
 * - Cloud sync status and manual sync trigger
 * - Share functionality
 * - Custom actions slot for canvas-specific controls
 * - Professional rounded design with proper borders
 */
export function CanvasHeader({
  title,
  subtitle,
  onClose,
  viewMode = 'preview',
  onViewModeChange,
  hideViewToggle = false,
  showLibraryToggle = false,
  isSynced,
  isSyncing = false,
  onSync,
  hideSync = false,
  onShare,
  hideShare = false,
  customActions,
  className,
  variant = 'default',
}: CanvasHeaderProps) {
  
  const isMinimal = variant === 'minimal';
  const isCompact = variant === 'compact';
  const isLibraryMode = viewMode === 'library';
  
  // Compact mode: VS Code-style tiny buttons
  const buttonSize = isCompact ? "h-6 px-1.5" : "h-7 px-2.5";
  const iconSize = isCompact ? "w-3 h-3" : "w-3.5 h-3.5";
  const iconOnlySize = isCompact ? "h-5 w-5 rounded-full" : "h-6 w-6 rounded-full";
  const textSize = isCompact ? "text-[10px]" : "text-xs";
  const iconMargin = isCompact ? "mr-1" : "mr-1.5";
  
  return (
    <TooltipProvider delayDuration={300}>
      <div 
        className={cn(
          "flex-shrink-0 grid items-center",
          "matrx-shell-glass border-b border-border/50",
          isCompact ? "px-2 py-1" : isMinimal ? "px-3 py-1.5" : "px-2 py-1 sm:px-3 sm:py-1.5",
          /* 3-column grid: left | center | right — center is truly centered */
          "grid-cols-[1fr_auto_1fr]",
          className
        )}
      >
        {/* LEFT: Title */}
        <div className="min-w-0 flex items-center gap-2">
          <div className={cn(
            "font-semibold text-foreground truncate",
            isCompact ? "text-xs" : "text-xs sm:text-sm"
          )}>
            {typeof title === 'string' ? title : title}
          </div>
          {subtitle && (
            <span className={cn(
              "hidden sm:inline text-muted-foreground shrink-0",
              isCompact ? "text-[10px]" : "text-xs"
            )}>
              {typeof subtitle === 'string' ? subtitle : subtitle}
            </span>
          )}
        </div>

        {/* CENTER: View Mode Toggle + Navigation (customActions) */}
        <div className="flex items-center gap-1 justify-center">
          {/* View Mode Toggle */}
          {!hideViewToggle && onViewModeChange && (
            <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5">
               <Tooltip>
                 <TooltipTrigger asChild>
                   <Button
                     variant="ghost"
                     size="sm"
                     onClick={() => onViewModeChange('source')}
                     className={cn(
                       buttonSize, textSize, "rounded-md transition-colors",
                       viewMode === 'source'
                         ? "bg-background/80 text-foreground shadow-sm"
                         : "text-muted-foreground hover:text-foreground"
                     )}
                   >
                     <Code className={cn(iconSize, !isCompact && "mr-0 sm:mr-1.5")} />
                     {!isCompact && <span className="hidden sm:inline">Source</span>}
                   </Button>
                 </TooltipTrigger>
                 <TooltipContent side="bottom" sideOffset={8}>View source data</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewModeChange('preview')}
                    className={cn(
                      buttonSize, textSize, "rounded-md transition-colors",
                      viewMode === 'preview'
                        ? "bg-background/80 text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Eye className={cn(iconSize, !isCompact && "mr-0 sm:mr-1.5")} />
                    {!isCompact && <span className="hidden sm:inline">Preview</span>}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8}>Preview mode</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Custom Actions Slot (CanvasNavigation — ‹ N/M ›) */}
          {customActions && (
            <>
              {!hideViewToggle && onViewModeChange && (
                <div className="w-px h-5 bg-border/60 mx-0.5" />
              )}
              {customActions}
            </>
          )}
        </div>

        {/* RIGHT: Utility icons — library, sync, share, close */}
        <div className="flex items-center gap-0.5 justify-end">
          {/* Library Toggle */}
          {showLibraryToggle && onViewModeChange && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewModeChange(isLibraryMode ? 'preview' : 'library')}
                  className={cn(
                    iconOnlySize, "p-0",
                    isLibraryMode
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Library className={iconSize} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                {isLibraryMode ? 'Back to canvas' : 'View saved items'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Cloud Sync */}
          {!hideSync && onSync && !isLibraryMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSync}
                  disabled={isSyncing}
                  className={cn(
                    iconOnlySize, "p-0",
                    isSynced && !isSyncing && "text-green-600 dark:text-green-500",
                    !isSynced && !isSyncing && "text-muted-foreground",
                    isSyncing && "text-blue-500"
                  )}
                >
                  {isSynced && !isSyncing ? (
                    <Cloud className={cn(iconSize, isSyncing && "animate-pulse")} />
                  ) : (
                    <CloudOff className={cn(iconSize, isSyncing && "animate-pulse")} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                {isSyncing ? 'Syncing...' : isSynced ? 'Synced to cloud' : 'Not synced — click to sync'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Share */}
          {!hideShare && onShare && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onShare}
                  className={cn(iconOnlySize, "p-0 text-muted-foreground hover:text-foreground")}
                >
                  <Share2 className={iconSize} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>Share</TooltipContent>
            </Tooltip>
          )}

          {/* Divider + Close */}
          <div className={cn("w-px bg-border/60 mx-0.5", isCompact ? "h-4" : "h-5")} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className={cn(iconOnlySize, "p-0 text-muted-foreground hover:text-foreground hover:bg-muted")}
              >
                <X className={iconSize} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>Close canvas</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}


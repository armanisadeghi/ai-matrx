"use client";

import React, { useState, useEffect, useCallback, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ResizableCanvasProps {
  /** Canvas content to render */
  children: ReactNode;
  
  /** Initial width in pixels */
  initialWidth?: number;
  
  /** Minimum width in pixels */
  minWidth?: number;
  
  /** Maximum width in pixels */
  maxWidth?: number;
  
  /** Callback when width changes */
  onWidthChange?: (width: number) => void;
  
  /** Additional className for the container */
  className?: string;
  
  /** Disable resizing */
  disableResize?: boolean;
}

/**
 * ResizableCanvas - Reusable canvas container with resize handle
 * 
 * Features:
 * - Resizable width with drag handle
 * - Configurable min/max width
 * - Canvas priority sizing (occupies width first)
 * - Extracted from AdaptiveLayout for reusability
 * 
 * Usage:
 * - In PromptRunner for inline canvas
 * - Can be used in any component that needs resizable canvas
 */
export function ResizableCanvas({
  children,
  initialWidth = 800,
  minWidth = 500,
  maxWidth = 1200,
  onWidthChange,
  className,
  disableResize = false,
}: ResizableCanvasProps) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  // Handle mouse drag for resizing
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    // Calculate width from the right edge
    const newWidth = window.innerWidth - e.clientX;
    
    // Constrain canvas width
    const constrainedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
    
    setWidth(constrainedWidth);
    onWidthChange?.(constrainedWidth);
  }, [isResizing, minWidth, maxWidth, onWidthChange]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Setup mouse event listeners for resizing
  useEffect(() => {
    if (!isResizing || disableResize) return undefined;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, disableResize, handleMouseMove, handleMouseUp]);

  // Prevent text selection during resize
  useEffect(() => {
    if (isResizing) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
  }, [isResizing]);

  return (
    <div 
      className={cn(
        "relative flex-shrink-0 overflow-hidden",
        className
      )}
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle - Left side */}
      {!disableResize && (
        <div
          className={cn(
            "absolute top-0 bottom-0 left-0 z-10 flex items-center justify-center cursor-col-resize",
            "w-4 hover:bg-primary/10 transition-colors group"
          )}
          onMouseDown={() => setIsResizing(true)}
          style={{ marginLeft: '-8px' }}
        >
          {/* Visual separator line */}
          <div className={cn(
            "w-px h-full bg-zinc-300 dark:bg-zinc-700",
            "group-hover:bg-primary/50 transition-colors"
          )} />
          
          {/* Drag Handle */}
          <div className={cn(
            "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
            "w-1.5 h-16 rounded-full",
            "bg-zinc-400 dark:bg-zinc-600",
            "opacity-0 group-hover:opacity-100",
            "transition-all duration-200 shadow-md"
          )}>
            {/* Grip lines */}
            <div className="absolute inset-0 flex items-center justify-center gap-0.5">
              <div className="w-px h-8 bg-white dark:bg-zinc-200 rounded-full opacity-60" />
              <div className="w-px h-8 bg-white dark:bg-zinc-200 rounded-full opacity-60" />
            </div>
          </div>
        </div>
      )}

      {/* Canvas Content */}
      <div className="h-full w-full border-2 border-red-500">
        {children}
      </div>
    </div>
  );
}


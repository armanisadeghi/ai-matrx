"use client";
import React, { useState, ReactNode, isValidElement, cloneElement, ReactElement, MouseEvent } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Define a type for components that can accept isFullscreen prop
interface FullscreenableComponent {
  isFullscreen?: boolean;
}

interface StreamDisplayOverlayProps {
  title: string;
  children: ReactElement<FullscreenableComponent> | ReactNode;
  className?: string;
  triggerClassName?: string;
  expandIconClassName?: string;
}

const StreamDisplayOverlay = ({
  title,
  children,
  className = "",
  triggerClassName = "",
  expandIconClassName = ""
}: StreamDisplayOverlayProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const enterFullscreen = (e: MouseEvent<HTMLDivElement>) => {
    // Check if the click is on an interactive element
    const target = e.target as HTMLElement;
    
    // Skip entering fullscreen if the click was on these interactive elements
    if (
      target.closest('button:not([data-fullscreen-button])') || 
      target.closest('[role="button"]') || 
      target.closest('a') || 
      target.closest('input') || 
      target.closest('select') || 
      target.closest('textarea') || 
      target.closest('[data-state]') || // Handles Radix UI elements
      target.closest('[data-radix-collection-item]') || // Tabs and other Radix elements
      target.closest('[role="tab"]') || // Explicit tab role
      target.closest('.radix-tabs-trigger') || // Class-based tab detection
      target.closest('h2[data-orientation]') || // Collapsible headers
      target.getAttribute('aria-selected') === 'true' || // Selected tab item
      target.closest('[data-radix-aspect-ratio-wrapper]') // Some interactive UI components
    ) {
      return;
    }
    setIsFullscreen(true);
    // Prevent body scrolling when in fullscreen
    document.body.style.overflow = "hidden";
  };

  const exitFullscreen = () => {
    setIsFullscreen(false);
    // Restore body scrolling when exiting fullscreen
    document.body.style.overflow = "";
  };

  // Handle escape key to exit fullscreen
  React.useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        exitFullscreen();
      }
    };
    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [isFullscreen]);

  // Type guard to check if a React element is "fullscreenable"
  const isFullscreenableElement = (element: ReactNode): element is ReactElement<FullscreenableComponent> => {
    return isValidElement(element);
  };

  // Handle the explicit fullscreen button click
  const handleFullscreenButtonClick = (e: MouseEvent) => {
    e.stopPropagation(); // Prevent the container's onClick from firing
    setIsFullscreen(true);
    document.body.style.overflow = "hidden";
  };

  return (
    <div className="relative w-full h-full">
      {/* Trigger element with expand icon */}
      <div 
        onClick={enterFullscreen} 
        className={cn(
          "relative group w-full h-full",
          isFullscreen ? "" : "cursor-pointer",
          triggerClassName
        )}
      >
        {isFullscreenableElement(children) 
          ? cloneElement(children, { isFullscreen: false }) 
          : children}
        <div className={cn(
          "absolute opacity-0 group-hover:opacity-100 transition-opacity",
          expandIconClassName || "top-2 right-2"
        )}>
          <button
            onClick={handleFullscreenButtonClick}
            className="p-1 rounded-md bg-gray-200/80 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title="Expand to fullscreen"
            aria-label="Expand to fullscreen"
            data-fullscreen-button="true"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>

      {/* Fullscreen Overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col h-dvh bg-gray-50 dark:bg-gray-900">
          {/* Header */}
          <div className="flex justify-between items-center p-3 bg-textured border-b border-border shadow-sm flex-shrink-0">
            <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">
              {title}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={exitFullscreen}
                className="p-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                title="Exit fullscreen"
                aria-label="Exit fullscreen"
              >
                <Minimize2 size={18} />
              </button>
              <button
                onClick={exitFullscreen}
                className="p-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                title="Close"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          
          {/* Content - This is the key change! */}
          <div className={cn(
            "flex-1 min-h-0",  // Changed this to ensure proper flex behavior
            className
          )}>
            {isFullscreenableElement(children) 
              ? cloneElement(children, { isFullscreen: true }) 
              : children}
          </div>
        </div>
      )}
    </div>
  );
};

export default StreamDisplayOverlay;
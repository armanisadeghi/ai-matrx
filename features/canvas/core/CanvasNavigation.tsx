"use client";

import React from "react";
import { ChevronLeft, ChevronRight, List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CanvasItem } from "@/features/canvas/redux/canvasSlice";
import { NewDiagramMenuItems } from "@/components/mermaid/workbench/NewDiagramMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CanvasNavigationProps {
  items: CanvasItem[];
  currentItemId: string | null;
  onNavigate: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onClearAll?: () => void;
}

/**
 * CanvasNavigation - Navigation controls for canvas history
 * 
 * Features:
 * - Previous/Next buttons for quick navigation
 * - Dropdown menu showing all canvas items
 * - Remove individual items
 * - Clear all history
 * - Shows count badge
 */
export function CanvasNavigation({
  items,
  currentItemId,
  onNavigate,
  onRemove,
  onClearAll,
}: CanvasNavigationProps) {
  
  if (items.length === 0) return null;
  
  const currentIndex = items.findIndex(item => item.id === currentItemId);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;
  
  const handlePrevious = () => {
    if (hasPrevious) {
      onNavigate(items[currentIndex - 1].id);
    }
  };
  
  const handleNext = () => {
    if (hasNext) {
      onNavigate(items[currentIndex + 1].id);
    }
  };
  
  const getItemLabel = (item: CanvasItem, index: number): string => {
    const title = item.content.metadata?.title;
    const type = item.content.type;
    return title ? String(title) : `${type} ${index + 1}`;
  };
  
  const getItemSubtitle = (item: CanvasItem): string => {
    const date = new Date(item.timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5">
        {/* Previous Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrevious}
              disabled={!hasPrevious}
              className="h-6 w-6 sm:h-7 sm:w-7 p-0"
            >
              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
          Previous canvas
          </TooltipContent>
        </Tooltip>
        
        {/* Canvas List Dropdown — icon+count on desktop, count-only on mobile */}
        <Tooltip>
          <DropdownMenu>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 sm:h-7 px-1.5 sm:px-2 gap-1"
                >
                  <List className="w-3 h-3 sm:w-3.5 sm:h-3.5 hidden sm:block" />
                  <span className="text-[10px] sm:text-xs font-medium tabular-nums">
                    {currentIndex + 1}/{items.length}
                  </span>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>
            View all canvas items
            </TooltipContent>
          
          <DropdownMenuContent align="start" className="w-64">
            <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Canvas History ({items.length})
            </div>
            <DropdownMenuSeparator />
            
            <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
              {items.map((item, index) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    "flex items-center justify-between gap-2 cursor-pointer",
                    item.id === currentItemId && "bg-zinc-100 dark:bg-zinc-800"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {getItemLabel(item, index)}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {getItemSubtitle(item)}
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item.id);
                    }}
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </DropdownMenuItem>
              ))}
            </div>
            
            {items.length > 1 && onClearAll && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onClearAll}
                  className="text-red-600 dark:text-red-400 cursor-pointer"
                >
                  Clear all history
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />
            <NewDiagramMenuItems />
          </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
        
        {/* Next Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNext}
              disabled={!hasNext}
              className="h-6 w-6 sm:h-7 sm:w-7 p-0"
            >
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
          Next canvas
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}


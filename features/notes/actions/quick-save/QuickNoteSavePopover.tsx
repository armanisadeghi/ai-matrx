"use client";

import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { Note } from "@/features/notes/types";
import { QuickNoteSaveCore, type PostSaveAction } from "./QuickNoteSaveCore";

export interface QuickNoteSavePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  initialContent: string;
  defaultFolder?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  onSaved?: (note?: Note, action?: PostSaveAction) => void;
}

export function QuickNoteSavePopover({
  open,
  onOpenChange,
  trigger,
  initialContent,
  defaultFolder = "Scratch",
  side = "bottom",
  align = "end",
  onSaved,
}: QuickNoteSavePopoverProps) {
  const isMobile = useIsMobile();

  const handleSaved = (note: Note, action: PostSaveAction) => {
    onSaved?.(note, action);
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className={cn(
          "p-2 shadow-lg",
          isMobile
            ? "w-[calc(100vw-1rem)] h-[70dvh]"
            : "w-[440px] h-[520px]",
        )}
      >
        <div className="h-full min-h-0">
          <QuickNoteSaveCore
            initialContent={initialContent}
            defaultFolder={defaultFolder}
            compact
            onSaved={handleSaved}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

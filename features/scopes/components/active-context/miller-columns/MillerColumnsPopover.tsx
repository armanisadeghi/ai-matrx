"use client";

import React, { useState } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { ContextSheet } from "@/features/scopes/components/context-assignment/ContextSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  MillerColumns,
  MillerColumnsCore,
  type MillerColumnsProps,
} from "./MillerColumns";
import type { Universe } from "../quick-pick/engine";

export interface MillerColumnsPopoverProps extends MillerColumnsProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  contentClassName?: string;
  /** A host that already owns the universe (its engine reads it) passes it,
   *  so the popover shows the same data it writes against. */
  universe?: Universe;
  /** Mobile sheet title. */
  sheetTitle?: string;
}

/**
 * Compact host for Miller Columns. Desktop uses a simple popover; mobile uses
 * the canonical context bottom sheet. The picker body remains the same core.
 */
export function MillerColumnsPopover({
  trigger,
  open: controlledOpen,
  onOpenChange,
  align = "start",
  contentClassName,
  className,
  variant = "condensed",
  universe,
  sheetTitle = "Select context",
  ...pickerProps
}: MillerColumnsPopoverProps) {
  const isMobile = useIsMobile();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  };
  const triggerNode = trigger ?? (
    <Button variant="outline" size="sm" className="gap-1.5">
      <Columns3 className="h-3.5 w-3.5" />
      Select context
    </Button>
  );
  const pickerClassName = cn(
    "h-[300px] w-[min(760px,calc(100vw-2rem))] max-w-full rounded-none border-0",
    className,
  );
  const picker = !open ? null : universe ? (
    <MillerColumnsCore
      {...pickerProps}
      universe={universe}
      variant={variant}
      className={pickerClassName}
    />
  ) : (
    <MillerColumns
      {...pickerProps}
      variant={variant}
      className={pickerClassName}
    />
  );

  if (isMobile) {
    return (
      <>
        <span onClick={() => setOpen(true)}>{triggerNode}</span>
        <ContextSheet open={open} onOpenChange={setOpen} title={sheetTitle}>
          <div className="h-full min-h-0 overflow-x-auto p-2">{picker}</div>
        </ContextSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerNode}</PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — fixed-shape column browser sized by its own inner MillerColumns panel, not by content text */
        align={align}
        className={cn("w-auto max-w-[calc(100vw-2rem)] p-0", contentClassName)}
      >
        {picker}
      </PopoverContent>
    </Popover>
  );
}

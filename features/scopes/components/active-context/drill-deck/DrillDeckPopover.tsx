"use client";

import { useState, type ReactNode } from "react";
import { ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ContextSheet } from "@/features/scopes/components/context-assignment/ContextSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { DrillDeck, type DrillDeckProps } from "./DrillDeck";

export interface DrillDeckPopoverProps extends DrillDeckProps {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  contentClassName?: string;
}

/**
 * Narrow host for Drill Deck. Desktop uses a simple popover; mobile uses the
 * canonical context bottom sheet. The picker remains the shared DrillDeck.
 */
export function DrillDeckPopover({
  trigger,
  open: controlledOpen,
  onOpenChange,
  align = "start",
  contentClassName,
  className,
  rootLabel = "Context",
  ...pickerProps
}: DrillDeckPopoverProps) {
  const isMobile = useIsMobile();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  };
  const triggerNode = trigger ?? (
    <Button variant="outline" size="sm" className="gap-1.5">
      <ListTree className="h-3.5 w-3.5" />
      Select context
    </Button>
  );
  const picker = open ? (
    <DrillDeck
      {...pickerProps}
      rootLabel={rootLabel}
      className={cn(
        "h-[min(420px,68dvh)] w-[min(340px,calc(100vw-2rem))] rounded-none border-0",
        className,
      )}
    />
  ) : null;

  if (isMobile) {
    return (
      <>
        <span onClick={() => setOpen(true)}>{triggerNode}</span>
        <ContextSheet open={open} onOpenChange={setOpen} title={rootLabel}>
          <div className="h-full min-h-0 p-2">{picker}</div>
        </ContextSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerNode}</PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn("w-auto max-w-[calc(100vw-2rem)] p-0", contentClassName)}
      >
        {picker}
      </PopoverContent>
    </Popover>
  );
}

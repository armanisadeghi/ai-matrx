"use client";

// features/scopes/components/context-assignment/ContextAssignmentPopover.tsx
//
// Popover wrapper around ContextAssignmentField — quick access without leaving
// or blocking the page. The field mounts only while open, so its engagement
// fetches (projects/tasks) are lazy by construction; the core tree comes from
// Redux either way (no fetch).
//
// Usage: pass your own trigger (a tag button, a chip row, an icon button).

import React, { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ContextAssignmentField,
  type ContextAssignmentFieldProps,
} from "./ContextAssignmentField";
import { ContextSheet } from "./ContextSheet";

export interface ContextAssignmentPopoverProps extends ContextAssignmentFieldProps {
  /** The element that opens the popover. */
  trigger: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  /** Close automatically after a successful save. Default true. */
  closeOnSaved?: boolean;
  contentClassName?: string;
}

export function ContextAssignmentPopover({
  trigger,
  align = "start",
  side = "bottom",
  closeOnSaved = true,
  contentClassName,
  onSaved,
  ...fieldProps
}: ContextAssignmentPopoverProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const handleSaved: ContextAssignmentFieldProps["onSaved"] = (r) => {
    onSaved?.(r);
    if (r.ok && closeOnSaved) setOpen(false);
  };

  if (isMobile) {
    return (
      <>
        <span onClick={() => setOpen(true)}>{trigger}</span>
        <ContextSheet
          open={open}
          onOpenChange={setOpen}
          title={fieldProps.subject?.title ?? "Organize"}
        >
          {open && (
            <ContextAssignmentField
              {...fieldProps}
              fill
              hideSubject
              className="rounded-none border-0"
              onSaved={handleSaved}
            />
          )}
        </ContextSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className={cn("w-[560px] max-w-[92vw] p-0", contentClassName)}
      >
        {open && (
          <ContextAssignmentField
            {...fieldProps}
            sectionHeight={fieldProps.sectionHeight ?? 320}
            className="border-0"
            onSaved={handleSaved}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

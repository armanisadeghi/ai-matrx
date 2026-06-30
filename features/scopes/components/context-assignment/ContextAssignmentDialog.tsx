"use client";

// features/scopes/components/context-assignment/ContextAssignmentDialog.tsx
//
// Modal wrapper around ContextAssignmentField — for flows where assignment is
// the explicit step (e.g. right after an upload completes). Controlled
// open/onOpenChange so any surface can drive it. The field mounts only while
// open (lazy engagement fetches; the core tree is Redux, never refetched).

import React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ContextAssignmentField,
  type ContextAssignmentFieldProps,
} from "./ContextAssignmentField";
import { ContextSheet } from "./ContextSheet";

export interface ContextAssignmentDialogProps extends ContextAssignmentFieldProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Close automatically after a successful save. Default true. */
  closeOnSaved?: boolean;
  contentClassName?: string;
}

export function ContextAssignmentDialog({
  open,
  onOpenChange,
  closeOnSaved = true,
  contentClassName,
  onSaved,
  ...fieldProps
}: ContextAssignmentDialogProps) {
  const isMobile = useIsMobile();

  const handleSaved: ContextAssignmentFieldProps["onSaved"] = (r) => {
    onSaved?.(r);
    if (r.ok && closeOnSaved) onOpenChange(false);
  };

  if (isMobile) {
    return (
      <ContextSheet
        open={open}
        onOpenChange={onOpenChange}
        title={fieldProps.subject?.title ?? "Context"}
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
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("w-[680px] max-w-[94vw] p-0", contentClassName)}
      >
        {/* Title for a11y; the field's subject header is the visible title. */}
        <DialogTitle className="sr-only">
          Organize {fieldProps.subject?.title ?? "context"}
        </DialogTitle>
        {open && (
          <ContextAssignmentField
            {...fieldProps}
            className="border-0"
            onSaved={handleSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

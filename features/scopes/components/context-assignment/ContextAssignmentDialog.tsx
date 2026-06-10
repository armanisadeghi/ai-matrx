"use client";

// features/scopes/components/context-assignment/ContextAssignmentDialog.tsx
//
// Modal wrapper around ContextAssignmentField — for flows where assignment is
// the explicit step (e.g. right after an upload completes). Controlled
// open/onOpenChange so any surface can drive it. The field mounts only while
// open (lazy engagement fetches; the core tree is Redux, never refetched).

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ContextAssignmentField,
  type ContextAssignmentFieldProps,
} from "./ContextAssignmentField";

export interface ContextAssignmentDialogProps
  extends ContextAssignmentFieldProps {
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("w-[680px] max-w-[94vw] p-0", contentClassName)}>
        {/* Title for a11y; the field's subject header is the visible title. */}
        <DialogTitle className="sr-only">Organize {fieldProps.subject.title}</DialogTitle>
        {open && (
          <ContextAssignmentField
            {...fieldProps}
            className="border-0"
            onSaved={(r) => {
              onSaved?.(r);
              if (r.ok && closeOnSaved) onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

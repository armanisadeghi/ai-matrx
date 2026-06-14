"use client";

// features/scopes/components/context-assignment/ContextAssignmentWindow.tsx
//
// WindowPanel wrapper around ContextAssignmentField — a draggable, minimizable
// window that doesn't interrupt what the user is doing on the page. Rendering
// it joins the runtime Window Manager (tray, minimize-all, focus) per the
// window-panels feature.
//
// This is the INLINE-controlled form (open state owned by the caller via
// `open`/`onClose`). Registering a globally-dispatchable overlay-catalogue
// entry (open it from anywhere via `openOverlay`) is the production follow-up
// to do with the overlay-system skill once the component set is approved.

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ContextAssignmentField,
  type ContextAssignmentFieldProps,
} from "./ContextAssignmentField";
import { ContextSheet } from "./ContextSheet";

export interface ContextAssignmentWindowProps extends ContextAssignmentFieldProps {
  open: boolean;
  onClose: () => void;
  /** Close the window automatically after a successful save. Default false —
   *  a floating window often stays up while the user keeps working. */
  closeOnSaved?: boolean;
}

export function ContextAssignmentWindow({
  open,
  onClose,
  closeOnSaved = false,
  onSaved,
  ...fieldProps
}: ContextAssignmentWindowProps) {
  const isMobile = useIsMobile();
  if (!open) return null;

  const handleSaved: ContextAssignmentFieldProps["onSaved"] = (r) => {
    onSaved?.(r);
    if (r.ok && closeOnSaved) onClose();
  };

  if (isMobile) {
    return (
      <ContextSheet
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        title={fieldProps.subject?.title ?? "Organize"}
      >
        <ContextAssignmentField
          {...fieldProps}
          fill
          hideSubject
          className="rounded-none border-0"
          onSaved={handleSaved}
        />
      </ContextSheet>
    );
  }

  return (
    <WindowPanel
      title={`Organize — ${fieldProps.subject.title}`}
      onClose={onClose}
      minWidth={560}
      minHeight={520}
      fitContent
      bodyClassName="p-0"
    >
      <div className="w-[640px] max-w-full">
        <ContextAssignmentField
          {...fieldProps}
          className="rounded-none border-0"
          onSaved={handleSaved}
        />
      </div>
    </WindowPanel>
  );
}

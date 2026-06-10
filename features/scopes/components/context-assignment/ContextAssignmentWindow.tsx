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
import {
  ContextAssignmentField,
  type ContextAssignmentFieldProps,
} from "./ContextAssignmentField";

export interface ContextAssignmentWindowProps
  extends ContextAssignmentFieldProps {
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
  if (!open) return null;
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
          onSaved={(r) => {
            onSaved?.(r);
            if (r.ok && closeOnSaved) onClose();
          }}
        />
      </div>
    </WindowPanel>
  );
}

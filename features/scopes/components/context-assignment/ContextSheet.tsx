"use client";

// features/scopes/components/context-assignment/ContextSheet.tsx
//
// THE mobile host for every context surface. One really-great bottom sheet that
// the popover / dialog / upload-prompt / active-context wrappers drop into when
// `useIsMobile()` is true — instead of a too-wide desktop popover or dialog.
//
// Contract: render a context body (ContextAssignmentField / ActiveContextPanel)
// with `fill`, so the field's own section list is the SINGLE scroll area (no
// nested scrolling) and its footer pins to the bottom of the sheet. The sheet
// supplies the glass chrome, drag handle, safe-area padding, and a sticky title.

import React from "react";
import {
  BottomSheet,
  BottomSheetHeader,
} from "@/components/official/bottom-sheet/BottomSheet";

export interface ContextSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sticky title row. Omit to show only the drag handle. */
  title?: string;
  /** Optional right-aligned control in the title row (e.g. a Clear button). */
  headerTrailing?: React.ReactNode;
  /** A context body with `fill` (it owns the single scroll area + footer). */
  children: React.ReactNode;
}

export function ContextSheet({
  open,
  onOpenChange,
  title,
  headerTrailing,
  children,
}: ContextSheetProps) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title ?? "Context"}
      contentClassName="bg-card"
    >
      {title && <BottomSheetHeader title={title} trailing={headerTrailing} />}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </BottomSheet>
  );
}

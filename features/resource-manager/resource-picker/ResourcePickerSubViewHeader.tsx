"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResourcePickerSubViewHeaderProps {
  title: string;
  onBack: () => void;
  /** Optional leading icon (tinted per module). */
  icon?: ReactNode;
  /** Right-aligned header controls (view toggles, bulk actions). */
  actions?: ReactNode;
  disabled?: boolean;
}

/** Dense sub-view header — one header for every picker drill-in. */
export function ResourcePickerSubViewHeader({
  title,
  onBack,
  icon,
  actions,
  disabled,
}: ResourcePickerSubViewHeaderProps) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border pl-1 pr-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 shrink-0 p-0"
        onClick={onBack}
        disabled={disabled}
        aria-label="Back to attach menu"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {icon}
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {title}
      </span>
      {actions}
    </div>
  );
}

/** Shared max height for run-control subviews inside the attach menu shell. */
export const RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS =
  "max-h-[min(480px,68dvh)]";

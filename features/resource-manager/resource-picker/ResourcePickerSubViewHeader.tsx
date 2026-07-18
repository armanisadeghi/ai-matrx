"use client";

import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResourcePickerSubViewHeaderProps {
  title: string;
  onBack: () => void;
}

export function ResourcePickerSubViewHeader({
  title,
  onBack,
}: ResourcePickerSubViewHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 shrink-0 p-0"
        onClick={onBack}
        aria-label="Back to attach menu"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {title}
      </span>
    </div>
  );
}

/** Shared max height for run-control subviews inside the attach menu shell. */
export const RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS =
  "max-h-[min(480px,68dvh)]";

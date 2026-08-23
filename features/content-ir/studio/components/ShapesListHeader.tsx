"use client";

// Shapes library header — injected into the shell header center. The list's
// primary action lives beside the canonical scope tabs, so this stays identity-only.

import { Shapes } from "lucide-react";
import { SHAPES_FEATURE_LABEL } from "@/features/content-ir/studio/constants";

export function ShapesListHeader() {
  return (
    <div className="flex w-full items-center gap-2 px-1">
      <Shapes className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-semibold text-foreground">
        {SHAPES_FEATURE_LABEL}
      </span>
    </div>
  );
}

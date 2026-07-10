// components/AutosaveIndicator.tsx
//
// The visible status for `useAutosave` — "Saving…" / "Saved" / "Unsaved
// changes" / "Save failed". Generic (takes an AutosaveStatus), so any surface
// with autosave shows the same never-lose-work affordance. Renders nothing when
// idle with nothing yet saved.

"use client";

import { Check, Loader2, CircleDot, AlertCircle } from "lucide-react";
import type { AutosaveStatus } from "@/hooks/useAutosave";
import { cn } from "@/lib/utils";

export function AutosaveIndicator({
  status,
  lastSavedAt,
  className,
}: {
  status: AutosaveStatus;
  lastSavedAt?: Date | null;
  className?: string;
}) {
  if (status === "idle" && !lastSavedAt) return null;

  const base = "inline-flex items-center gap-1 text-[11px]";

  if (status === "saving") {
    return (
      <span className={cn(base, "text-muted-foreground", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "unsaved") {
    return (
      <span className={cn(base, "text-amber-600 dark:text-amber-400", className)}>
        <CircleDot className="h-3 w-3" />
        Unsaved changes
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={cn(base, "text-red-600 dark:text-red-400", className)}>
        <AlertCircle className="h-3 w-3" />
        Save failed — retrying
      </span>
    );
  }
  // saved (or idle with a prior save)
  return (
    <span className={cn(base, "text-green-600 dark:text-green-500", className)}>
      <Check className="h-3 w-3" />
      Saved
    </span>
  );
}

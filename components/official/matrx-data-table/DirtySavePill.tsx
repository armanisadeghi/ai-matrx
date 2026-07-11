"use client";

import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Floating dirty-session pill — Save / Cancel after inline edits.
 * Fixed bottom-center so it stays visible while scrolling the table.
 */
export function DirtySavePill({
  changeCount,
  saving,
  onSave,
  onCancel,
  className,
}: {
  changeCount: number;
  saving?: boolean;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
}) {
  if (changeCount <= 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center pb-safe",
        className,
      )}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-lg elevation-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">
          {changeCount} unsaved change{changeCount === 1 ? "" : "s"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 rounded-full border-dashed border-destructive/60 text-xs text-destructive hover:text-destructive"
          disabled={saving}
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1.5 rounded-full text-xs"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}

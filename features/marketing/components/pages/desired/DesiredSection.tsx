"use client";

/**
 * DesiredSection — the shared presentational frame for a card's desired-value
 * editing area. Renders the observed/desired divider, the caller's fields,
 * and the standard Save affordance driven by a `useDesiredValueSlice`.
 * Mirrors PageIntentCard's save-button conventions so every desired editor
 * on the workspace feels identical.
 */

import type { ReactNode } from "react";
import { Loader2, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DesiredSection({
  title = "Desired",
  hint,
  dirty,
  saving,
  onSave,
  onReset,
  children,
  className,
}: {
  title?: ReactNode;
  /** One-line explanation under the divider (optional). */
  hint?: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-t border-dashed border-border", className)}>
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          {title}
        </span>
        {hint ? (
          <span className="truncate text-[10px] text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 p-3">
        {children}
        <div className="flex items-center justify-end gap-2">
          {onReset ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={!dirty || saving}
              onClick={onReset}
            >
              <Undo2 className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
          ) : null}
          <Button
            size="sm"
            className="h-8"
            disabled={!dirty || saving}
            onClick={onSave}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save desired
          </Button>
        </div>
      </div>
    </div>
  );
}

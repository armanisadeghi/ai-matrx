"use client";

import { Link2, Type } from "lucide-react";
import { cn } from "@/lib/utils";

export type EntryMode = "direct" | "reference";

interface EntryModeToggleProps {
  value: EntryMode;
  onChange: (mode: EntryMode) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * THE first decision when defining a context item's value: does it hold a
 * typed-in value ("Direct Entry" — string/number/date/etc.) or does it point
 * at another Matrx entity ("Reference" — file/scope/note/…, a canonical
 * `matrx` reference fence)? Every value-type picker in the platform routes
 * through this fork FIRST — never a flat dropdown that lists "Reference"
 * as if it were just another primitive alongside String/Number/Date.
 *
 * Used by both `ContextItemAddForm` and `ContextItemSettingsForm` — one
 * control, one visual language, everywhere a context item's value shape is
 * chosen.
 */
export function EntryModeToggle({
  value,
  onChange,
  disabled,
  className,
}: EntryModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Value entry mode"
      className={cn(
        "inline-flex rounded-md border border-border bg-muted/40 p-0.5",
        className,
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === "direct"}
        disabled={disabled}
        onClick={() => onChange("direct")}
        className={cn(
          "flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors",
          value === "direct"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Type className="h-3.5 w-3.5" />
        Direct Entry
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "reference"}
        disabled={disabled}
        onClick={() => onChange("reference")}
        className={cn(
          "flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors",
          value === "reference"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Link2 className="h-3.5 w-3.5" />
        Reference
      </button>
    </div>
  );
}

export default EntryModeToggle;

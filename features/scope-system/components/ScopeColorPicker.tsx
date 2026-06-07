"use client";

import { useState } from "react";
import { Check, Palette } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  SCOPE_COLORS,
  pickColorByKey,
} from "@/features/scope-system/constants/scope-colors";

interface ScopeColorPickerProps {
  /** The currently selected color key (one of SCOPE_COLORS keys). */
  value: string | null | undefined;
  onChange: (colorKey: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Curated color picker for scope types. It iterates SCOPE_COLORS directly, so
 * every selectable color is guaranteed to resolve when the icon pill renders —
 * there is no palette/resolver mismatch and never a silent hash fallback.
 */
export function ScopeColorPicker({
  value,
  onChange,
  disabled,
  className,
}: ScopeColorPickerProps) {
  const [open, setOpen] = useState(false);
  const current = pickColorByKey(value ?? undefined);

  return (
    <div className={cn("flex h-11 items-center", className)}>
      <Popover open={open} onOpenChange={(o) => (disabled ? null : setOpen(o))}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`Color: ${current.label}`}
            className={cn(
              "flex items-center gap-2 h-10 rounded-md border border-input bg-background px-2.5 text-sm transition-colors",
              "hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <span
              className={cn(
                "h-5 w-5 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10 shrink-0",
                current.swatch,
              )}
            />
            <span className="text-muted-foreground">{current.label}</span>
            <Palette className="h-3.5 w-3.5 text-muted-foreground ml-0.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 bg-textured border-border shadow-lg rounded-xl">
          <div className="grid grid-cols-6 gap-1.5">
            {SCOPE_COLORS.map((c) => {
              const selected = c.key === current.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(c.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110",
                    c.swatch,
                    selected
                      ? "ring-2 ring-offset-2 ring-offset-background ring-foreground"
                      : "ring-1 ring-inset ring-black/10 dark:ring-white/10",
                  )}
                >
                  {selected && (
                    <Check className="h-3.5 w-3.5 text-white drop-shadow" />
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

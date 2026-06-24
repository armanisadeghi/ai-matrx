"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import IconResolver from "@/components/official/icons/IconResolver";
import {
  SHORTCUT_CONTEXTS,
  SHORTCUT_CONTEXT_META,
  isValidShortcutContext,
  type ShortcutContext,
} from "@/features/agents/utils/shortcut-context-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ShortcutContextsPickerProps {
  value: ShortcutContext[] | string[] | null | undefined;
  onChange: (value: ShortcutContext[]) => void;
  disabled?: boolean;
  className?: string;
}

function normalize(
  value: ShortcutContext[] | string[] | null | undefined,
): Set<ShortcutContext> {
  if (!value) return new Set();
  const result = new Set<ShortcutContext>();
  for (const v of value) {
    if (isValidShortcutContext(v)) result.add(v);
  }
  return result;
}

export function ShortcutContextsPicker({
  value,
  onChange,
  disabled,
  className,
}: ShortcutContextsPickerProps) {
  const selected = normalize(value);

  const toggle = (context: ShortcutContext) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(context)) {
      next.delete(context);
    } else {
      next.add(context);
    }
    onChange(SHORTCUT_CONTEXTS.filter((c) => next.has(c)));
  };

  const clearAll = () => {
    if (disabled) return;
    onChange([]);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-wrap gap-1.5">
          {SHORTCUT_CONTEXTS.map((context) => {
            const meta = SHORTCUT_CONTEXT_META[context];
            const isSelected = selected.has(context);
            return (
              <Tooltip key={context}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => toggle(context)}
                    disabled={disabled}
                    aria-pressed={isSelected}
                    className={cn(
                      "inline-flex items-center gap-1.5 h-7 px-2 rounded-md border text-xs font-medium transition-colors select-none",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      isSelected
                        ? "bg-primary/10 border-primary/40 text-foreground hover:bg-primary/15"
                        : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <IconResolver
                      iconName={meta.icon}
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        isSelected ? "text-primary" : "",
                      )}
                    />
                    <span>{meta.label}</span>
                    {isSelected && (
                      <Check className="h-3 w-3 text-primary shrink-0" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-medium">{meta.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {meta.description}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {context}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {selected.size === 0
            ? "None selected — available in every surface."
            : `${selected.size} selected — only shown in these surfaces.`}
        </p>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export default ShortcutContextsPicker;

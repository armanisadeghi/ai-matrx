"use client";

/**
 * RowChoicesButton — the choices arrow beside a collapsed variable row's text
 * box (AgentVariablesInline). It lists the variable's fixed choices; picking
 * one fills the box. It never replaces the box: typing any value stays allowed
 * (collapsed-row.ts explains why).
 *
 * Single choice closes on pick. Multiple (checkbox) toggles lines of the
 * newline-joined value and stays open so several can be ticked.
 */

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toggleMultiValue, type RowChoices } from "./collapsed-row";

interface RowChoicesButtonProps extends RowChoices {
  value: string;
  onChange: (value: string) => void;
  /** Variable label, for the button's accessible name. */
  label: string;
}

export function RowChoicesButton({
  options,
  multiple,
  value,
  onChange,
  label,
}: RowChoicesButtonProps) {
  const [open, setOpen] = useState(false);
  const picked = multiple
    ? new Set(value.split("\n").filter(Boolean))
    : new Set(value ? [value] : []);

  const pick = (option: string) => {
    if (multiple) {
      onChange(toggleMultiValue(value, option));
      return;
    }
    onChange(option);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Choose ${label}`}
          title="Show choices"
          data-row-choices
          className={cn(
            "shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-full transition-colors",
            open
              ? "text-foreground bg-muted/60"
              : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/60",
          )}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sizing="content" className="p-0">
        <Command>
          <CommandList className="max-h-72">
            <CommandGroup>
              {options.map((option) => {
                const selected = picked.has(option);
                return (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => pick(option)}
                    className="text-sm"
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 break-words">{option}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

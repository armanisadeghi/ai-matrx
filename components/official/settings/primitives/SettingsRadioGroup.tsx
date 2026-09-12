"use client";

import { useId } from "react";
import { SettingsRow } from "../SettingsRow";
import { cn } from "@/lib/utils";
import type { SettingsCommonProps, SettingsOption } from "../types";

export type SettingsRadioGroupProps<T extends string = string> =
  SettingsCommonProps & {
    value: T;
    onValueChange: (value: T) => void;
    options: SettingsOption<T>[];
    /** How the radio options are arranged. Defaults to "stacked" which is readable on mobile. */
    orientation?: "horizontal" | "stacked";
    last?: boolean;
  };

export function SettingsRadioGroup<T extends string = string>({
  value,
  onValueChange,
  options,
  orientation = "stacked",
  last,
  ...rowProps
}: SettingsRadioGroupProps<T>) {
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;

  return (
    <SettingsRow {...rowProps} id={id} variant="stacked" last={last}>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className={cn(
          orientation === "stacked" ? "flex flex-col gap-1.5" : "flex flex-wrap gap-2",
        )}
      >
        {options.map((opt) => {
          const isSelected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={opt.disabled || rowProps.disabled}
              onClick={() => onValueChange(opt.value)}
              className={cn(
                "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors",
                isSelected
                  ? "border-primary/60 bg-primary/5"
                  : "border-border hover:border-border hover:bg-accent/40",
                (opt.disabled || rowProps.disabled) &&
                  "opacity-50 cursor-not-allowed",
                orientation === "horizontal" && "flex-1 min-w-[120px]",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center",
                  isSelected ? "border-primary" : "border-muted-foreground/40",
                )}
              >
                {isSelected && (
                  <span className="h-2 w-2 rounded-full bg-primary" />
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  {opt.icon && <opt.icon className="h-3.5 w-3.5" />}
                  <span className="text-sm font-medium text-foreground">
                    {opt.label}
                  </span>
                </span>
                {opt.description && (
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {opt.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </SettingsRow>
  );
}

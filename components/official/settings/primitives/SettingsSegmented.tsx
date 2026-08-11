"use client";

import { SettingsRow } from "../SettingsRow";
import { cn } from "@/lib/utils";
import type {
  SettingsCommonProps,
  SettingsOption,
  SettingsControlSize,
} from "../types";

const sizeClass: Record<SettingsControlSize, string> = {
  sm: "h-7 text-xs",
  md: "h-8 text-sm",
  lg: "h-10 text-base",
};

export type SettingsSegmentedProps<T extends string = string> =
  SettingsCommonProps & {
    value: T;
    onValueChange: (value: T) => void;
    /** Read-only: shared vocabularies (agent-writable-settings) are `as const`. */
    options: readonly SettingsOption<T>[];
    size?: SettingsControlSize;
    /** Takes the full row width (stacks on mobile). */
    fullWidth?: boolean;
    last?: boolean;
  };

export function SettingsSegmented<T extends string = string>({
  value,
  onValueChange,
  options,
  size = "md",
  fullWidth,
  last,
  ...rowProps
}: SettingsSegmentedProps<T>) {
  const id =
    rowProps.id ??
    `settings-${rowProps.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <SettingsRow
      {...rowProps}
      id={id}
      variant={fullWidth ? "stacked" : "inline"}
      last={last}
    >
      <div
        role="tablist"
        className={cn(
          "inline-flex p-0.5 bg-muted rounded-md",
          fullWidth && "w-full",
        )}
      >
        {options.map((opt) => {
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={opt.disabled || rowProps.disabled}
              onClick={() => onValueChange(opt.value)}
              className={cn(
                "relative flex items-center justify-center rounded-[0.2rem] px-3 transition-all gap-1.5",
                sizeClass[size],
                fullWidth && "flex-1",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                (opt.disabled || rowProps.disabled) &&
                  "opacity-50 cursor-not-allowed",
              )}
            >
              {opt.icon && <opt.icon className="h-3.5 w-3.5" />}
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </SettingsRow>
  );
}

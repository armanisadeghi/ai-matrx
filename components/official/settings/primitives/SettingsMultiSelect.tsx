"use client";

import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { SettingsRow } from "../SettingsRow";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import type { SettingsCommonProps, SettingsOption } from "../types";

export type SettingsMultiSelectProps<T extends string = string> =
  SettingsCommonProps & {
    value: T[];
    onValueChange: (value: T[]) => void;
    options: SettingsOption<T>[];
    placeholder?: string;
    /** Maximum selected items. Extra selection attempts are ignored. */
    max?: number;
    /** Hide the selected tags display, show just a count ("3 selected"). */
    countOnly?: boolean;
    last?: boolean;
  };

export function SettingsMultiSelect<T extends string = string>({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  max,
  countOnly,
  last,
  ...rowProps
}: SettingsMultiSelectProps<T>) {
  const id =
    rowProps.id ??
    `settings-${rowProps.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const [open, setOpen] = useState(false);

  const selectedSet = new Set(value);
  const selectedOptions = options.filter((o) => selectedSet.has(o.value));

  const toggle = (v: T) => {
    if (selectedSet.has(v)) {
      onValueChange(value.filter((x) => x !== v));
    } else {
      if (max !== undefined && value.length >= max) return;
      onValueChange([...value, v]);
    }
  };

  const clearOne = (v: T) => onValueChange(value.filter((x) => x !== v));

  const summary = countOnly
    ? value.length === 0
      ? placeholder
      : `${value.length} selected`
    : null;

  return (
    <SettingsRow {...rowProps} id={id} variant="stacked" last={last}>
      <div className="space-y-2">
        {!countOnly && selectedOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedOptions.map((opt) => (
              <span
                key={opt.value}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground border border-border"
              >
                {opt.icon && <opt.icon className="h-3 w-3" />}
                {opt.label}
                {!rowProps.disabled && (
                  <button
                    type="button"
                    aria-label={`Remove ${opt.label}`}
                    onClick={() => clearOne(opt.value)}
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              id={id}
              type="button"
              disabled={rowProps.disabled}
              className="w-full flex items-center justify-between h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground shadow-sm transition-colors hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className={cn(
                  value.length === 0 && "text-muted-foreground",
                )}
              >
                {countOnly
                  ? summary
                  : value.length === 0
                    ? placeholder
                    : `${value.length} selected`}
              </span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[var(--radix-popover-trigger-width)] p-1"
          >
            <div className="max-h-64 overflow-y-auto">
              {options.map((opt) => {
                const isSelected = selectedSet.has(opt.value);
                const isDisabled =
                  opt.disabled ||
                  (!isSelected && max !== undefined && value.length >= max);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => toggle(opt.value)}
                    className={cn(
                      "w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm text-left transition-colors",
                      isSelected
                        ? "bg-primary/10 text-foreground"
                        : "text-foreground hover:bg-accent/50",
                      isDisabled && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-4 w-4 shrink-0 rounded border flex items-center justify-center",
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/40",
                      )}
                    >
                      {isSelected && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </span>
                    {opt.icon && <opt.icon className="h-3.5 w-3.5" />}
                    <span className="flex-1">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </SettingsRow>
  );
}

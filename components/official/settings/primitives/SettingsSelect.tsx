"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsRow } from "../SettingsRow";
import type {
  SettingsCommonProps,
  SettingsOption,
  SettingsControlSize,
} from "../types";

type Width = "auto" | "sm" | "md" | "lg" | "full";

const widthClass: Record<Width, string> = {
  auto: "w-auto min-w-32",
  sm: "w-32",
  md: "w-44",
  lg: "w-64",
  full: "w-full",
};

const triggerSize: Record<SettingsControlSize, "sm" | "default" | "lg"> = {
  sm: "sm",
  md: "default",
  lg: "lg",
};

export type SettingsSelectProps<T extends string = string> =
  SettingsCommonProps & {
    value: T;
    onValueChange: (value: T) => void;
    /** Read-only: shared vocabularies (agent-writable-settings) are `as const`. */
    options: readonly SettingsOption<T>[];
    placeholder?: string;
    size?: SettingsControlSize;
    width?: Width;
    /** Renders as a stacked layout. Use when the select should span full width. */
    stacked?: boolean;
    last?: boolean;
  };

export function SettingsSelect<T extends string = string>({
  value,
  onValueChange,
  options,
  placeholder,
  size = "md",
  width = "md",
  stacked,
  last,
  ...rowProps
}: SettingsSelectProps<T>) {
  const id =
    rowProps.id ??
    `settings-${rowProps.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const variant = stacked ? "stacked" : "inline";
  const effectiveWidth: Width = stacked ? "full" : width;

  return (
    <SettingsRow {...rowProps} id={id} variant={variant} last={last}>
      <Select
        value={value}
        onValueChange={(v) => onValueChange(v as T)}
        disabled={rowProps.disabled}
      >
        <SelectTrigger
          id={id}
          size={triggerSize[size]}
          className={widthClass[effectiveWidth]}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              disabled={opt.disabled}
            >
              <span className="flex items-center gap-2">
                {opt.icon && <opt.icon className="h-3.5 w-3.5" />}
                <span>{opt.label}</span>
              </span>
              {opt.description && (
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {opt.description}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

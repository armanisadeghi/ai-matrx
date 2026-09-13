"use client";

import { useId } from "react";
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
  auto: "w-full max-w-full @[40rem]/settings:w-auto @[40rem]/settings:min-w-32",
  sm: "w-32 max-w-full min-w-0",
  md: "w-44 max-w-full min-w-0",
  lg: "w-64 max-w-full min-w-0",
  full: "w-full",
};

const triggerSize: Record<SettingsControlSize, "sm" | "default" | "lg"> = {
  sm: "sm",
  md: "default",
  lg: "lg",
};

const triggerMinHeight: Record<SettingsControlSize, string> = {
  sm: "min-h-7",
  md: "min-h-9",
  lg: "min-h-10",
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
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;
  const variant = stacked ? "stacked" : "inline";
  const effectiveWidth: Width = stacked ? "full" : width;

  return (
    <SettingsRow
      {...rowProps}
      id={id}
      variant={variant}
      controlLayout="wide"
      last={last}
    >
      <Select
        value={value}
        onValueChange={(v) => onValueChange(v as T)}
        disabled={rowProps.disabled}
      >
        <SelectTrigger
          id={id}
          size={triggerSize[size]}
          className={`${widthClass[effectiveWidth]} h-auto ${triggerMinHeight[size]} whitespace-normal text-left [&>span]:line-clamp-none [&>span]:whitespace-normal`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              disabled={opt.disabled}
              // Outside ItemText via the prop — a description passed as a
              // child ends up inside the closed trigger and gets clipped.
              description={opt.description}
            >
              <span className="flex items-center gap-2">
                {opt.icon && <opt.icon className="h-3.5 w-3.5" />}
                <span>{opt.label}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

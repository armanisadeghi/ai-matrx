"use client";

import { ProTextarea } from "@/components/official/ProTextarea";
import { SettingsRow } from "../SettingsRow";
import type { SettingsCommonProps } from "../types";

export type SettingsProTextareaProps = SettingsCommonProps & {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  /** Pixel min height for the auto-grow textarea. */
  minHeight?: number;
  /** Pixel max height for the auto-grow textarea. */
  maxHeight?: number;
  last?: boolean;
};

/**
 * Settings wrapper around `ProTextarea` — gets you the mic + copy + auto-grow
 * features in any settings tab. Always stacked (the textarea spans the row).
 */
export function SettingsProTextarea({
  value,
  onValueChange,
  placeholder,
  rows,
  minHeight = 88,
  maxHeight = 240,
  last,
  ...rowProps
}: SettingsProTextareaProps) {
  const id =
    rowProps.id ??
    `settings-${rowProps.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <SettingsRow {...rowProps} id={id} variant="stacked" last={last}>
      <ProTextarea
        id={id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={rowProps.disabled}
        autoGrow
        minHeight={minHeight}
        maxHeight={maxHeight}
      />
    </SettingsRow>
  );
}

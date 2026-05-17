"use client";

import { TailwindColorPicker } from "@/components/ui/TailwindColorPicker";
import { SettingsRow } from "../SettingsRow";
import type { SettingsCommonProps } from "../types";

export type SettingsTailwindColorProps = SettingsCommonProps & {
  /** Tailwind color family name in lowercase: "blue", "red", "gray", etc. */
  value: string;
  onValueChange: (value: string) => void;
  /** Visual size of the swatch trigger. Defaults to "sm" for dense rows. */
  size?: "sm" | "md" | "lg";
  last?: boolean;
};

/**
 * Settings wrapper around `TailwindColorPicker`. Stores the lowercase color
 * family name ("blue", "violet", etc.) — NOT a hex string. Pair with a setting
 * typed as `string` and a default of e.g. "blue".
 */
export function SettingsTailwindColor({
  value,
  onValueChange,
  size = "sm",
  last,
  ...rowProps
}: SettingsTailwindColorProps) {
  const id =
    rowProps.id ??
    `settings-${rowProps.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <SettingsRow {...rowProps} id={id} variant="inline" last={last}>
      <TailwindColorPicker
        selectedColor={value}
        onColorChange={onValueChange}
        size={size}
      />
    </SettingsRow>
  );
}

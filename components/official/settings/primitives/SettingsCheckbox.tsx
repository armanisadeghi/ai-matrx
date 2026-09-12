"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { SettingsRow } from "../SettingsRow";
import type { SettingsCommonProps } from "../types";

export type SettingsCheckboxProps = SettingsCommonProps & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  last?: boolean;
};

/**
 * Use for opt-in / consent / "tick to enable" flows.
 * For app-level feature toggles, prefer SettingsSwitch.
 */
export function SettingsCheckbox({
  checked,
  onCheckedChange,
  last,
  ...rowProps
}: SettingsCheckboxProps) {
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;
  return (
    <SettingsRow {...rowProps} id={id} variant="inline" last={last}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(Boolean(v))}
        disabled={rowProps.disabled}
      />
    </SettingsRow>
  );
}

"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { SettingsRow } from "../SettingsRow";
import type { SettingsCommonProps } from "../types";

export type SettingsSwitchProps = SettingsCommonProps & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Controls whether the row renders a border underneath. */
  last?: boolean;
};

export function SettingsSwitch({
  checked,
  onCheckedChange,
  last,
  ...rowProps
}: SettingsSwitchProps) {
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;
  return (
    <SettingsRow {...rowProps} id={id} variant="inline" last={last}>
      {/* The switch stays its painted size; its label carries the 44px
          touch ring (matrx-tap-area) so a finger can hit it on a phone. */}
      <label htmlFor={id} className="matrx-tap-area inline-flex">
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={rowProps.disabled}
        />
      </label>
    </SettingsRow>
  );
}

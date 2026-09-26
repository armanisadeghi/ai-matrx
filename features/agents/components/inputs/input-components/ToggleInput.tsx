import React from "react";
import { Switch } from "@/components/ui/switch";
import LightSwitchToggle from "@/components/matrx/LightSwitchToggle";

interface ToggleInputProps {
  value: string;
  onChange: (value: string) => void;
  offLabel?: string;
  onLabel?: string;
  variableName: string;
  compact?: boolean;
  wizardMode?: boolean;
  threeDMode?: boolean;
  containerWidth?: number;
}

/**
 * Toggle Input - Returns text value based on toggle state
 */
export function ToggleInput({
  value,
  onChange,
  offLabel = "No",
  onLabel = "Yes",
  variableName,
  compact = false,
  wizardMode = false,
  threeDMode = false,
  containerWidth = 0,
}: ToggleInputProps) {
  const isOn = value === onLabel;

  const handleToggle = (checked: boolean) => {
    onChange(checked ? onLabel : offLabel);
  };

  return threeDMode ? (
    <div className="flex items-center justify-center pb-4">
      <LightSwitchToggle
        value={isOn}
        onChange={(checked) => handleToggle(checked)}
        labels={{ on: onLabel, off: offLabel }}
        variant="rounded"
        width="w-64"
        height="h-12"
      />
    </div>
  ) : (
    // The switch says what it is set to, next to it — the field's own label
    // already names it. "Off / On · Currently: On" said the same thing twice.
    <label
      className={
        compact
          ? "inline-flex min-h-7 cursor-pointer items-center gap-2"
          : "inline-flex min-h-9 cursor-pointer items-center gap-2.5"
      }
    >
      <Switch
        checked={isOn}
        onCheckedChange={handleToggle}
        aria-label={variableName}
      />
      <span
        className={
          compact
            ? "text-xs font-medium text-foreground"
            : "text-sm font-medium text-foreground"
        }
      >
        {isOn ? onLabel : offLabel}
      </span>
    </label>
  );
}

"use client";

import { Slider } from "@/components/ui/slider";
import { SettingsRow } from "../SettingsRow";
import type { SettingsCommonProps } from "../types";

export type SettingsSliderProps = SettingsCommonProps & {
  value: number;
  onValueChange: (value: number) => void;
  /**
   * Fires once when the drag ends (Radix onValueCommit). Use it when each
   * write is a network/database round-trip: track the drag with local state
   * via `onValueChange`, persist here.
   */
  onValueCommit?: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Label shown on the low end (e.g. "Slow"). */
  minLabel?: string;
  /** Label shown in the middle (e.g. "Balanced"). */
  midLabel?: string;
  /** Label shown on the high end (e.g. "Fast"). */
  maxLabel?: string;
  /** Fixed decimal places for the numeric display. Defaults to 0 for ints, 2 for floats. */
  precision?: number;
  /** Optional unit string shown next to value (e.g. "px", "%"). */
  unit?: string;
  last?: boolean;
};

export function SettingsSlider({
  value,
  onValueChange,
  onValueCommit,
  min,
  max,
  step = 1,
  minLabel,
  midLabel,
  maxLabel,
  precision,
  unit,
  last,
  ...rowProps
}: SettingsSliderProps) {
  const id =
    rowProps.id ??
    `settings-${rowProps.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const effectivePrecision =
    precision !== undefined
      ? precision
      : step >= 1 || Number.isInteger(step)
        ? 0
        : 2;
  const display = value.toFixed(effectivePrecision);

  return (
    <SettingsRow {...rowProps} id={id} variant="stacked" last={last}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {display}
            {unit}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {min} – {max}
          </span>
        </div>
        <Slider
          id={id}
          min={min}
          max={max}
          step={step}
          value={[value]}
          onValueChange={(v) => onValueChange(v[0])}
          onValueCommit={
            onValueCommit ? (v) => onValueCommit(v[0]) : undefined
          }
          disabled={rowProps.disabled}
        />
        {(minLabel || midLabel || maxLabel) && (
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{minLabel}</span>
            <span className="hidden sm:inline">{midLabel}</span>
            <span>{maxLabel}</span>
          </div>
        )}
      </div>
    </SettingsRow>
  );
}

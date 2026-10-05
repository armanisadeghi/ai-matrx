"use client";

import { useId } from "react";
import { SettingsRow } from "../SettingsRow";
import { Tabs } from "@ai-matrx/design-system/controls";
import type {
  SettingsCommonProps,
  SettingsOption,
  SettingsControlSize,
} from "../types";

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
  fullWidth,
  last,
  // `size` is retired: the control has one geometry.
  size: _size,
  ...rowProps
}: SettingsSegmentedProps<T>) {
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;

  return (
    <SettingsRow
      {...rowProps}
      id={id}
      variant={fullWidth ? "stacked" : "inline"}
      controlLayout="wide"
      last={last}
    >
      <Tabs
        variant="capsule"
        aria-label={rowProps.label}
        value={value}
        onValueChange={onValueChange}
        data={options.map((opt) => ({
          value: opt.value,
          label: opt.icon ? (
            <>
              <opt.icon />
              {opt.label}
            </>
          ) : (
            opt.label
          ),
          disabled: opt.disabled || rowProps.disabled,
        }))}
      />
    </SettingsRow>
  );
}

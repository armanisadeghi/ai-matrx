import React from "react";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { Button, SegmentedControl } from "@ai-matrx/design-system/controls";

interface PillToggleInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  variableName: string;
  compact?: boolean;
  wizardMode?: boolean;
  containerWidth?: number;
}

/**
 * Pill Toggle Input - Segmented pill control for single-select.
 * Only for ≤ 4 short options (THE CHOICE RULE, features/agents/utils/choice-rule.ts —
 * VariableInputComponent draws longer lists as a select). Returns the option as text.
 */
export function PillToggleInput({
  value,
  onChange,
  options,
  variableName,
  compact = false,
  containerWidth = 0,
}: PillToggleInputProps) {
  const height = compact ? "min-h-7" : "min-h-8";
  const textSize = compact ? "text-xs" : "text-sm";
  const px = compact ? "px-2.5" : "px-3";

  return (
    <SegmentedControl aria-label={humanizeIdentifier(variableName)} fill value={value} onValueChange={onChange} data={options.map((option) => ({ value: option, label: option }))} />
  );
}

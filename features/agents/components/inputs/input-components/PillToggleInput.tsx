import React from "react";

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
    <div
      className="inline-flex w-full rounded-md border border-border bg-muted p-0.5 gap-0.5"
      role="radiogroup"
      aria-label={variableName}
    >
      {options.map((option) => {
        const isSelected = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option)}
            className={`
              min-w-0 flex-1 ${height} ${px} ${textSize} whitespace-normal break-words rounded font-medium leading-tight transition-all duration-150
              focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring
              ${
                isSelected
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              }
            `}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

import React from "react";
import { Slider } from "@/components/ui/slider";

interface SliderInputProps {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Shown after the value ("s", "%"). */
  unit?: string;
  variableName: string;
  compact?: boolean;
  wizardMode?: boolean;
  containerWidth?: number;
}

/**
 * Slider Input - Range slider that returns the value as text.
 * Falls back to min when value is empty or non-numeric.
 */
export function SliderInput({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  compact = false,
}: SliderInputProps) {
  const withUnit = (n: number) =>
    unit ? `${n}${unit === "%" || unit === "s" ? "" : " "}${unit}` : String(n);
  const numValue = parseFloat(value);
  const safeValue = isNaN(numValue)
    ? min
    : Math.min(Math.max(numValue, min), max);

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div className="flex items-center justify-between">
        <span
          className={
            compact
              ? "text-[11px] text-muted-foreground"
              : "text-xs text-muted-foreground"
          }
        >
          {withUnit(min)}
        </span>
        <span
          className={
            compact
              ? "text-xs font-medium tabular-nums"
              : "text-sm font-medium tabular-nums"
          }
        >
          {withUnit(safeValue)}
        </span>
        <span
          className={
            compact
              ? "text-[11px] text-muted-foreground"
              : "text-xs text-muted-foreground"
          }
        >
          {withUnit(max)}
        </span>
      </div>
      <Slider
        value={[safeValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(String(v))}
        className="w-full"
      />
    </div>
  );
}

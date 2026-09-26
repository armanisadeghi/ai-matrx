import React from "react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

interface NumberInputProps {
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
 * Number Input - Returns number as text with optional min/max/step controls
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  variableName,
  compact = false,
  wizardMode = false,
}: NumberInputProps) {
  const numValue = parseFloat(value) || 0;

  // Round to the step's precision so 0.1 + 0.2 never shows 0.30000000000000004.
  const decimals = (String(step).split(".")[1] ?? "").length;
  const roundToStep = (n: number) => Number(n.toFixed(decimals));

  const handleIncrement = () => {
    const newValue = roundToStep(numValue + step);
    if (max === undefined || newValue <= max) {
      onChange(newValue.toString());
    }
  };

  const handleDecrement = () => {
    const newValue = roundToStep(numValue - step);
    if (min === undefined || newValue >= min) {
      onChange(newValue.toString());
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const canDecrement = min === undefined || numValue > min;
  const canIncrement = max === undefined || numValue < max;

  return (
    <div
      className={
        compact ? "flex items-center gap-1" : "flex items-center gap-2"
      }
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDecrement}
        disabled={!canDecrement}
        className={
          compact ? "h-7 w-7 rounded-full p-0" : "h-10 w-10 rounded-full p-0"
        }
      >
        <Minus className={compact ? "w-3 h-3" : "w-4 h-4"} />
      </Button>

      <div className="relative min-w-0 flex-1">
        <Input
          type="text"
          value={value}
          onChange={handleInputChange}
          className={
            compact
              ? "text-center bg-transparent text-sm font-medium h-7 border border-border rounded-full"
              : "text-center bg-transparent text-lg font-medium border border-border rounded-full"
          }
          placeholder="0"
        />
        {unit && (
          <span
            className={
              compact
                ? "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                : "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
            }
          >
            {unit}
          </span>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleIncrement}
        disabled={!canIncrement}
        className={
          compact ? "h-7 w-7 rounded-full p-0" : "h-10 w-10 rounded-full p-0"
        }
      >
        <Plus className={compact ? "w-3 h-3" : "w-4 h-4"} />
      </Button>
    </div>
  );
}

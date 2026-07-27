import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

interface NumberInputProps {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
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
  variableName,
  compact = false,
  wizardMode = false,
}: NumberInputProps) {
  const numValue = parseFloat(value) || 0;

  const handleIncrement = () => {
    const newValue = numValue + step;
    if (max === undefined || newValue <= max) {
      onChange(newValue.toString());
    }
  };

  const handleDecrement = () => {
    const newValue = numValue - step;
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
          compact
            ? "h-7 w-7 rounded-full p-0"
            : "h-10 w-10 rounded-full p-0"
        }
      >
        <Minus className={compact ? "w-3 h-3" : "w-4 h-4"} />
      </Button>

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

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleIncrement}
        disabled={!canIncrement}
        className={
          compact
            ? "h-7 w-7 rounded-full p-0"
            : "h-10 w-10 rounded-full p-0"
        }
      >
        <Plus className={compact ? "w-3 h-3" : "w-4 h-4"} />
      </Button>
    </div>
  );
}

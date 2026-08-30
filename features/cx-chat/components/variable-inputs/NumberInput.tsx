import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@ai-matrx/design-system';
import { Button } from '@/components/ui/button';
import { Minus, Plus } from 'lucide-react';

interface NumberInputProps {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  variableName: string;
  compact?: boolean;
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
  compact = false
}: NumberInputProps) {
  const numValue = parseFloat(value) || 0;
  const isValidNumber = !isNaN(parseFloat(value));
  
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
    const newValue = e.target.value;
    // Allow empty string, numbers, and decimal points
    if (newValue === '' || newValue === '-' || !isNaN(parseFloat(newValue))) {
      onChange(newValue);
    }
  };
  
  const canDecrement = min === undefined || numValue > min;
  const canIncrement = max === undefined || numValue < max;
  
  return (
    <div className={compact ? "space-y-1" : "space-y-4"}>
      {/* Show warning if not a valid number */}
      {value && !isValidNumber && (
        <div className={compact ? "p-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded" : "p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"}>
          <p className={compact ? "text-[11px] font-medium text-amber-800 dark:text-amber-300 mb-0.5" : "text-xs font-medium text-amber-800 dark:text-amber-300 mb-1"}>
            Current value:
          </p>
          <p className={compact ? "text-xs text-amber-900 dark:text-amber-200" : "text-sm text-amber-900 dark:text-amber-200"}>
            {value}
          </p>
          <p className={compact ? "text-[11px] text-amber-700 dark:text-amber-400 mt-0.5" : "text-xs text-amber-700 dark:text-amber-400 mt-1"}>
            Enter a valid number below to replace
          </p>
        </div>
      )}
      
      <div className={compact ? "flex items-center gap-1" : "flex items-center gap-2"}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDecrement}
          disabled={!canDecrement}
          className={compact ? "h-7 w-7 p-0" : "h-10 w-10 p-0"}
        >
          <Minus className={compact ? "w-3 h-3" : "w-4 h-4"} />
        </Button>
        
        <Input
          type="text"
          value={value}
          onChange={handleInputChange}
          className={compact ? "text-center text-sm font-medium h-7" : "text-center text-lg font-medium"}
          placeholder="0"
        />
        
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleIncrement}
          disabled={!canIncrement}
          className={compact ? "h-7 w-7 p-0" : "h-10 w-10 p-0"}
        >
          <Plus className={compact ? "w-3 h-3" : "w-4 h-4"} />
        </Button>
      </div>
    </div>
  );
}


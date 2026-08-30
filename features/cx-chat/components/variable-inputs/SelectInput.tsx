import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface SelectInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  variableName: string;
  allowOther?: boolean;
  compact?: boolean;
}

// Placeholder for empty or whitespace-only values
const EMPTY_VALUE_PLACEHOLDER = '(empty)';

/**
 * Checks if a value is empty or contains only whitespace
 */
const isEmptyOrWhitespace = (value: string): boolean => {
  return !value || value.trim() === '';
};

/**
 * Converts empty/whitespace values to placeholder for display in Select
 */
const toDisplayValue = (value: string): string => {
  return isEmptyOrWhitespace(value) ? EMPTY_VALUE_PLACEHOLDER : value;
};

/**
 * Converts display value back to original value (empty string if placeholder)
 */
const fromDisplayValue = (displayValue: string): string => {
  return displayValue === EMPTY_VALUE_PLACEHOLDER ? '' : displayValue;
};

/**
 * Select Input - Dropdown single select that returns selected option as text
 */
export function SelectInput({ 
  value, 
  onChange, 
  options,
  variableName,
  allowOther = false,
  compact = false
}: SelectInputProps) {
  // Convert options to display values for comparison
  const displayOptions = options.map(toDisplayValue);
  const displayValue = toDisplayValue(value);
  
  const isValueInOptions = displayOptions.includes(displayValue);
  const isOtherValue = value.startsWith('Other: ');
  const otherText = isOtherValue ? value.substring(7) : '';
  
  const [selectedOption, setSelectedOption] = useState<string>(() => {
    if (isValueInOptions) return displayValue;
    if (isOtherValue) return 'Other';
    return displayValue;
  });
  
  const [customText, setCustomText] = useState<string>(otherText);
  
  // Update when value changes externally
  useEffect(() => {
    const newDisplayValue = toDisplayValue(value);
    if (isValueInOptions) {
      setSelectedOption(newDisplayValue);
      setCustomText('');
    } else if (isOtherValue) {
      setSelectedOption('Other');
      setCustomText(value.substring(7));
    }
  }, [value, isValueInOptions, isOtherValue]);
  
  const handleSelectChange = (newDisplayValue: string) => {
    setSelectedOption(newDisplayValue);
    if (newDisplayValue === 'Other') {
      // When "Other" is selected, send the current custom text
      onChange(customText ? `Other: ${customText}` : 'Other: ');
    } else {
      // Convert display value back to actual value (empty string if placeholder)
      const actualValue = fromDisplayValue(newDisplayValue);
      onChange(actualValue);
      setCustomText('');
    }
  };
  
  const handleCustomTextChange = (text: string) => {
    setCustomText(text);
    onChange(`Other: ${text}`);
  };
  
  const showNonMatchingValue = value && !isValueInOptions && !isOtherValue;
  
  return (
    <div className={compact ? "space-y-1" : "space-y-4"}>
      {/* Show current value if it doesn't match any option */}
      {showNonMatchingValue && (
        <div className={compact ? "p-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded" : "p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"}>
          <p className={compact ? "text-[11px] font-medium text-amber-800 dark:text-amber-300 mb-0.5" : "text-xs font-medium text-amber-800 dark:text-amber-300 mb-1"}>
            Current value:
          </p>
          <p className={compact ? "text-xs text-amber-900 dark:text-amber-200" : "text-sm text-amber-900 dark:text-amber-200"}>
            {value || '(empty)'}
          </p>
          <p className={compact ? "text-[11px] text-amber-700 dark:text-amber-400 mt-0.5" : "text-xs text-amber-700 dark:text-amber-400 mt-1"}>
            Select an option below to replace
          </p>
        </div>
      )}
      
      <div className={compact ? "space-y-1" : "space-y-3"}>
        <Select value={selectedOption} onValueChange={handleSelectChange}>
          <SelectTrigger className={compact ? "w-full h-8 text-xs" : "w-full"}>
            <SelectValue placeholder="Choose an option..." />
          </SelectTrigger>
          <SelectContent>
            {options.map((option, index) => {
              // Convert empty/whitespace values to placeholder for SelectItem
              const displayOption = toDisplayValue(option);
              // Use index in key to handle duplicate empty values
              const itemKey = isEmptyOrWhitespace(option) ? `empty-${index}` : option;
              
              return (
                <SelectItem key={itemKey} value={displayOption}>
                  {displayOption}
                </SelectItem>
              );
            })}
            {allowOther && (
              <SelectItem value="Other">
                Other
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        
        {/* Custom text input when "Other" is selected */}
        {selectedOption === 'Other' && (
          <div className={compact ? "pt-1" : "pt-2"}>
            <Textarea
              value={customText}
              onChange={(e) => handleCustomTextChange(e.target.value)}
              placeholder="Enter custom value..."
              className={compact ? "min-h-[60px] text-xs" : "min-h-[80px] text-sm"}
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

interface CheckboxGroupInputProps {
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
 * Converts empty/whitespace values to placeholder for display
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
 * Checkbox Group Input - Multi-select that returns selected options as newline-separated text
 */
export function CheckboxGroupInput({ 
  value, 
  onChange, 
  options,
  variableName,
  allowOther = false,
  compact = false
}: CheckboxGroupInputProps) {
  // Parse current value into array of selected items
  const selectedItems = value ? value.split('\n').filter(Boolean) : [];
  
  // Check for "Other:" value
  const otherItem = selectedItems.find(item => item.startsWith('Other: '));
  const otherText = otherItem ? otherItem.substring(7) : '';
  const isOtherChecked = !!otherItem;
  
  // Get non-other selected items
  const regularSelectedItems = selectedItems.filter(item => !item.startsWith('Other: '));
  
  // Check if all regular selected items are in options (considering display values)
  const displayOptions = options.map(toDisplayValue);
  const hasNonOptionValues = regularSelectedItems.some(item => {
    const displayItem = toDisplayValue(item);
    return !displayOptions.includes(displayItem) && !options.includes(item);
  });
  
  const [customText, setCustomText] = useState<string>(otherText);
  
  // Update customText when value changes externally
  useEffect(() => {
    if (otherItem) {
      setCustomText(otherItem.substring(7));
    } else {
      setCustomText('');
    }
  }, [otherItem]);
  
  const handleToggle = (displayOption: string, checked: boolean) => {
    // Convert display value back to actual value
    const actualOption = fromDisplayValue(displayOption);
    
    let newSelected: string[];
    
    if (checked) {
      // Add option if not already selected
      newSelected = [...selectedItems.filter(item => item !== actualOption && !item.startsWith('Other: ')), actualOption];
      // Re-add other if it was checked
      if (isOtherChecked) {
        newSelected.push(`Other: ${customText}`);
      }
    } else {
      // Remove option
      newSelected = selectedItems.filter(item => item !== actualOption);
    }
    
    // Convert back to newline-separated string
    onChange(newSelected.join('\n'));
  };
  
  const handleOtherToggle = (checked: boolean) => {
    let newSelected: string[];
    
    if (checked) {
      // Add "Other:" with current custom text
      newSelected = [...regularSelectedItems, `Other: ${customText}`];
    } else {
      // Remove any "Other:" entries
      newSelected = regularSelectedItems;
    }
    
    onChange(newSelected.join('\n'));
  };
  
  const handleCustomTextChange = (text: string) => {
    setCustomText(text);
    // Update the value with new custom text
    const newSelected = [...regularSelectedItems, `Other: ${text}`];
    onChange(newSelected.join('\n'));
  };
  
  return (
    <div className={compact ? "space-y-1" : "space-y-4"}>
      {/* Show current value if it contains non-option values */}
      {value && hasNonOptionValues && (
        <div className={compact ? "p-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded" : "p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"}>
          <p className={compact ? "text-[11px] font-medium text-amber-800 dark:text-amber-300 mb-0.5" : "text-xs font-medium text-amber-800 dark:text-amber-300 mb-1"}>
            Current values:
          </p>
          <div className={compact ? "text-xs text-amber-900 dark:text-amber-200 space-y-0.5" : "text-sm text-amber-900 dark:text-amber-200 space-y-0.5"}>
            {regularSelectedItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {!options.includes(item) && (
                  <span className={compact ? "text-[11px] bg-amber-200 dark:bg-amber-800 px-1 rounded" : "text-xs bg-amber-200 dark:bg-amber-800 px-1 rounded"}>Custom</span>
                )}
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p className={compact ? "text-[11px] text-amber-700 dark:text-amber-400 mt-0.5" : "text-xs text-amber-700 dark:text-amber-400 mt-1"}>
            Select options below to replace
          </p>
        </div>
      )}
      
      <div className={compact ? "space-y-1" : "space-y-2"}>
        {options.map((option, index) => {
          // Convert empty/whitespace values to placeholder for display
          const displayOption = toDisplayValue(option);
          const actualOption = option; // Keep original for comparison
          
          // Check if this option (in its original form) is selected
          const isChecked = regularSelectedItems.includes(actualOption);
          
          // Use index in key and id to handle duplicate empty values
          const itemKey = isEmptyOrWhitespace(option) ? `empty-${index}` : option;
          const itemId = `${variableName}-${displayOption}-${index}`;
          
          return (
            <div 
              key={itemKey}
              className={compact ? "flex items-center space-x-2 p-1 bg-background rounded border-border hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer" : "flex items-center space-x-3 p-3 bg-background rounded-lg border-border hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer"}
              onClick={() => handleToggle(displayOption, !isChecked)}
            >
              <Checkbox 
                checked={isChecked}
                onCheckedChange={(checked) => handleToggle(displayOption, checked as boolean)}
                id={itemId}
              />
              <Label 
                htmlFor={itemId}
                className={compact ? "flex-1 text-xs cursor-pointer" : "flex-1 text-sm cursor-pointer"}
              >
                {displayOption}
              </Label>
            </div>
          );
        })}
        
        {/* "Other" option */}
        {allowOther && (
          <div className={compact ? "space-y-1" : "space-y-2"}>
            <div 
              className={compact ? "flex items-center space-x-2 p-1 bg-background rounded border-border hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer" : "flex items-center space-x-3 p-3 bg-background rounded-lg border-border hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer"}
              onClick={() => handleOtherToggle(!isOtherChecked)}
            >
              <Checkbox 
                checked={isOtherChecked}
                onCheckedChange={(checked) => handleOtherToggle(checked as boolean)}
                id={`${variableName}-other`}
              />
              <Label 
                htmlFor={`${variableName}-other`}
                className={compact ? "flex-1 text-xs cursor-pointer" : "flex-1 text-sm cursor-pointer"}
              >
                Other
              </Label>
            </div>
            
            {/* Custom text input when "Other" is checked */}
            {isOtherChecked && (
              <div className={compact ? "ml-6 pl-2" : "ml-9 pl-3"}>
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
        )}
      </div>
      
      {!compact && selectedItems.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Selected: {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}


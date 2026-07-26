"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from "@/lib/redux/brokerSlice/selectors";
import { brokerActions } from "@/lib/redux/brokerSlice/slice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { cn } from "@/lib/utils";
import { CommonFieldProps } from "./core/types";

const SimpleNumberField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
  const { 
    id, 
    label, 
    placeholder = "Enter a number", 
    componentProps,
    required,
    defaultValue
  } = field;
  
  const { 
    width, 
    customContent, 
    min, // Optional min
    max, // Optional max
    valuePrefix = "",
    valueSuffix = ""
  } = componentProps;
  
  const safeWidthClass = ensureValidWidthClass(width);
  
  const dispatch = useAppDispatch();
  const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }));
  const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

  const updateBrokerValue = useCallback(
      (updatedValue: any) => {
          dispatch(
              brokerActions.setValue({
                  brokerId,
                  value: updatedValue,
              })
          );
      },
      [dispatch, brokerId]
  );

// Local state for the input value
  const [inputValue, setInputValue] = useState<string>("");
  
  // Initialize state if needed
  useEffect(() => {
    if (stateValue === undefined && defaultValue !== undefined) {
      const initialValue = Number(defaultValue);
      
      updateBrokerValue(initialValue);
      
      setInputValue(String(initialValue));
    } else if (stateValue !== undefined) {
      // Update input value when state changes
      setInputValue(String(stateValue));
    }
  }, [stateValue, defaultValue, dispatch, id]);
  
  // Handler for input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputStr = e.target.value;
    setInputValue(inputStr);
    
    // If the input is empty or just a minus sign or decimal point, don't update the state yet
    if (inputStr === "" || inputStr === "-" || inputStr === "." || inputStr === "-.") {
      return;
    }
    
    // Allow any valid number including decimals
    if (/^-?\d*\.?\d*$/.test(inputStr)) {
      const parsedValue = parseFloat(inputStr);
      if (!isNaN(parsedValue)) {
        // Apply min/max constraints if they exist
        let validValue = parsedValue;
        if (min !== undefined) {
          validValue = Math.max(min, validValue);
        }
        if (max !== undefined) {
          validValue = Math.min(max, validValue);
        }
        
        updateBrokerValue({
          value: validValue,
        });
      }
    }
  };
  
  // Handler for blur (focus lost) on input
  const handleBlur = () => {
    // If input is empty or just a sign/decimal, reset to empty or 0
    if (inputValue === "" || inputValue === "-" || inputValue === "." || inputValue === "-.") {
      if (required) {
        const resetValue = 0;
        setInputValue(String(resetValue));
        updateBrokerValue({
          value: resetValue,
        });
      } else {
        setInputValue("");
        updateBrokerValue({
          value: null,
        });
      }
      return;
    }
    
    // Make sure the displayed value matches the actual value after validation
    const parsedValue = parseFloat(inputValue);
    if (!isNaN(parsedValue)) {
      // Apply min/max constraints if they exist
      let validValue = parsedValue;
      if (min !== undefined) {
        validValue = Math.max(min, validValue);
      }
      if (max !== undefined) {
        validValue = Math.min(max, validValue);
      }
      
      setInputValue(String(validValue));
      updateBrokerValue({
        value: validValue,
      });
    }
  };
  
  // Check if validation error (required but no valid value)
  const hasValidationError = required && (stateValue === undefined || stateValue === null);
  const numericStateValue = typeof stateValue === "number" ? stateValue : undefined;
  
  // Check if value is outside min/max range
  const isOutOfRange = 
    (min !== undefined && numericStateValue !== undefined && numericStateValue < min) ||
    (max !== undefined && numericStateValue !== undefined && numericStateValue > max);
  
  // Render custom content if provided
  if (customContent) {
    return <>{customContent}</>;
  }
  
  return (
    <div className={`${safeWidthClass} ${className}`}>
      <div className="relative">
        {valuePrefix && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <span className="text-gray-500 dark:text-gray-400">{valuePrefix}</span>
          </div>
        )}
        
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2",
            "focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700",
            "text-gray-700 dark:text-gray-300 bg-textured",
            valuePrefix && "pl-8",
            valueSuffix && "pr-8",
            (hasValidationError || isOutOfRange) && "border-red-500",
            disabled && "opacity-60 cursor-not-allowed"
          )}
        />
        
        {valueSuffix && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <span className="text-gray-500 dark:text-gray-400">{valueSuffix}</span>
          </div>
        )}
      </div>
      
      {/* Validation message */}
      {hasValidationError && (
        <div className="text-red-500 text-sm mt-1">
          Please enter a number.
        </div>
      )}
      
      {/* Out of range message */}
      {isOutOfRange && (
        <div className="text-red-500 text-sm mt-1">
          {min !== undefined && max !== undefined
            ? `Value must be between ${min} and ${max}.`
            : min !== undefined
              ? `Value must be at least ${min}.`
              : `Value must be at most ${max}.`
          }
        </div>
      )}
      
      {/* Min/Max hint if provided */}
      {(min !== undefined || max !== undefined) && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {min !== undefined && max !== undefined
            ? `Range: ${valuePrefix}${min}${valueSuffix} to ${valuePrefix}${max}${valueSuffix}`
            : min !== undefined
              ? `Min: ${valuePrefix}${min}${valueSuffix}`
              : `Max: ${valuePrefix}${max}${valueSuffix}`
          }
        </div>
      )}
    </div>
  );
};

export default SimpleNumberField;

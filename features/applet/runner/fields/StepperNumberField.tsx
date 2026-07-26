"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommonFieldProps } from "./core/types";

const StepperNumberField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, placeholder = "0", componentProps, required, defaultValue } = field;

    const { width, customContent, min = 0, max = 100, step = 1, valuePrefix = "", valueSuffix = "" } = componentProps;

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
        if (stateValue === undefined) {
            const initialValue = defaultValue !== undefined ? Number(defaultValue) : 0;

            updateBrokerValue(initialValue);

            setInputValue(String(initialValue));
        } else {
            // Update input value when state changes
            setInputValue(String(stateValue));
        }
    }, [stateValue, defaultValue, dispatch, id]);

    // Function to ensure the value respects min, max, and step
    const validateValue = (value: number): number => {
        // First, ensure value is in bounds
        let validValue = Math.max(min, Math.min(max, value));

        // Then, ensure it respects step by rounding to the nearest step
        const stepsFromMin = Math.round((validValue - min) / step);
        validValue = min + stepsFromMin * step;

        // Ensure we stay within bounds after step adjustment
        validValue = Math.max(min, Math.min(max, validValue));

        return validValue;
    };

    // Handler for input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputStr = e.target.value;
        setInputValue(inputStr);

        // If the input is empty or just a minus sign, don't update the state yet
        if (inputStr === "" || inputStr === "-") {
            return;
        }

        const parsedValue = parseFloat(inputStr);
        if (!isNaN(parsedValue)) {
            updateBrokerValue(validateValue(parsedValue));
        }
    };

    // Handler for blur (focus lost) on input
    const handleBlur = () => {
        // If input is empty, reset to 0 or min
        if (inputValue === "" || inputValue === "-") {
            const resetValue = validateValue(0);
            setInputValue(String(resetValue));
            updateBrokerValue(resetValue);
            return;
        }

        // Make sure the displayed value matches the actual value after validation
        const parsedValue = parseFloat(inputValue);
        if (!isNaN(parsedValue)) {
            const validatedValue = validateValue(parsedValue);
            setInputValue(String(validatedValue));
            updateBrokerValue(validatedValue);
        }
    };

    // Handler for decrement button
    const handleDecrement = () => {
        if (disabled) return;

        const currentValue = stateValue !== undefined ? Number(stateValue) : 0;
        const newValue = validateValue(currentValue - step);

        setInputValue(String(newValue));
        updateBrokerValue(newValue);
    };

    // Handler for increment button
    const handleIncrement = () => {
        if (disabled) return;

        const currentValue = stateValue !== undefined ? Number(stateValue) : 0;
        const newValue = validateValue(currentValue + step);

        setInputValue(String(newValue));
        updateBrokerValue(newValue);
    };

    // Check if decrement/increment buttons should be disabled
    const isDecrementDisabled = disabled || (stateValue !== undefined && Number(stateValue) <= min);
    const isIncrementDisabled = disabled || (stateValue !== undefined && Number(stateValue) >= max);

    // Check if validation error (required but no valid value)
    const hasValidationError = required && stateValue === undefined;

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <div
                className={cn(
                    "flex items-center h-10 rounded-md border border-border",
                    hasValidationError && "border-red-500",
                    disabled && "opacity-60"
                )}
            >
                {/* Decrement button */}
                <button
                    type="button"
                    onClick={handleDecrement}
                    disabled={isDecrementDisabled}
                    aria-label="Decrease value"
                    className={cn(
                        "flex items-center justify-center h-full px-3 text-gray-600 dark:text-gray-400 transition-colors",
                        "hover:bg-gray-100 dark:hover:bg-gray-800 rounded-l-md",
                        "focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 focus:ring-inset",
                        isDecrementDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent"
                    )}
                >
                    <Minus className="h-4 w-4" />
                </button>

                {/* Input field */}
                <div className="relative flex-1">
                    {valuePrefix && (
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400">
                            {valuePrefix}
                        </span>
                    )}
                    <input
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onBlur={handleBlur}
                        disabled={disabled}
                        placeholder={placeholder}
                        className={cn(
                            "w-full h-full bg-transparent text-center text-gray-700 dark:text-gray-300 focus:outline-none",
                            valuePrefix && "pl-6",
                            valueSuffix && "pr-6"
                        )}
                        aria-label={`${label || id} value`}
                    />
                    {valueSuffix && (
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400">
                            {valueSuffix}
                        </span>
                    )}
                </div>

                {/* Increment button */}
                <button
                    type="button"
                    onClick={handleIncrement}
                    disabled={isIncrementDisabled}
                    aria-label="Increase value"
                    className={cn(
                        "flex items-center justify-center h-full px-3 text-gray-600 dark:text-gray-400 transition-colors",
                        "hover:bg-gray-100 dark:hover:bg-gray-800 rounded-r-md",
                        "focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 focus:ring-inset",
                        isIncrementDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent"
                    )}
                >
                    <Plus className="h-4 w-4" />
                </button>
            </div>

            {/* Validation message */}
            {hasValidationError && <div className="text-red-500 text-sm mt-1">Please enter a number.</div>}

            {/* Min/Max/Step hint */}
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {min !== undefined && max !== undefined && (
                    <span>
                        Min: {valuePrefix}
                        {min}
                        {valueSuffix} · Max: {valuePrefix}
                        {max}
                        {valueSuffix} · Step: {step}
                    </span>
                )}
            </div>
        </div>
    );
};

export default StepperNumberField;

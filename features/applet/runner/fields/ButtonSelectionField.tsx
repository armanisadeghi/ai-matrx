import React, { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { cn } from "@/lib/utils";
import ValidationMessage from "./common/ValidationMessage";
import { CommonFieldProps } from "./core/types";

const ButtonSelectionField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, options, componentProps, required } = field;

    const { width, customContent, multiSelect, minItems, maxItems } = componentProps;

    const safeWidthClass = ensureValidWidthClass(width);

    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

    const updateBrokerValue = useCallback(
        (updatedValue: string[]) => {
            dispatch(
                brokerActions.setValue({
                    brokerId,
                    value: updatedValue,
                })
            );
        },
        [dispatch, brokerId]
    );

    const [touched, setTouched] = useState(false);

    // Initialize state if needed
    useEffect(() => {
        if (stateValue === undefined) {
            // Initialize with empty array
            updateBrokerValue([]);
        }
    }, [stateValue, updateBrokerValue]);

    // Handle button click
    const handleButtonClick = (optionId: string) => {
        if (disabled) return;

        setTouched(true);
        let updatedValue;

        if (multiSelect) {
            // Multi-select mode
            if (Array.isArray(stateValue)) {
                if (stateValue.includes(optionId)) {
                    // If minItems is set, check if we can remove
                    if (typeof minItems === "number" && minItems > 0 && stateValue.length <= minItems) {
                        return; // Don't allow removing if it would violate minItems
                    }

                    // Remove the option if already selected
                    updatedValue = stateValue.filter((id) => id !== optionId);
                } else {
                    // If maxItems is set, check if we can add
                    if (typeof maxItems === "number" && maxItems > 0 && stateValue.length >= maxItems) {
                        return; // Don't allow adding if it would exceed maxItems
                    }

                    // Add the option if not already selected
                    updatedValue = [...stateValue, optionId];
                }
            } else {
                // Initialize with this option
                updatedValue = [optionId];
            }
        } else {
            // Single-select mode - just set the value to the clicked option
            updatedValue = [optionId];
        }

        updateBrokerValue(updatedValue);
    };

    // Determine if an option is selected
    const isOptionSelected = (optionId: string) => {
        if (Array.isArray(stateValue)) {
            return stateValue.includes(optionId);
        }
        return false;
    };

    // Check if any option is selected
    const hasSelections = Array.isArray(stateValue) && stateValue.length > 0;

    // Check validation
    let validationMessage = "";
    if (required && !hasSelections) {
        validationMessage = "Please select at least one option.";
    } else if (typeof minItems === "number" && minItems > 0 && (!hasSelections || stateValue.length < minItems)) {
        validationMessage = `Please select at least ${minItems} option${minItems !== 1 ? "s" : ""}.`;
    }

    let maxItemsMessage = "";
    if (typeof maxItems === "number" && maxItems > 0 && hasSelections && stateValue.length > maxItems) {
        maxItemsMessage = `Please select no more than ${maxItems} option${maxItems !== 1 ? "s" : ""}.`;
    }

    // Handle blur event
    const handleBlur = () => {
        setTouched(true);
    };

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <div
                role={multiSelect ? "group" : "radiogroup"}
                aria-labelledby={`${id}-label`}
                className={cn("w-full", touched && (validationMessage || maxItemsMessage) && "border-red-500")}
                onBlur={handleBlur}
            >
                <div className="flex flex-wrap gap-2">
                    {options?.map((option) => (
                        <button
                            key={option.id}
                            id={`${id}-${option.id}`}
                            type="button"
                            onClick={() => handleButtonClick(option.id)}
                            disabled={disabled}
                            className={cn(
                                "px-2.5 py-1 text-xs rounded-md transition-colors border",
                                isOptionSelected(option.id)
                                    ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white border-blue-600 dark:border-blue-700"
                                    : "bg-textured border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750",
                                "focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                            role={multiSelect ? "checkbox" : "radio"}
                            aria-checked={isOptionSelected(option.id)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <ValidationMessage message={validationMessage || maxItemsMessage} touched={touched} />
        </div>
    );
};

export default ButtonSelectionField;

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { cn } from "@/lib/utils";
import { CommonFieldProps } from "./core/types";

const JSONField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, placeholder = "Enter JSON data", componentProps, required, defaultValue } = field;

    const { width, customContent, rows = 8 } = componentProps;

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

    // Local state for the textarea value
    const [jsonText, setJsonText] = useState<string>("");
    // Separate state for validation error
    const [error, setError] = useState<string | null>(null);
    // Track if the field has been touched
    const [touched, setTouched] = useState<boolean>(false);

    // Initialize jsonText from state or default
    useEffect(() => {
        if (stateValue !== undefined) {
            try {
                // If it's already a string, use it directly
                if (typeof stateValue === "string") {
                    setJsonText(stateValue);
                } else {
                    // If it's an object/array, stringify it with pretty formatting
                    setJsonText(JSON.stringify(stateValue, null, 2));
                }
            } catch (e) {
                // If it can't be parsed, use empty string
                setJsonText("");
            }
        } else if (defaultValue !== undefined) {
            try {
                // If there's a default value, try to stringify it
                if (typeof defaultValue === "string") {
                    setJsonText(defaultValue);
                } else {
                    setJsonText(JSON.stringify(defaultValue, null, 2));
                }

                // Also update the state value
                updateBrokerValue(defaultValue);
            } catch (e) {
                setJsonText("");
            }
        } else {
            // No default or state value
            setJsonText("");
        }
    }, [defaultValue, dispatch, id, stateValue]);

    // Handler for text change
    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setJsonText(value);

        // Clear error when user starts typing again
        if (error) {
            setError(null);
        }
    };

    // Parse and validate JSON
    const parseJson = (text: string): { valid: boolean; value: any; error: string | null } => {
        if (!text.trim()) {
            return { valid: !required, value: null, error: required ? "JSON is required" : null };
        }

        try {
            const parsed = JSON.parse(text);
            return { valid: true, value: parsed, error: null };
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "Invalid JSON";
            return { valid: false, value: null, error: errorMessage };
        }
    };

    // Handle blur event
    const handleBlur = () => {
        setTouched(true);

        const { valid, value, error: validationError } = parseJson(jsonText);

        if (valid) {
            // Update state with parsed value
            updateBrokerValue(value);

            // Format the JSON text nicely
            setJsonText(JSON.stringify(value, null, 2));
            setError(null);
        } else {
            // If invalid, keep the raw text in state
            updateBrokerValue(jsonText);

            // Set error message
            setError(validationError);
        }
    };

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <div className="relative">
                <textarea
                    value={jsonText}
                    onChange={handleTextChange}
                    onBlur={handleBlur}
                    disabled={disabled}
                    placeholder={placeholder}
                    rows={rows}
                    className={cn(
                        "w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2",
                        "focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700",
                        "text-gray-700 dark:text-gray-300 bg-textured",
                        "font-mono text-sm",
                        touched && error && "border-red-500",
                        disabled && "opacity-60 cursor-not-allowed"
                    )}
                />
            </div>

            {/* Error message - only show after blur */}
            {touched && error && <div className="text-red-500 text-sm mt-1">{error}</div>}
        </div>
    );
};

export default JSONField;

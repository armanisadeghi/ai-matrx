"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommonFieldProps } from "./core/types";

const TagInputField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, placeholder = "Type and press Enter to add tags", componentProps, required = false } = field;

    const { width, customContent, maxItems, minItems = 0 } = componentProps;

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
    const inputRef = useRef<HTMLInputElement>(null);

    // Track if field has been touched/blurred
    const [touched, setTouched] = useState<boolean>(false);

    // Initialize state if needed
    useEffect(() => {
        if (stateValue === undefined) {
            // Initialize with empty array
            updateBrokerValue([]);
        }
    }, [stateValue, dispatch, id]);

    // Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    // Handle key press (Enter)
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && inputValue.trim()) {
            e.preventDefault();
            addTag(inputValue.trim());
        }
    };

    // Add a new tag
    const addTag = (tag: string) => {
        if (disabled) return;

        const tags = Array.isArray(stateValue) ? [...stateValue] : [];

        // Check if tag already exists
        if (tags.includes(tag)) {
            setInputValue("");
            return;
        }

        // Check if we're at max items
        if (maxItems !== undefined && tags.length >= maxItems) {
            return;
        }

        // Add the new tag
        const updatedTags = [...tags, tag];

        updateBrokerValue(updatedTags);

        // Reset input
        setInputValue("");
    };

    // Remove a tag
    const removeTag = (tagToRemove: string) => {
        if (disabled) return;

        const tags = Array.isArray(stateValue) ? [...stateValue] : [];

        // Check if we're at min items
        if (minItems > 0 && tags.length <= minItems) {
            return;
        }

        const updatedTags = tags.filter((tag) => tag !== tagToRemove);

        updateBrokerValue(updatedTags);
    };

    // Handle clicking the container to focus the input
    const handleContainerClick = () => {
        if (!disabled && inputRef.current) {
            inputRef.current.focus();
        }
    };

    // Handle blur event
    const handleBlur = () => {
        setTouched(true);
    };

    // Check if we're at max items
    const isAtMaxItems = maxItems !== undefined && Array.isArray(stateValue) && stateValue.length >= maxItems;

    // Check if the minimum requirements are met
    const hasEnoughTags = Array.isArray(stateValue) && stateValue.length >= minItems;
    const isRequirementMet = !required || (required && hasEnoughTags);

    // Only show validation error if the field has been touched (blurred) and requirements are not met
    const validationError =
        touched && !isRequirementMet ? (minItems === 0 ? "Please add at least one tag." : `Please add at least ${minItems} tags.`) : "";

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <div
                className={cn(
                    "flex flex-wrap gap-2 px-2 py-1.5 border rounded-md min-h-[38px] cursor-text",
                    "focus-within:ring-2 focus-within:ring-gray-300 dark:focus-within:ring-gray-600 focus-within:outline-none",
                    "border-gray-300 dark:border-gray-700 bg-textured",
                    validationError && "border-red-500",
                    disabled && "opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-900"
                )}
                onClick={handleContainerClick}
            >
                {/* Render existing tags */}
                {Array.isArray(stateValue) &&
                    stateValue.map((tag, index) => (
                        <div
                            key={index}
                            className={cn(
                                "flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700",
                                "text-sm text-gray-700 dark:text-gray-300"
                            )}
                        >
                            <span className="mr-1">{tag}</span>
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeTag(tag);
                                    }}
                                    className="p-0.5 rounded-full text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                    aria-label={`Remove ${tag}`}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    ))}

                {/* Input field */}
                {!isAtMaxItems && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                        disabled={disabled}
                        placeholder={Array.isArray(stateValue) && stateValue.length === 0 ? placeholder : ""}
                        className={cn(
                            "flex-grow bg-transparent outline-none min-w-[120px] py-0.5 text-gray-700 dark:text-gray-300",
                            "placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        )}
                    />
                )}
            </div>

            {/* Max items message */}
            {isAtMaxItems && (
                <div className="text-amber-600 dark:text-amber-400 text-xs mt-1">Maximum number of tags reached ({maxItems}).</div>
            )}

            {/* Validation message - only shown after blur */}
            {validationError && <div className="text-red-500 text-xs mt-1">{validationError}</div>}
        </div>
    );
};

export default TagInputField;

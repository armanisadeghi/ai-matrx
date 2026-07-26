import React, { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from "@/lib/redux/brokerSlice/selectors";
import { brokerActions } from "@/lib/redux/brokerSlice/slice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import SelectionPills from "./common/SelectionPills";
import ValidationMessage from "./common/ValidationMessage";
import { SelectedOptionValue, selectedOptionValues } from "./common/types";
import { processFieldOptions } from "@/features/applet/utils/field-normalization";
import { CommonFieldProps } from "./core/types";

// Define the type for selected option in state
const ButtonColumnField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, options, componentProps, includeOther, required } = field;

    const { width, customContent, multiSelect = false, minItems = 0, maxItems = 0, direction = "horizontal" } = componentProps;

    const safeWidthClass = ensureValidWidthClass(width);

    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));
    const storedOptions = selectedOptionValues(stateValue);
    const availableOptions = processFieldOptions(options);

    const updateBrokerValue = useCallback(
        (updatedOptions: SelectedOptionValue[]) => {
            dispatch(
                brokerActions.setValue({
                    brokerId,
                value: updatedOptions,
            })
        );
    }, [dispatch, brokerId]);

    const [otherText, setOtherText] = useState("");
    const [touched, setTouched] = useState(false);

    // Initialize stateValue if not set
    useEffect(() => {
        if (!stateValue && availableOptions.length > 0) {
            // Initialize with all options having selected: false
            const initialOptions = availableOptions.map((option) => ({
                ...option,
                selected: false,
            }));

            // Add Other option if includeOther is true
            if (includeOther) {
                initialOptions.push({
                    id: "other",
                    label: "Other",
                    selected: false,
                    description: "",
                });
            }

            updateBrokerValue(initialOptions);
        } else if (stateValue) {
            // If there's an "other" option and it's selected, initialize the otherText state
            const otherOption = storedOptions.find((option) => option.id === "other");
            if (otherOption && otherOption.selected && otherOption.description) {
                setOtherText(otherOption.description);
            }
        }
    }, [stateValue, options, includeOther, dispatch, id]);

    // Handler for button click
    const handleButtonClick = (optionId: string) => {
        if (disabled) return;

        setTouched(true);

        // Get current selection state
        const currentOption = storedOptions.find((option) => option.id === optionId);
        const isCurrentlySelected = currentOption?.selected || false;

        // Count currently selected items
        const selectedCount = storedOptions.filter((option) => option.selected).length;

        // For single select mode (radio button behavior)
        if (!multiSelect) {
            const updatedOptions = storedOptions.map((option) => ({
                ...option,
                selected: option.id === optionId,
            }));

            updateBrokerValue(updatedOptions);
            return;
        }

        // For multi-select mode (checkbox behavior)

        // Check if we're trying to deselect while at minItems
        if (isCurrentlySelected && minItems > 0 && selectedCount <= minItems) {
            return; // Don't allow deselect if it would violate minItems
        }

        // Check if we're trying to select while at maxItems
        if (!isCurrentlySelected && maxItems > 0 && selectedCount >= maxItems) {
            return; // Don't allow select if it would violate maxItems
        }

        // Update the selection state for the specific option
        const updatedOptions = storedOptions.map((option) => {
            if (option.id === optionId) {
                return {
                    ...option,
                    selected: !option.selected,
                };
            }
            return option;
        });

        updateBrokerValue(updatedOptions);
    };

    // Handler for "Other" text input
    const handleOtherTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newOtherText = e.target.value;
        setOtherText(newOtherText);

        const updatedOptions = storedOptions.map((option) => {
            if (option.id === "other") {
                return {
                    ...option,
                    description: newOtherText,
                };
            }
            return option;
        });

        updateBrokerValue(updatedOptions);
    };

    // Handler for blur events
    const handleBlur = () => {
        setTouched(true);
    };

    // Handler for clearing all selections
    const handleClearAll = () => {
        if (disabled) return;

        const clearedOptions = storedOptions.map((option) => ({
            ...option,
            selected: false,
        }));

        updateBrokerValue(clearedOptions);
    };

    // Get the selected options
    const selectedOptions = storedOptions.filter((option) => option.selected);

    const isOtherSelected = selectedOptions.some((option) => option.id === "other");

    // Check validation
    let validationMessage = "";

    if (required && selectedOptions.length === 0) {
        validationMessage = "Please select at least one option.";
    } else if (minItems > 0 && selectedOptions.length < minItems) {
        validationMessage = `Please select at least ${minItems} option${minItems !== 1 ? "s" : ""}.`;
    }

    let maxItemsMessage = "";
    if (maxItems > 0 && selectedOptions.length > maxItems) {
        maxItemsMessage = `Please select no more than ${maxItems} option${maxItems !== 1 ? "s" : ""}.`;
    }

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    // Prepare options list including "Other" option if needed
    const selectWithOptions = [...availableOptions];
    if (includeOther) {
        selectWithOptions.push({ id: "other", label: "Other" });
    }

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <div
                role={multiSelect ? "group" : "radiogroup"}
                aria-labelledby={`${id}-label`}
                className={cn("w-full", touched && (validationMessage || maxItemsMessage) && "border-red-500")}
                onBlur={handleBlur}
            >
                <div className={cn("flex gap-2 flex-wrap", direction === "vertical" && "flex-col")}>
                    {selectWithOptions.map((option) => {
                        const isSelected = selectedOptions.some((selectedOpt) => selectedOpt.id === option.id);

                        return (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => handleButtonClick(option.id)}
                                onBlur={handleBlur}
                                disabled={disabled}
                                className={cn(
                                    "px-3 py-1.5 text-sm rounded-md transition-colors border",
                                    isSelected
                                        ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white border-blue-600 dark:border-blue-700"
                                        : "bg-textured border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750",
                                    "focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                )}
                                role={multiSelect ? "checkbox" : "radio"}
                                aria-checked={isSelected}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Other text input */}
            {isOtherSelected && (
                <Input
                    id={`${sourceId}-${id}-other-input`}
                    className="w-full mt-2 focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-textured"
                    value={otherText}
                    onChange={handleOtherTextChange}
                    onBlur={handleBlur}
                    placeholder="Please specify..."
                    disabled={disabled}
                />
            )}

            {/* Add SelectionPills only for multiSelect mode */}
            {multiSelect && (
                <SelectionPills
                    selectedOptions={selectedOptions}
                    onRemove={handleButtonClick}
                    onClearAll={selectedOptions.length > 1 ? handleClearAll : undefined}
                    disabled={disabled}
                />
            )}

            {/* Use our ValidationMessage component */}
            <ValidationMessage message={validationMessage || maxItemsMessage} touched={touched} />
        </div>
    );
};

export default ButtonColumnField;

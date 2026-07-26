"use client";

import React, { useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from "@/lib/redux/brokerSlice/selectors";
import { brokerActions } from "@/lib/redux/brokerSlice/slice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { CommonFieldProps } from "./core/types";

// Import the shadcn/ui Select components
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { selectedOptionValues } from "./common/types";
import { processFieldOptions } from "@/features/applet/utils/field-normalization";


const SelectField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, placeholder, options, componentProps, includeOther } = field;

    const { width, customContent } = componentProps;
    const safeWidthClass = ensureValidWidthClass(width);

    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));
    const storedOptions = selectedOptionValues(stateValue);
    const availableOptions = processFieldOptions(options);

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
        }
    }, [stateValue, options, includeOther, dispatch, id, source]);

    // Handler for select change
    const handleSelectChange = (selectedId: string) => {
        // Create new options array with only the selected option set to true
        const updatedOptions = storedOptions.map((option) => ({
            ...option,
            selected: option.id === selectedId,
        }));

        updateBrokerValue(updatedOptions);
    };

    // Handler for "Other" text input
    const handleOtherTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const otherText = e.target.value;

        const updatedOptions = storedOptions.map((option) => {
            if (option.id === "other") {
                return {
                    ...option,
                    description: otherText, // Store the text in description as specified
                };
            }
            return option;
        });

        updateBrokerValue(updatedOptions);
    };

    // Determine the currently selected option
    const selectedOption = storedOptions.find((option) => option.selected);
    const isOtherSelected = selectedOption?.id === "other";

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    const selectWithOptions = [...availableOptions];
    if (includeOther) {
        selectWithOptions.push({ id: "other", label: "Other" });
    }

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <Select disabled={disabled} value={selectedOption?.id || ""} onValueChange={handleSelectChange}>
                <SelectTrigger className="w-full focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-textured">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent className="bg-textured border-gray-300 dark:border-gray-700">
                    <SelectGroup>
                        {selectWithOptions.map((option) => (
                            <SelectItem
                                key={option.id}
                                value={option.id}
                                className="text-gray-700 dark:text-gray-300 focus:bg-gray-100 dark:focus:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>

            {isOtherSelected && (
                <Input
                    id={`${sourceId}-${id}-other-input`}
                    className="w-full mt-2 focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-textured"
                    value={selectedOption?.description || ""}
                    onChange={handleOtherTextChange}
                    placeholder="Please specify..."
                    disabled={disabled}
                />
            )}
        </div>
    );
};

export default SelectField;

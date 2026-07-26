"use client";

import React, { useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Import the shadcn/ui components
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CommonFieldProps } from "./core/types";

const MultiDateField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, placeholder = "Select dates", componentProps, required } = field;

    const {
        width,
        customContent,
        minDate = "",
        maxDate = "",
        minItems = 0,
        maxItems = 0,
        valuePrefix = "",
        valueSuffix = "",
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

    // Initialize state if needed
    useEffect(() => {
        if (stateValue === undefined) {
            // Initialize with empty array
            updateBrokerValue([]);
        }
    }, [stateValue, dispatch, id]);

    // Process min and max dates
    const processDateLimit = (dateLimit: string): Date | undefined => {
        if (!dateLimit) return undefined;

        if (dateLimit.toLowerCase() === "today") {
            return new Date();
        }

        const parsedDate = new Date(dateLimit);
        // Check if the date is valid
        return isNaN(parsedDate.getTime()) ? undefined : parsedDate;
    };

    const minDateLimit = processDateLimit(minDate);
    const maxDateLimit = processDateLimit(maxDate);

    // Handler for date selection
    const handleDateSelect = (date: Date | undefined) => {
        if (!date) return;

        // Get the current dates
        const currentDates: string[] = Array.isArray(stateValue) ? stateValue : [];

        // Convert to Date objects for comparison
        const selectedDateStr = date.toISOString();
        const dateExists = currentDates.some((d) => d === selectedDateStr);

        // Toggle the date selection
        let updatedDates;
        if (dateExists) {
            // Remove the date if it's already selected
            updatedDates = currentDates.filter((d) => d !== selectedDateStr);
        } else {
            // Add the date if it's not in the selection and we're under maxItems (if set)
            if (maxItems > 0 && currentDates.length >= maxItems) {
                return; // Don't add if we're at max items
            }
            updatedDates = [...currentDates, selectedDateStr];
        }

        updateBrokerValue(updatedDates);
    };

    // Handle removing a date from the selection
    const handleRemoveDate = (dateStr: string, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation(); // Prevent opening the calendar when removing a date
        }

        // Get the current dates
        const currentDates: string[] = Array.isArray(stateValue) ? stateValue : [];

        // Check if removing would violate minItems
        if (minItems > 0 && currentDates.length <= minItems) {
            return; // Don't remove if it would violate minItems
        }

        // Remove the date
        const updatedDates = currentDates.filter((d) => d !== dateStr);

        updateBrokerValue(updatedDates);
    };

    // Parse selected dates from state
    const selectedDates: Date[] =
        Array.isArray(stateValue) && stateValue.length > 0
            ? stateValue.map((dateStr: string) => new Date(dateStr)).filter((d) => !isNaN(d.getTime()))
            : [];

    // Check validation
    const hasMinItemsError = required || (minItems > 0 && selectedDates.length < minItems);
    const validationError =
        hasMinItemsError && selectedDates.length === 0
            ? "Please select at least one date."
            : hasMinItemsError
            ? `Please select at least ${minItems} dates.`
            : "";

    const hasMaxItemsError = maxItems > 0 && selectedDates.length > maxItems;
    const maxItemsError = hasMaxItemsError ? `Please select no more than ${maxItems} dates.` : "";

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    // Sort dates for display
    const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());

    return (
        <div className={`${safeWidthClass} ${className}`}>
            {/* Display selected dates as badges */}
            {selectedDates.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {sortedDates.map((date, index) => (
                        <Badge
                            key={index}
                            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1 mr-1 mb-1"
                            variant="secondary"
                        >
                            {format(date, "MMM d, yyyy")}
                            {!disabled && (
                                <X
                                    className="ml-1 h-3 w-3 text-gray-500 dark:text-gray-400 cursor-pointer"
                                    onClick={(e) => handleRemoveDate(date.toISOString(), e)}
                                />
                            )}
                        </Badge>
                    ))}

                    {!disabled && selectedDates.length > 1 && minItems < selectedDates.length && (
                        <Badge
                            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1 mr-1 mb-1 cursor-pointer"
                            variant="secondary"
                            onClick={() => {
                                // Clear all dates
                                updateBrokerValue([]);
                            }}
                        >
                            Clear All
                            <X className="ml-1 h-3 w-3 text-gray-500 dark:text-gray-400" />
                        </Badge>
                    )}
                </div>
            )}

            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className={cn(
                            "w-full justify-start text-left font-normal",
                            selectedDates.length === 0 && "text-gray-500 dark:text-gray-400",
                            "focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-textured",
                            (validationError || maxItemsError) && "border-red-500",
                            disabled && "opacity-50 cursor-not-allowed"
                        )}
                        disabled={disabled}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDates.length > 0 ? (
                            <span>
                                {valuePrefix} {selectedDates.length} dates selected {valueSuffix}
                            </span>
                        ) : (
                            <span>{placeholder}</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-textured border-gray-300 dark:border-gray-700">
                    <Calendar
                        mode="multiple"
                        selected={selectedDates}
                        onSelect={(dates) => {
                            // Since the Calendar component in multiple mode returns all selected dates
                            // on each selection, we need to determine what changed
                            if (!dates || dates.length === 0) {
                                // All dates were cleared
                                updateBrokerValue([]);
                                return;
                            }

                            // Check if we added a date (length increased)
                            if (dates.length > selectedDates.length) {
                                // Find the new date that was added
                                const newDate = dates.find((d1) => !selectedDates.some((d2) => d1.getTime() === d2.getTime()));
                                if (newDate) {
                                    handleDateSelect(newDate);
                                }
                            } else if (dates.length < selectedDates.length) {
                                // We removed a date
                                const removedDate = selectedDates.find((d1) => !dates.some((d2) => d1.getTime() === d2.getTime()));
                                if (removedDate) {
                                    handleRemoveDate(removedDate.toISOString());
                                }
                            }
                        }}
                        initialFocus
                        disabled={disabled}
                        fromDate={minDateLimit}
                        toDate={maxDateLimit}
                        className="border-none"
                    />
                </PopoverContent>
            </Popover>

            {/* Validation message */}
            {(validationError || maxItemsError) && <div className="text-red-500 text-sm mt-1">{validationError || maxItemsError}</div>}
        </div>
    );
};

export default MultiDateField;

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommonFieldProps } from "./core/types";

// Import the shadcn/ui components
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

// Define the type for isSelected option in state
export interface SelectedOptionValue extends FieldOption {
    isSelected: boolean;
    otherText?: string;
}

interface FieldOption {
    id: string;
    label: string;
    description?: string;
    helpText?: string;
    iconName?: string;
}

const SearchableSelectField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, placeholder, options, componentProps, includeOther } = field;

    const { width, customContent } = componentProps;
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

    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Initialize stateValue if not set
    useEffect(() => {
        if (!stateValue && options?.length > 0) {
            // Initialize with all options having isSelected: false
            const initialOptions = options.map((option) => ({
                ...option,
                isSelected: false,
            }));

            // Add Other option if includeOther is true
            if (includeOther) {
                initialOptions.push({
                    id: "other",
                    label: "Other",
                    isSelected: false,
                    description: "",
                });
            }

            updateBrokerValue(initialOptions);
        }
    }, [stateValue, options, includeOther, dispatch, id, source]);

    // Handler for select change
    const handleSelectChange = (selectedId: string) => {
        // Create new options array with only the isSelected option set to true
        const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => ({
            ...option,
            isSelected: option.id === selectedId,
        }));

        updateBrokerValue(updatedOptions);

        setOpen(false);
        setSearchQuery("");
    };

    // Handler for "Other" text input
    const handleOtherTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const otherText = e.target.value;

        const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
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

    // Determine the currently isSelected option
    const selectedOption = Array.isArray(stateValue) ? stateValue.find((option: SelectedOptionValue) => option.isSelected) : null;
    const isOtherSelected = selectedOption?.id === "other";

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    // Prepare options list including "Other" option if needed
    const selectWithOptions = [...(options || [])];
    if (includeOther) {
        selectWithOptions.push({ id: "other", label: "Other" });
    }

    // Filter options based on search query
    const filteredOptions = selectWithOptions.filter((option) => {
        if (!searchQuery.trim()) return true;

        const query = searchQuery.toLowerCase();
        const matchLabel = option.label.toLowerCase().includes(query);
        const matchDescription = option.description?.toLowerCase().includes(query) || false;

        return matchLabel || matchDescription;
    });

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-textured"
                        disabled={disabled}
                        onClick={() => setOpen(!open)}
                    >
                        {selectedOption?.label || placeholder}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-full p-0 bg-textured border-gray-300 dark:border-gray-700"
                    align="start"
                    sideOffset={5}
                >
                    <div className="flex flex-col">
                        <div className="flex items-center border-b p-2">
                            <Input
                                placeholder="Search options..."
                                className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-gray-700 dark:text-gray-300"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <ScrollArea className="h-72 max-h-[60dvh]">
                            <div className="p-1">
                                {filteredOptions.length === 0 ? (
                                    <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No options found.</div>
                                ) : (
                                    filteredOptions.map((option) => (
                                        <div
                                            key={option.id}
                                            className={cn(
                                                "flex items-center relative cursor-default select-none py-1.5 px-2 rounded-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700",
                                                selectedOption?.id === option.id && "bg-gray-100 dark:bg-gray-700"
                                            )}
                                            onClick={() => handleSelectChange(option.id)}
                                            role="option"
                                            aria-selected={selectedOption?.id === option.id}
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    handleSelectChange(option.id);
                                                }
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    selectedOption?.id === option.id ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            <span>{option.label}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </PopoverContent>
            </Popover>

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

export default SearchableSelectField;

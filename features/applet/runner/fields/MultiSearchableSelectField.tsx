"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldDefinition, FieldOption } from "@/types/customAppTypes";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CommonFieldProps } from "./core/types";

// Define the type for selected option in state
export interface SelectedOptionValue extends FieldOption {
    selected: boolean;
    otherText?: string;
}

const MultiSearchableSelectField: React.FC<CommonFieldProps> = ({ 
    field, 
    sourceId="no-applet-id", 
    isMobile, 
    source = "applet", 
    disabled = false, 
    className = "" 
}) => {
    const { id, label, placeholder, options, componentProps, includeOther } = field;
    const { width, customContent, maxItems, minItems, showSelectAll } = componentProps;
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
    const [otherText, setOtherText] = useState("");
    
    // Initialize stateValue if not set
    useEffect(() => {
        if (!stateValue && options?.length > 0) {
            // Initialize with all options having selected: false
            const initialOptions = options.map((option) => ({
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
            const otherOption = Array.isArray(stateValue) ? stateValue.find((opt: SelectedOptionValue) => opt.id === "other") : null;
            if (otherOption && otherOption.selected && otherOption.description) {
                setOtherText(otherOption.description);
            }
        }
    }, [stateValue, options, includeOther, dispatch, id, source]);
    
    // Handler for toggling a selection
    const toggleOption = (optionId: string) => {
        // Update the selection state for the specific option
        const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
            if (option.id === optionId) {
                return {
                    ...option,
                    selected: !option.selected,
                };
            }
            return option;
        });
        
        // Check if we're hitting maxItems limit
        if (maxItems) {
            const selectedCount = updatedOptions.filter((opt: SelectedOptionValue) => opt.selected).length;
            if (selectedCount > maxItems) {
                return; // Don't update if exceeding max items
            }
        }
        
        updateBrokerValue(updatedOptions);
    };
    
    // Handler for select all
    const toggleSelectAll = () => {
        // Check how many are currently selected
        const areAllSelected = selectWithOptions.every((option) => {
            const stateOption = stateValue?.find((o: SelectedOptionValue) => o.id === option.id);
            return stateOption?.selected;
        });
        
        // Toggle all options
        const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => ({
            ...option,
            selected: !areAllSelected,
        }));
        
        updateBrokerValue(updatedOptions);
    };
    
    // Handler for "Other" text input
    const handleOtherTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newOtherText = e.target.value;
        setOtherText(newOtherText);
        
        const updatedOptions = (stateValue || []).map((option: SelectedOptionValue) => {
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
    
    // Handler for removing a selected option (displayed as a badge)
    const handleRemoveOption = (optionId: string, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation(); // Prevent opening the dropdown when removing a badge
        }
        toggleOption(optionId);
    };
    
    // Get the currently selected options
    const selectedOptions = Array.isArray(stateValue) ? stateValue.filter((option: SelectedOptionValue) => option.selected) : [];
    const isOtherSelected = selectedOptions.some((option) => option.id === "other");
    
    // Determine if we have any validation issues
    const hasMinItemsError = minItems && selectedOptions.length < minItems;
    const hasMaxItemsError = maxItems && selectedOptions.length > maxItems;
    
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
        <div className={`${safeWidthClass} ${className} nodrag`}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className={cn(
                            "w-full min-h-10 h-auto justify-between flex-wrap focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-textured nodrag",
                            hasMinItemsError || hasMaxItemsError ? "border-red-500" : ""
                        )}
                        disabled={disabled}
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpen(!open);
                        }}
                    >
                        <div className="flex flex-wrap gap-1 py-1">
                            {selectedOptions.length > 0 ? (
                                selectedOptions.map((option) => (
                                    <Badge
                                        key={option.id}
                                        className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1 mr-1 mb-1 nodrag"
                                        variant="secondary"
                                    >
                                        {option.label}
                                        <X
                                            className="ml-1 h-3 w-3 text-gray-500 dark:text-gray-400 cursor-pointer nodrag"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveOption(option.id, e);
                                            }}
                                        />
                                    </Badge>
                                ))
                            ) : (
                                <span className="text-gray-500 dark:text-gray-400">{placeholder}</span>
                            )}
                        </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 flex-none" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-full p-0 bg-textured border-gray-300 dark:border-gray-700 nodrag"
                    align="start"
                    sideOffset={5}
                    style={{ zIndex: 9999 }}
                >
                    <div className="flex flex-col nodrag">
                        <div className="flex items-center border-b p-2 nodrag">
                            <Input
                                placeholder="Search options..."
                                className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-gray-700 dark:text-gray-300 nodrag"
                                value={searchQuery}
                                onChange={(e) => {
                                    e.stopPropagation();
                                    setSearchQuery(e.target.value);
                                }}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                        <ScrollArea className="h-72 max-h-[60dvh] nodrag">
                            <div className="p-1 nodrag">
                                {showSelectAll && (
                                    <div
                                        className="flex items-center relative cursor-default select-none py-1.5 px-2 rounded-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 border-b border-border nodrag"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleSelectAll();
                                        }}
                                        role="option"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                toggleSelectAll();
                                            }
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selectWithOptions.every((option) => {
                                                    const stateOption = stateValue?.find((o: SelectedOptionValue) => o.id === option.id);
                                                    return stateOption?.selected;
                                                })
                                                    ? "opacity-100"
                                                    : "opacity-0"
                                            )}
                                        />
                                        <span className="font-semibold">Select All</span>
                                    </div>
                                )}
                                {filteredOptions.length === 0 ? (
                                    <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400 nodrag">No options found.</div>
                                ) : (
                                    filteredOptions.map((option) => {
                                        const isSelected = selectedOptions.some((selectedOpt) => selectedOpt.id === option.id);
                                        return (
                                            <div
                                                key={option.id}
                                                className={cn(
                                                    "flex items-center relative cursor-default select-none py-1.5 px-2 rounded-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 nodrag",
                                                    isSelected && "bg-gray-100 dark:bg-gray-700"
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleOption(option.id);
                                                }}
                                                role="option"
                                                aria-selected={isSelected}
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        toggleOption(option.id);
                                                    }
                                                }}
                                            >
                                                <div
                                                    className={cn(
                                                        "flex h-4 w-4 items-center justify-center rounded-sm border border-border mr-2",
                                                        isSelected && "bg-gray-300 dark:bg-gray-600 border-gray-400 dark:border-gray-500"
                                                    )}
                                                >
                                                    {isSelected && <Check className="h-3 w-3" />}
                                                </div>
                                                <span>{option.label}</span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </PopoverContent>
            </Popover>
            {isOtherSelected && (
                <Input
                    id={`${sourceId}-${id}-other-input`}
                    className="w-full mt-2 focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-textured nodrag"
                    value={otherText}
                    onChange={(e) => {
                        e.stopPropagation();
                        handleOtherTextChange(e);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Please specify..."
                    disabled={disabled}
                />
            )}
            {(hasMinItemsError || hasMaxItemsError) && (
                <div className="text-red-500 text-sm mt-1">
                    {hasMinItemsError && `Please select at least ${minItems} options.`}
                    {hasMaxItemsError && `Please select no more than ${maxItems} options.`}
                </div>
            )}
        </div>
    );
};

export default MultiSearchableSelectField;
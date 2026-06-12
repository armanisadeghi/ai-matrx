import React, { useEffect, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { FieldDefinition, FieldOption } from "@/types/customAppTypes";
import { CommonFieldProps } from "./core/types";
import { filterAndSortBySearch } from "@/utils/search-scoring";

export interface SelectedOptionValue extends FieldOption {
    selected: boolean;
    otherText?: string;
}

const DependentDropdownField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, placeholder = "Select an option", options, componentProps, required, includeOther = false } = field;

    const { width, customContent } = componentProps;

    const safeWidthClass = ensureValidWidthClass(width);

    useEffect(() => {
        if (className) {
            console.warn(
                "Dependent Dropdown Field is not using the given classname prop because additional updates are required to support it. Classname given:",
                className
            );
        }
    }, [className]);

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

    // Set up UI state
    const [open, setOpen] = useState<{ [key: string]: boolean }>({});
    const [searchQuery, setSearchQuery] = useState<{ [key: string]: string }>({});
    const [otherText, setOtherText] = useState("");
    // Track if field has been interacted with
    const [touched, setTouched] = useState(false);

    // Extract parent options (options with no parentId)
    const parentOptions = options.filter((option) => !option.parentId);

    // Initialize stateValue if not set
    useEffect(() => {
        if (!stateValue && options.length > 0) {
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
    }, [stateValue, options, includeOther, dispatch, id]);

    // Find the currently selected option at a specific level
    const getSelectedOptionAtLevel = (level: number): SelectedOptionValue | null => {
        if (!stateValue) return null;

        let currentParentId: string | undefined = undefined;

        // For level 0, we're looking at root options (no parent)
        if (level === 0) {
            return Array.isArray(stateValue)
                ? stateValue.find((option: SelectedOptionValue) => {
                      // Find the original option to check if it has a parentId
                      const originalOption = options.find((o) => o.id === option.id);
                      return option.selected && !originalOption?.parentId;
                  }) || null
                : null;
        }

        // For other levels, we need to chain through the parents
        for (let i = 0; i < level; i++) {
            // Find the selected option at the current level
            const selectedOption = Array.isArray(stateValue)
                ? stateValue.find((option: SelectedOptionValue) => {
                      const originalOption = options.find((o) => o.id === option.id);
                      return option.selected && originalOption?.parentId === currentParentId;
                  })
                : null;

            // If no option is selected at this level, break the chain
            if (!selectedOption) return null;

            // Set the current option ID as the parent for the next level
            currentParentId = selectedOption.id;
        }

        // Now find the selected option at the target level
        return Array.isArray(stateValue)
            ? stateValue.find((option: SelectedOptionValue) => {
                  const originalOption = options.find((o) => o.id === option.id);
                  return option.selected && originalOption?.parentId === currentParentId;
              }) || null
            : null;
    };

    // Get child options for a specific parent
    const getChildOptions = (parentId: string): FieldOption[] => {
        return options.filter((option) => option.parentId === parentId);
    };

    // Check if an option has children
    const hasChildren = (optionId: string): boolean => {
        return options.some((option) => option.parentId === optionId);
    };

    // Handle option selection at a specific level
    const handleOptionSelect = (optionId: string, level: number) => {
        if (disabled) return;

        // Mark as touched when user makes a selection
        setTouched(true);

        // Create a copy of the current state
        const updatedOptions = [...(stateValue || [])];

        // Handle special case: "Other" option
        if (optionId === "other") {
            // Update only the "Other" option
            const otherIndex = updatedOptions.findIndex((opt: SelectedOptionValue) => opt.id === "other");
            if (otherIndex >= 0) {
                updatedOptions[otherIndex] = {
                    ...updatedOptions[otherIndex],
                    selected: true,
                };
            }

            // Find and deselect all other options
            updatedOptions.forEach((opt: SelectedOptionValue, index: number) => {
                if (opt.id !== "other") {
                    updatedOptions[index] = {
                        ...opt,
                        selected: false,
                    };
                }
            });

            updateBrokerValue(updatedOptions);
            setOpen({ ...open, [level]: false });
            return;
        }

        // Find parent chain up to this level
        const parentChain: string[] = [];
        let currentLevel = level;
        let currentParentId: string | undefined = undefined;

        while (currentLevel > 0) {
            currentLevel--;
            const selectedOption = getSelectedOptionAtLevel(currentLevel);
            if (selectedOption) {
                parentChain.unshift(selectedOption.id);
                currentParentId = selectedOption.id;
            } else {
                // If any parent in the chain is missing, we can't proceed
                return;
            }
        }

        // Update the selected state
        updatedOptions.forEach((opt: SelectedOptionValue, index: number) => {
            const originalOption = options.find((o) => o.id === opt.id);

            // If this is the option we're selecting
            if (opt.id === optionId) {
                updatedOptions[index] = {
                    ...opt,
                    selected: true,
                };
            }
            // If this is on the same level, deselect it
            else if (
                (level === 0 && !originalOption?.parentId) ||
                (level > 0 && originalOption?.parentId === parentChain[parentChain.length - 1])
            ) {
                updatedOptions[index] = {
                    ...opt,
                    selected: false,
                };
            }
            // If this is a child of any level below the current selection, deselect it
            else if (level < parentChain.length) {
                let isChild = false;
                let childParentId = originalOption?.parentId;

                // Check if this option is a descendant of any option in the chain below the current level
                while (childParentId) {
                    if (parentChain.indexOf(childParentId) >= level) {
                        isChild = true;
                        break;
                    }
                    const parentOption = options.find((o) => o.id === childParentId);
                    childParentId = parentOption?.parentId;
                }

                if (isChild) {
                    updatedOptions[index] = {
                        ...opt,
                        selected: false,
                    };
                }
            }

            // Deselect "Other" option when a regular option is selected
            if (opt.id === "other") {
                updatedOptions[index] = {
                    ...opt,
                    selected: false,
                };
            }
        });

        updateBrokerValue(updatedOptions);

        setOpen({ ...open, [level]: false });
    };

    // Handler for "Other" text input
    const handleOtherTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Mark as touched when user types in Other field
        setTouched(true);

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

    // Get the selected options chain
    const getSelectedOptionsChain = (): SelectedOptionValue[] => {
        const chain: SelectedOptionValue[] = [];
        let level = 0;
        let option: SelectedOptionValue | null;

        while ((option = getSelectedOptionAtLevel(level)) !== null) {
            chain.push(option);
            if (!hasChildren(option.id)) break;
            level++;
        }

        // Check if "Other" is selected
        if (!chain.length) {
            const otherOption = Array.isArray(stateValue)
                ? stateValue.find((opt: SelectedOptionValue) => opt.id === "other" && opt.selected)
                : undefined;
            if (otherOption) chain.push(otherOption);
        }

        return chain;
    };

    // Get all visible dropdown levels
    const getVisibleLevels = (): number => {
        let level = 0;
        let option: SelectedOptionValue | null;

        while ((option = getSelectedOptionAtLevel(level)) !== null) {
            if (!hasChildren(option.id)) break;
            level++;
        }

        // Always show at least one more level than the last selected option with children
        return level + 1;
    };

    // Filter options based on search query
    const filterOptions = (options: FieldOption[], level: number): FieldOption[] => {
        const query = searchQuery[level] || "";
        if (!query.trim()) return options;

        return filterAndSortBySearch(options, query, [
            { get: (o) => o.label, weight: "title" },
            { get: (o) => o.description, weight: "body" },
        ]);
    };

    // Check if the selection is complete and valid
    const isSelectionValid = (): boolean => {
        const chain = getSelectedOptionsChain();
        if (!chain.length) return !required;

        const lastOption = chain[chain.length - 1];
        // If the last option has children, it's not a complete selection
        if (lastOption.id !== "other" && hasChildren(lastOption.id)) return false;

        return true;
    };

    // Only show validation errors if the field has been touched
    const showValidationError = touched && !isSelectionValid() && required;

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    // Determine how many levels to show
    const visibleLevels = getVisibleLevels();
    const selectedChain = getSelectedOptionsChain();
    const isOtherSelected = selectedChain.some((opt) => opt.id === "other");

    return (
        <div className={`${safeWidthClass}`}>
            <div className="space-y-2">
                {Array.from({ length: visibleLevels }).map((_, level) => {
                    // For first level, show parent options
                    // For subsequent levels, show children of the selected parent
                    const levelOptions =
                        level === 0
                            ? parentOptions
                            : getSelectedOptionAtLevel(level - 1)
                            ? getChildOptions(getSelectedOptionAtLevel(level - 1)!.id)
                            : [];

                    const selectedOption = getSelectedOptionAtLevel(level);
                    const levelPlaceholder = level === 0 ? placeholder : `Select ${selectedOption ? "sub-option" : "option"}`;

                    // Only include "Other" in the first level
                    const otherOption = level === 0 && includeOther ? [{ id: "other", label: "Other" }] : [];

                    const displayOptions = [...levelOptions, ...otherOption];

                    return (
                        <Popover
                            key={`level-${level}`}
                            open={open[level]}
                            onOpenChange={(isOpen) => {
                                setOpen({ ...open, [level]: isOpen });
                                // Mark as touched when dropdown is opened
                                if (isOpen) setTouched(true);
                            }}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={open[level]}
                                    className={cn(
                                        "w-full justify-between focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600",
                                        "border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300",
                                        "bg-textured",
                                        showValidationError && "border-red-500"
                                    )}
                                    disabled={disabled || displayOptions.length === 0}
                                >
                                    {selectedOption ? selectedOption.label : levelPlaceholder}
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
                                            value={searchQuery[level] || ""}
                                            onChange={(e) => setSearchQuery({ ...searchQuery, [level]: e.target.value })}
                                        />
                                    </div>

                                    <ScrollArea className="h-72 max-h-[60dvh]">
                                        <div className="p-1">
                                            {filterOptions(displayOptions, level).length === 0 ? (
                                                <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                                    No options found.
                                                </div>
                                            ) : (
                                                filterOptions(displayOptions, level).map((option) => {
                                                    const isSelected = selectedOption?.id === option.id;

                                                    return (
                                                        <div
                                                            key={option.id}
                                                            className={cn(
                                                                "flex items-center relative cursor-default select-none py-1.5 px-2 rounded-sm",
                                                                "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700",
                                                                "focus:bg-gray-100 dark:focus:bg-gray-700",
                                                                isSelected && "bg-gray-100 dark:bg-gray-700"
                                                            )}
                                                            onClick={() => handleOptionSelect(option.id, level)}
                                                            role="option"
                                                            aria-selected={isSelected}
                                                            tabIndex={0}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter" || e.key === " ") {
                                                                    e.preventDefault();
                                                                    handleOptionSelect(option.id, level);
                                                                }
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}
                                                            />
                                                            <span>{option.label}</span>
                                                            {option.description && (
                                                                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                                                    {option.description}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </ScrollArea>
                                </div>
                            </PopoverContent>
                        </Popover>
                    );
                })}
            </div>

            {/* Show the selected chain summary */}
            {selectedChain.length > 0 && (
                <div className="flex items-center mt-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500 dark:text-gray-400 mr-1">Selected:</span>
                    <div className="flex items-center flex-wrap">
                        {selectedChain.map((option, index) => (
                            <React.Fragment key={option.id}>
                                <span className="font-medium">{option.label}</span>
                                {index < selectedChain.length - 1 && <span className="mx-1 text-gray-400">&gt;</span>}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            )}

            {/* Other text input */}
            {isOtherSelected && (
                <Input
                    id={`${sourceId}-${id}-other-input`}
                    className="w-full mt-2 focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-textured"
                    value={otherText}
                    onChange={handleOtherTextChange}
                    placeholder="Please specify..."
                    disabled={disabled}
                />
            )}

            {/* Validation message */}
            {showValidationError && <div className="text-red-500 text-sm mt-1">Please make a complete selection.</div>}
        </div>
    );
};

export default DependentDropdownField;

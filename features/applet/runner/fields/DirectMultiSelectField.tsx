"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import SelectionPills from "./common/SelectionPills";
import { CommonFieldProps } from "./core/types";
import { SelectedOptionValue, selectedOptionValues } from "./common/types";
import { processFieldOptions } from "@/features/applet/utils/field-normalization";

export type { SelectedOptionValue } from "./common/types";
const DirectMultiSelectField: React.FC<CommonFieldProps> = ({
  field,
  sourceId = "no-applet-id",
  isMobile,
  source = "applet",
  disabled = false,
  className = "",
}) => {
  const { id, label, placeholder, options, componentProps, includeOther } =
    field;

  const { width, customContent, maxItems, minItems, rows, showSelectAll } =
    componentProps;

  const safeWidthClass = ensureValidWidthClass(width);

  const dispatch = useAppDispatch();
  const brokerId = useAppSelector((state) =>
    brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }),
  );
  const stateValue = useAppSelector((state) =>
    brokerSelectors.selectValue(state, brokerId),
  );
  const storedOptions = selectedOptionValues(stateValue);
  const availableOptions = processFieldOptions(options);

  const updateBrokerValue = useCallback(
    (updatedValue: any) => {
      dispatch(
        brokerActions.setValue({
          brokerId,
          value: updatedValue,
        }),
      );
    },
    [dispatch, brokerId],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [otherText, setOtherText] = useState("");

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
  }, [stateValue, options, includeOther, dispatch, id, source]);

  // Handler for toggling a selection
  const toggleOption = (optionId: string) => {
    // Don't allow toggling if disabled
    if (disabled) return;

    // Update the selection state for the specific option
    const updatedOptions = storedOptions.map(
      (option: SelectedOptionValue) => {
        if (option.id === optionId) {
          // Check if we're trying to unselect while below minItems
          if (option.selected && minItems) {
            const selectedCount = storedOptions.filter(
              (o: SelectedOptionValue) => o.selected,
            ).length;
            if (selectedCount <= minItems) {
              return option; // Don't allow unselecting if it would violate minItems
            }
          }

          // Check if we're trying to select while at maxItems
          if (!option.selected && maxItems) {
            const selectedCount = storedOptions.filter(
              (o: SelectedOptionValue) => o.selected,
            ).length;
            if (selectedCount >= maxItems) {
              return option; // Don't allow selecting if it would violate maxItems
            }
          }

          return {
            ...option,
            selected: !option.selected,
          };
        }
        return option;
      },
    );

    updateBrokerValue(updatedOptions);
  };

  // Handler for select all
  const toggleSelectAll = () => {
    if (disabled) return;

    // Check how many are currently selected
    const areAllSelected = selectWithOptions.every((option) => {
      const stateOption = storedOptions.find(
        (o: SelectedOptionValue) => o.id === option.id,
      );
      return stateOption?.selected;
    });

    // Toggle all options
    const updatedOptions = storedOptions.map(
      (option: SelectedOptionValue) => ({
        ...option,
        selected: !areAllSelected,
      }),
    );

    // If maxItems is set, limit the number of selected items
    if (maxItems && !areAllSelected && selectWithOptions.length > maxItems) {
      // Only select up to maxItems options
      const limitedOptions = updatedOptions.map((option, index) => ({
        ...option,
        selected: index < maxItems,
      }));

      updateBrokerValue(limitedOptions);
      return;
    }

    updateBrokerValue(updatedOptions);
  };

  // Handler for "Other" text input
  const handleOtherTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newOtherText = e.target.value;
    setOtherText(newOtherText);

    const updatedOptions = storedOptions.map(
      (option: SelectedOptionValue) => {
        if (option.id === "other") {
          return {
            ...option,
            description: newOtherText,
          };
        }
        return option;
      },
    );

    updateBrokerValue(updatedOptions);
  };

  // Get the currently selected options
  const selectedOptions = storedOptions.filter((option) => option.selected);

  const isOtherSelected = selectedOptions.some(
    (option) => option.id === "other",
  );

  // Determine if we have any validation issues
  const hasMinItemsError = minItems && selectedOptions.length < minItems;
  const hasMaxItemsError = maxItems && selectedOptions.length > maxItems;

  // Render custom content if provided
  if (customContent) {
    return <>{customContent}</>;
  }

  // Prepare options list including "Other" option if needed
  const selectWithOptions = [...availableOptions];
  if (includeOther) {
    selectWithOptions.push({ id: "other", label: "Other" });
  }
  // Filter options based on search query
  const filteredOptions = selectWithOptions.filter((option) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    const matchLabel = option.label.toLowerCase().includes(query);
    const matchDescription =
      option.description?.toLowerCase().includes(query) || false;

    return matchLabel || matchDescription;
  });

  // Calculate height based on visible items
  const adjustedRows = Math.max(rows || 3, 3); // Ensure minimum of 3 rows
  // Use filtered options length if less than adjusted rows
  const visibleRows = Math.min(filteredOptions.length, adjustedRows);

  // Calculate exact height needed to show the specified number of rows
  const optionHeight = 41;
  const optionGap = 12;
  const containerPadding = 14;
  const adjustmentFactor = 8;

  // Calculate total height (show exactly the number of visible rows)
  const scrollHeight =
    visibleRows * optionHeight +
    (visibleRows - 1) * optionGap +
    containerPadding +
    adjustmentFactor;

  // Handler for clearing all selections
  const handleClearAll = () => {
    const clearedOptions = storedOptions.map(
      (option: SelectedOptionValue) => ({
        ...option,
        selected: false,
      }),
    );

    updateBrokerValue(clearedOptions);
  };

  return (
    <div className={`${safeWidthClass} ${className}`}>
      {/* Search input */}
      <div className="relative mb-2">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
        <Input
          placeholder={placeholder}
          className="pl-8 focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-textured"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled}
        />
      </div>

      {/* Scrollable options area */}
      <div
        className={cn(
          "border rounded-md border-gray-300 dark:border-gray-700 bg-textured",
          disabled && "opacity-60",
        )}
      >
        {showSelectAll && (
          <div
            className={cn(
              "flex items-center relative cursor-pointer select-none py-2 px-3 mx-2 mt-2 mb-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300",
              !disabled && "hover:bg-gray-100 dark:hover:bg-gray-700",
              selectWithOptions.every((option) => {
                const stateOption = storedOptions.find(
                  (o: SelectedOptionValue) => o.id === option.id,
                );
                return stateOption?.selected;
              }) &&
                "bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-500",
            )}
            onClick={toggleSelectAll}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (!disabled && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                toggleSelectAll();
              }
            }}
          >
            <span className="font-semibold">Select All</span>
          </div>
        )}

        <ScrollArea
          style={{ height: `${scrollHeight}px` }}
          className="rounded-md"
        >
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No options found.
            </div>
          ) : (
            <div className="p-2 flex flex-col gap-2">
              {filteredOptions.map((option) => {
                const isSelected = selectedOptions.some(
                  (selectedOpt) => selectedOpt.id === option.id,
                );

                return (
                  <button
                    key={option.id}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-md border transition-all duration-200 text-left w-full",
                      isSelected
                        ? "bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-500 text-gray-900 dark:text-gray-100"
                        : "bg-textured border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300",
                      !disabled &&
                        "hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500",
                      disabled && "cursor-not-allowed",
                    )}
                    onClick={() => toggleOption(option.id)}
                    disabled={disabled}
                    type="button"
                  >
                    <span className="font-medium">{option.label}</span>
                    {isSelected && <X className="h-4 w-4 ml-2 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

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

      {/* Selected items display using the new SelectionPills component */}
      <SelectionPills
        selectedOptions={selectedOptions}
        onRemove={toggleOption}
        onClearAll={selectedOptions.length > 1 ? handleClearAll : undefined}
        disabled={disabled}
      />

      {/* Validation messages */}
      {(hasMinItemsError || hasMaxItemsError) && (
        <div className="text-red-500 text-sm mt-1">
          {hasMinItemsError && `Please select at least ${minItems} options.`}
          {hasMaxItemsError &&
            `Please select no more than ${maxItems} options.`}
        </div>
      )}
    </div>
  );
};
export default DirectMultiSelectField;

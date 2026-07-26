"use client";

import React, { useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { CommonFieldProps } from "./core/types";

const SwitchField: React.FC<CommonFieldProps> = ({
  field,
  sourceId = "no-applet-id",
  isMobile,
  source = "applet",
  disabled = false,
  className = "",
}) => {
  const { id, label, componentProps, defaultValue } = field;

  const {
    width,
    customContent,
    onLabel = "On",
    offLabel = "Off",
    direction = "horizontal",
  } = componentProps;

  const safeWidthClass = ensureValidWidthClass(width);

  const dispatch = useAppDispatch();
  const brokerId = useAppSelector((state) =>
    brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }),
  );
  const stateValue = useAppSelector((state) =>
    brokerSelectors.selectValue(state, brokerId),
  );

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

  // Initialize state if needed
  useEffect(() => {
    if (stateValue === undefined) {
      // Initialize with default value (default to false/off)
      const initialValue = defaultValue !== undefined ? !!defaultValue : false;

      updateBrokerValue(initialValue);
    }
  }, [stateValue, defaultValue, dispatch, id, source]);

  // Handler for switch toggle
  const handleToggle = (checked: boolean) => {
    updateBrokerValue(checked);
  };

  // Get the current switched state
  const isChecked = !!stateValue;

  // Render custom content if provided
  if (customContent) {
    return <>{customContent}</>;
  }

  return (
    <div className={`${safeWidthClass} ${className}`}>
      <div
        className={cn(
          "flex items-center",
          direction === "vertical"
            ? "flex-col space-y-2 items-start"
            : "flex-row space-x-3", // Explicitly set flex-row for horizontal layout
        )}
      >
        <Switch
          checked={isChecked}
          onCheckedChange={handleToggle}
          disabled={disabled}
          id={`${id}-switch`}
          aria-label={label || id}
        />

        <span
          className={cn(
            "text-sm font-medium transition-colors",
            isChecked
              ? "text-gray-900 dark:text-gray-100"
              : "text-gray-600 dark:text-gray-400",
          )}
        >
          {isChecked ? onLabel : offLabel}
        </span>
      </div>

      {/* Optional description if provided */}
      {field.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {field.description}
        </p>
      )}
    </div>
  );
};

export default SwitchField;

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from "@/lib/redux/brokerSlice/selectors";
import { brokerActions } from "@/lib/redux/brokerSlice/slice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { cn } from "@/lib/utils";
import { CommonFieldProps } from "./core/types";
// Import the shadcn/ui components
import * as SliderPrimitive from "@radix-ui/react-slider";

// Custom Slider component extending the Radix UI Slider
const Slider = React.forwardRef<React.ComponentRef<typeof SliderPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>>(
    ({ className, ...props }, ref) => (
        <SliderPrimitive.Root ref={ref} className={cn("relative flex w-full touch-none select-none items-center", className)} {...props}>
            <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <SliderPrimitive.Range className="absolute h-full bg-gray-400 dark:bg-gray-500" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-gray-400 bg-white dark:border-gray-500 dark:bg-gray-800 ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
        </SliderPrimitive.Root>
    )
);
Slider.displayName = SliderPrimitive.Root.displayName;

// Multi-Thumb Slider for range selection
const RangeSlider = React.forwardRef<
    React.ComponentRef<typeof SliderPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
    <SliderPrimitive.Root ref={ref} className={cn("relative flex w-full touch-none select-none items-center", className)} {...props}>
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <SliderPrimitive.Range className="absolute h-full bg-gray-400 dark:bg-gray-500" />
        </SliderPrimitive.Track>
        {props.defaultValue?.map((_, i) => (
            <SliderPrimitive.Thumb
                key={i}
                className="block h-5 w-5 rounded-full border-2 border-gray-400 bg-white dark:border-gray-500 dark:bg-gray-800 ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            />
        ))}
    </SliderPrimitive.Root>
));
RangeSlider.displayName = "RangeSlider";

const SliderField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, componentProps, required, defaultValue } = field;

    const { width, customContent, min = 0, max = 100, step = 1, valuePrefix = "", valueSuffix = "", multiSelect = false } = componentProps;

    const safeWidthClass = ensureValidWidthClass(width);

    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

    const storedSliderValue =
        typeof stateValue === "number" ||
        (Array.isArray(stateValue) && stateValue.every((value) => typeof value === "number"))
            ? stateValue
            : undefined;
    const configuredDefaultValue =
        typeof defaultValue === "number" ||
        (Array.isArray(defaultValue) && defaultValue.every((value) => typeof value === "number"))
            ? defaultValue
            : undefined;

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

    // Set up UI state for controlled sliders
    const [sliderValue, setSliderValue] = useState<number | number[]>(
        multiSelect
            ? storedSliderValue ?? [min, max]
            : storedSliderValue !== undefined
            ? storedSliderValue
            : configuredDefaultValue !== undefined
            ? configuredDefaultValue
            : (min + max) / 2
    );

    // Initialize state if needed
    useEffect(() => {
        if (storedSliderValue === undefined) {
            // Initialize with default value
            const initialValue = multiSelect ? [min, max] : configuredDefaultValue ?? (min + max) / 2;

            updateBrokerValue(initialValue);

            setSliderValue(initialValue);
        } else {
            // Update local state when Redux state changes
            setSliderValue(storedSliderValue);
        }
    }, [storedSliderValue, configuredDefaultValue, min, max, multiSelect, dispatch, id]);

    // Handler for slider value change
    const handleSliderChange = (newValue: number[]) => {
        const updatedValue = multiSelect ? newValue : newValue[0];
        setSliderValue(updatedValue);

        updateBrokerValue(updatedValue);
    };

    // Format value for display
    const formatValue = (value: number | number[]) => {
        if (Array.isArray(value)) {
            return `${valuePrefix}${value[0]}${valueSuffix} - ${valuePrefix}${value[1]}${valueSuffix}`;
        }
        return `${valuePrefix}${value}${valueSuffix}`;
    };

    // Check if the value is valid (within min/max bounds)
    const isValidValue = () => {
        if (Array.isArray(sliderValue)) {
            return sliderValue[0] >= min && sliderValue[1] <= max;
        }
        return sliderValue >= min && sliderValue <= max;
    };

    // Check if validation error (required but no valid value)
    const hasValidationError = required && !isValidValue();

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <div className="mb-6 space-y-6">
                {/* Current value display */}
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{multiSelect ? "Range" : "Value"}</span>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{formatValue(sliderValue)}</span>
                </div>

                {/* Slider component */}
                {multiSelect ? (
                    <RangeSlider
                        defaultValue={Array.isArray(sliderValue) ? sliderValue : [min, max]}
                        max={max}
                        min={min}
                        step={step}
                        disabled={disabled}
                        onValueChange={handleSliderChange}
                        aria-label={`${id}-slider`}
                        className={hasValidationError ? "slider-error" : ""}
                    />
                ) : (
                    <Slider
                        defaultValue={[typeof sliderValue === "number" ? sliderValue : (min + max) / 2]}
                        max={max}
                        min={min}
                        step={step}
                        disabled={disabled}
                        onValueChange={handleSliderChange}
                        aria-label={`${id}-slider`}
                        className={hasValidationError ? "slider-error" : ""}
                    />
                )}

                {/* Min/Max labels */}
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>
                        {valuePrefix}
                        {min}
                        {valueSuffix}
                    </span>
                    <span>
                        {valuePrefix}
                        {max}
                        {valueSuffix}
                    </span>
                </div>
            </div>

            {/* Validation message */}
            {hasValidationError && <div className="text-red-500 text-sm mt-1">Please select a valid value.</div>}
        </div>
    );
};

export default SliderField;

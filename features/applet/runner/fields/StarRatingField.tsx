"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from "@/lib/redux/brokerSlice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommonFieldProps } from "./core/types";

// Maximum allowed stars
const MAX_ALLOWED_STARS = 15;

const StarRatingField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, componentProps, required } = field;

    const {
        width,
        customContent,
        min = 0,
        max = 5, // Default to 5 stars
        valuePrefix = "",
        valueSuffix = "",
    } = componentProps;

    // Cap max at MAX_ALLOWED_STARS
    const cappedMax = Math.min(max, MAX_ALLOWED_STARS);

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

    // Local state for rating and hover
    const [rating, setRating] = useState<number | null>(null);
    const [hoverRating, setHoverRating] = useState<number | null>(null);
    const [touched, setTouched] = useState(false);

    // Initialize from state value
    useEffect(() => {
        if (stateValue !== undefined) {
            setRating(Number(stateValue));
        } else if (field.defaultValue !== undefined) {
            const defaultRating = Number(field.defaultValue);
            setRating(defaultRating);

            // Update state
            updateBrokerValue({
                source: source,
                itemId: id,
                value: defaultRating,
            });
        }
    }, [dispatch, field.defaultValue, id, stateValue]);

    // Handle star click
    const handleStarClick = (value: number) => {
        if (disabled) return;

        // If clicking the same star, toggle it off (unless required)
        if (value === rating && !required) {
            setRating(null);
            setTouched(true);

            // Update state
            updateBrokerValue(null);
        } else {
            setRating(value);
            setTouched(true);

            // Update state
            updateBrokerValue(value);
        }
    };

    // Generate array of stars based on min/max (capped)
    // Ensure star numbers start from 1 for display purposes
    const stars = Array.from({ length: cappedMax }, (_, i) => i + 1);

    // Check validation
    const hasValidationError = required && touched && rating === null;

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <div className="space-y-2">
                {/* Star Rating Display */}
                <div className="flex items-center">
                    <div className="flex space-x-1" role="radiogroup" aria-label={`Star rating from ${min} to ${cappedMax}`}>
                        {stars.map((star) => (
                            <button
                                key={star}
                                type="button"
                                onClick={() => handleStarClick(star)}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(null)}
                                disabled={disabled}
                                aria-checked={rating === star}
                                role="radio"
                                aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                                className={cn(
                                    "p-1 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600",
                                    disabled && "cursor-not-allowed opacity-50"
                                )}
                            >
                                <Star
                                    className={cn(
                                        "h-8 w-8 transition-all",
                                        (hoverRating !== null && star <= hoverRating) ||
                                            (hoverRating === null && rating !== null && star <= rating && rating > 0)
                                            ? "fill-yellow-400 text-yellow-400"
                                            : "fill-transparent text-gray-300 dark:text-gray-600"
                                    )}
                                />
                            </button>
                        ))}
                    </div>

                    {/* Rating Value Display */}
                    {rating !== null && (
                        <div className="ml-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                            {valuePrefix}
                            {rating}
                            {valueSuffix}
                        </div>
                    )}
                </div>

                {/* Validation Message */}
                {hasValidationError && <div className="text-red-500 text-xs">Please select a rating.</div>}

                {/* Optional helper text */}
                <div className="text-xs text-gray-500 dark:text-gray-400">Click on a star to rate. Click again to remove your rating.</div>
            </div>
        </div>
    );
};

export default StarRatingField;

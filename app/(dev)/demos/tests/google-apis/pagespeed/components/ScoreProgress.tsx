"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

interface ScoreProgressProps {
    value: number;
    className?: string;
    indicatorColor?: string;
}

export function ScoreProgress({ value, className, indicatorColor }: ScoreProgressProps) {
    // Determine color based on score if not provided
    const getColorClass = () => {
        if (indicatorColor) return indicatorColor;
        if (value >= 90) return "bg-green-500 dark:bg-green-400";
        if (value >= 50) return "bg-orange-500 dark:bg-orange-400";
        return "bg-red-500 dark:bg-red-400";
    };

    return (
        <ProgressPrimitive.Root
            className={cn(
                "relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700",
                className
            )}
        >
            <ProgressPrimitive.Indicator
                className={cn("h-full w-full flex-1 transition-all", getColorClass())}
                style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
            />
        </ProgressPrimitive.Root>
    );
}


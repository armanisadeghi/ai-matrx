"use client";

/**
 * ResultScalar — a single string / number / boolean with a subtle type cue.
 * Numbers and booleans get a mono treatment; booleans render as a Badge so
 * true/false reads instantly. Strings render as plain foreground text.
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ResultScalarProps {
    value: string | number | boolean;
    type: "string" | "number" | "boolean";
    className?: string;
}

export const ResultScalar: React.FC<ResultScalarProps> = ({ value, type, className }) => {
    if (type === "boolean") {
        return (
            <Badge variant={value ? "success" : "neutral"} className={cn("font-mono", className)}>
                {value ? "true" : "false"}
            </Badge>
        );
    }

    if (type === "number") {
        return (
            <span className={cn("font-mono tabular-nums text-foreground", className)}>
                {String(value)}
            </span>
        );
    }

    return (
        <span className={cn("text-foreground break-words", className)}>{String(value)}</span>
    );
};

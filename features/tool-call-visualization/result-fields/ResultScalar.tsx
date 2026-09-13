"use client";

/**
 * ResultScalar — a single string / number / boolean with a subtle type cue.
 * Numbers get a mono treatment; strings render as plain foreground text.
 *
 * A BOOLEAN IS A FLAG, NOT A TOKEN (wall W61, 2026-09-12). This used to print
 * the literal `true` / `false` in a mono badge, and a finished-run showcase
 * written for a parent therefore read "Physician first: false". `true` and
 * `false` are how a program spells a flag; "Yes" and "No" are how a person
 * reads one, and the field's own label already says what is being answered.
 * The badge (green for yes, quiet for no) is what makes it readable at a
 * glance — so it stays a badge, and stops being a token.
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
            <Badge variant={value ? "success" : "neutral"} className={className}>
                {value ? "Yes" : "No"}
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

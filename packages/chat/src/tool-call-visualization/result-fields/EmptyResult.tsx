"use client";

/**
 * EmptyResult — a first-class empty state. A tool that returned nothing is a
 * real, valid outcome; we say so plainly instead of rendering a blank gap.
 */

import React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyResultProps {
    /** Override the default message. */
    message?: string;
    /** Compact (inline body) vs roomy (full overlay tab). */
    density?: "inline" | "full";
    className?: string;
}

export const EmptyResult: React.FC<EmptyResultProps> = ({
    message = "No result returned",
    density = "inline",
    className,
}) => {
    const full = density === "full";
    return (
        <div
            className={cn(
                "flex items-center gap-2 text-muted-foreground",
                full ? "flex-col justify-center py-10 text-sm" : "py-2 text-xs",
                className,
            )}
        >
            <Inbox className={cn("flex-shrink-0 opacity-60", full ? "h-6 w-6" : "h-3.5 w-3.5")} />
            <span>{message}</span>
        </div>
    );
};

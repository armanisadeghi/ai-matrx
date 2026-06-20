"use client";

/**
 * ToolErrorCard — a calm, compact notice that a tool step didn't complete.
 *
 * Errors must not shout: a failed step is a single quiet card row, not a big
 * filled red alert. We surface a humanized label and (at most) the first line
 * of the message, then point to "Details" for the full story. The complete
 * error detail — stack trace, events, structured data — lives in the overlay's
 * Raw tab, reached via `onOpenOverlay`. Nothing is hidden; it's just not dumped
 * inline.
 */

import React from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { humanizeKey } from "./shape";

export interface ToolErrorCardProps {
    entry: ToolLifecycleEntry;
    /** When supplied, an inline "Details" link opens the overlay error tab. */
    onOpenOverlay?: (initialTab?: string) => void;
    toolGroupId?: string;
    className?: string;
}

/** A calm one-line label — humanized `errorType` if present, else a soft default. */
function errorLabel(errorType?: string | null): string {
    const trimmed = errorType?.trim();
    if (trimmed) return humanizeKey(trimmed);
    return "Couldn't complete this step";
}

/** The first non-empty line of a message, trimmed — never a stack trace. */
function firstLine(message?: string | null): string | null {
    if (!message) return null;
    for (const raw of message.split("\n")) {
        const line = raw.trim();
        if (line.length > 0) return line;
    }
    return null;
}

export const ToolErrorCard: React.FC<ToolErrorCardProps> = ({
    entry,
    onOpenOverlay,
    toolGroupId,
    className,
}) => {
    const groupId = toolGroupId ?? entry.callId;
    const label = errorLabel(entry.errorType);
    const detail = firstLine(entry.errorMessage);

    return (
        <div
            className={cn(
                "flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2",
                className,
            )}
        >
            <CircleAlert className="h-3.5 w-3.5 flex-shrink-0 text-destructive/70" />
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="flex-shrink-0 text-xs font-medium text-foreground">{label}</span>
                {detail && (
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{detail}</span>
                )}
            </div>
            {onOpenOverlay && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenOverlay(`tool-group-${groupId}`);
                    }}
                    className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground"
                >
                    Details
                </button>
            )}
        </div>
    );
};

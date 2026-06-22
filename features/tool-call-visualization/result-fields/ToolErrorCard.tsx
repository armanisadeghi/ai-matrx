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

/**
 * A calm one-line label. A tool error is almost always the agent passing
 * arguments the tool rejected — a normal, self-correcting event (it usually
 * retries and succeeds), NOT an application failure. So we frame it as an
 * input issue when the signature matches, and stay soft otherwise. The real
 * detail rides alongside (the message) and in the overlay Raw tab.
 */
function errorLabel(entry: ToolLifecycleEntry): string {
    const hay = `${entry.errorType ?? ""} ${entry.errorMessage ?? ""}`.toLowerCase();
    if (
        /valid|argument|param|schema|required|missing|expected|must be|unrecognized|not allowed|format|type error/.test(
            hay,
        )
    ) {
        return "The agent sent invalid arguments";
    }
    const trimmed = entry.errorType?.trim();
    if (trimmed) return humanizeKey(trimmed);
    return "This step didn't complete";
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
    const label = errorLabel(entry);
    const detail = firstLine(entry.errorMessage);

    return (
        <div
            className={cn(
                // Calm, not alarming: a quiet bordered row, muted icon — NOT red.
                // A tool error is a routine retry signal, not an app failure.
                "flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2",
                className,
            )}
        >
            <CircleAlert className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
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

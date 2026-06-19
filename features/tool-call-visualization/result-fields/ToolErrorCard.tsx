"use client";

/**
 * ToolErrorCard — the canonical structured error display for a failed tool.
 * Truthful and loud: shows the error type as a Badge, the message in full,
 * and (when present) a collapsible "detail" with the latest progress message
 * and any structured `latestData`. A failure is never reduced to a generic
 * "something went wrong".
 */

import React from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { ResultJson } from "./ResultJson";

export interface ToolErrorCardProps {
    entry: ToolLifecycleEntry;
    /** When supplied, an inline "Details" link opens the overlay error tab. */
    onOpenOverlay?: (initialTab?: string) => void;
    toolGroupId?: string;
    className?: string;
}

export const ToolErrorCard: React.FC<ToolErrorCardProps> = ({
    entry,
    onOpenOverlay,
    toolGroupId,
    className,
}) => {
    const [open, setOpen] = React.useState(false);

    const message = entry.errorMessage ?? entry.latestMessage ?? "The tool call failed without a message.";
    const groupId = toolGroupId ?? entry.callId;

    // Detail is anything beyond the headline: a distinct latest message, or
    // structured latestData. We never hide it — just tuck it behind a toggle.
    const hasDistinctLatest =
        typeof entry.latestMessage === "string" &&
        entry.latestMessage.length > 0 &&
        entry.latestMessage !== entry.errorMessage;
    const hasLatestData = entry.latestData != null && Object.keys(entry.latestData).length > 0;
    const hasDetail = hasDistinctLatest || hasLatestData;

    return (
        <div
            className={cn(
                "rounded-lg border border-destructive/50 bg-destructive/5 p-3",
                className,
            )}
        >
            <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-destructive">Tool call failed</span>
                        {entry.errorType && (
                            <Badge variant="destructive" className="font-mono text-[10px]">
                                {entry.errorType}
                            </Badge>
                        )}
                    </div>
                    <p className="break-words text-xs text-destructive">{message}</p>

                    {hasDetail && (
                        <Collapsible open={open} onOpenChange={setOpen}>
                            <CollapsibleTrigger
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive/80 hover:text-destructive"
                            >
                                {open ? (
                                    <ChevronDown className="h-3 w-3" />
                                ) : (
                                    <ChevronRight className="h-3 w-3" />
                                )}
                                {open ? "Hide detail" : "Show detail"}
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-1.5 space-y-1.5">
                                {hasDistinctLatest && (
                                    <p className="break-words text-[11px] text-muted-foreground">
                                        {entry.latestMessage}
                                    </p>
                                )}
                                {hasLatestData && <ResultJson data={entry.latestData} />}
                            </CollapsibleContent>
                        </Collapsible>
                    )}
                </div>

                {onOpenOverlay && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenOverlay(`tool-group-${groupId}`);
                        }}
                        className="flex-shrink-0 text-xs font-medium text-destructive hover:underline"
                    >
                        Details
                    </button>
                )}
            </div>
        </div>
    );
};

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
import { CircleAlert, Route } from "lucide-react";
import { cn } from "@ai-matrx/design-system";
import type { ToolLifecycleEntry } from "../../agents/types/request.types";
import { humanizeKey } from "./shape";
import { guardRoutingOf } from "./guard-routing";

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
/** Calm one-line label for inline chat; Results tab uses the full message. */
export function toolErrorLabel(entry: ToolLifecycleEntry): string {
    // A WRITE THE STORE HELD FOR A PERSON IS NOT AN ARGUMENT ERROR (VERIFIER-26
    // item 5). Older servers answered it as `approval_required`; the word
    // "required" matched the pattern below and the chip said "The agent sent
    // invalid arguments", which was false. Asked first, so it can never be
    // mistaken for one again.
    if (isHeldForApprovalError(entry)) return "Held for your approval";
    // The on-screen write guard routed the change to the open record — the
    // intended path, not a failure (see guard-routing.ts).
    const routed = guardRoutingOf(entry);
    if (routed) return routed.label;
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

/** An errored entry whose "error" is really a write held for approval. */
export function isHeldForApprovalError(entry: ToolLifecycleEntry): boolean {
    const type = (entry.errorType ?? "").toLowerCase();
    return (
        type === "approval_required" ||
        type === "held_for_approval" ||
        /is waiting for a person/i.test(entry.errorMessage ?? "")
    );
}

/** The first non-empty line of a message, trimmed — never a stack trace. */
export function toolErrorFirstLine(message?: string | null): string | null {
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
    const routed = guardRoutingOf(entry);
    const label = toolErrorLabel(entry);
    // A guard routing's message is the MODEL's instruction (ids, tool names);
    // the person gets the state line and its tooltip, the message stays in
    // Details.
    const detail = routed ? null : toolErrorFirstLine(entry.errorMessage);
    const Icon = routed ? Route : CircleAlert;

    return (
        <div
            className={cn(
                // Calm, not alarming: a quiet bordered row, muted icon — NOT red.
                // A tool error is a routine retry signal, not an app failure.
                "flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2",
                className,
            )}
        >
            <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span
                    className="flex-shrink-0 text-xs font-medium text-foreground"
                    title={routed?.tooltip}
                >
                    {label}
                </span>
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

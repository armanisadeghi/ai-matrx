"use client";

/**
 * GenericRenderer — the universal inline body for any tool WITHOUT a custom
 * renderer. ~97% of tool calls render through here, so this is the crown
 * jewel: type-aware, beautiful, and truthful (HIDE NOTHING).
 *
 * The shell (ToolCallVisualization) owns the collapsed one-line row and the
 * expand/collapse toggle. This component renders the EXPANDED body only:
 *
 *   error          → <ToolErrorCard>
 *   running / no result → honest progress (last 1–2 real messages + a subtle
 *                         animated cue). The ONLY place "theater" is allowed,
 *                         and it's unmistakably a loading state.
 *   completed      → a CopyButtons header + <ResultValue density="inline"> +
 *                    a full-width "View complete result" button (overlay).
 *
 * All interactive elements `stopPropagation()` so they don't toggle the row.
 */

import React from "react";
import { Loader2, Maximize2 } from "lucide-react";
import type { ToolRendererProps } from "../types";
import { collectMessages } from "../renderers/_shared";
import { ResultValue } from "../result-fields/ResultValue";
import { ToolErrorCard } from "../result-fields/ToolErrorCard";
import { UrlChip } from "../result-fields/UrlChips";
import { detectResultShape } from "../result-fields/shape";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";

// Progress messages that are pure noise — they describe the machinery, not
// what's happening. Filtered out of the honest-progress display.
const REDUNDANT_PATTERNS: RegExp[] = [
    /^executing\b/i,
    /^running\b/i,
    /^calling\b/i,
    /^invoking\b/i,
    /^starting\b/i,
    /^tool call result$/i,
    /^tool result$/i,
    /^result$/i,
    /^completed$/i,
    /^done$/i,
    /^finished$/i,
    /^success$/i,
];

function isRedundantMessage(message: string): boolean {
    const trimmed = message.trim();
    if (trimmed.length === 0) return true;
    return REDUNDANT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Extract the first whole http(s) URL from a free-text message, if any. */
function extractUrl(message: string): string | null {
    const match = message.match(/https?:\/\/[^\s]+/);
    return match ? match[0] : null;
}

/** Human-readable result string for the agent/human copy payload. */
function resultToHuman(result: unknown): string {
    if (typeof result === "string") return result;
    try {
        return JSON.stringify(result, null, 2);
    } catch {
        return String(result);
    }
}

/** A single honest progress line — renders an embedded URL as a chip. */
const ProgressLine: React.FC<{ message: string; index: number }> = ({ message, index }) => {
    const url = extractUrl(message);
    const text = url ? message.replace(url, "").trim() : message;

    return (
        <div
            className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-300"
            style={{ animationDelay: `${index * 60}ms`, animationFillMode: "backwards" }}
        >
            {url ? (
                <>
                    {text && <span className="truncate">{text}</span>}
                    <UrlChip url={url} />
                </>
            ) : (
                <span className="min-w-0 break-words">{message}</span>
            )}
        </div>
    );
};

export const GenericRenderer: React.FC<ToolRendererProps> = ({
    entry,
    events,
    onOpenOverlay,
    toolGroupId,
}) => {
    const isComplete = entry.status === "completed";
    const hasError = entry.status === "error";
    const groupId = toolGroupId ?? entry.callId;

    // ─── Error ──────────────────────────────────────────────────────────────
    if (hasError) {
        return (
            <ToolErrorCard entry={entry} onOpenOverlay={onOpenOverlay} toolGroupId={groupId} />
        );
    }

    // ─── Running / not-yet-terminal / no result → honest progress ───────────
    if (!isComplete || entry.result == null) {
        const source =
            events && events.length > 0
                ? collectMessages(events)
                : entry.latestMessage
                  ? [entry.latestMessage]
                  : [];
        const meaningful = source.filter((m) => !isRedundantMessage(m));
        const displayMessages = meaningful.slice(-2);

        return (
            <div className="space-y-2">
                {displayMessages.length > 0 ? (
                    <div className="space-y-1.5">
                        {displayMessages.map((msg, i) => (
                            <ProgressLine key={`${i}-${msg.slice(0, 16)}`} message={msg} index={i} />
                        ))}
                    </div>
                ) : null}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Working…</span>
                </div>
            </div>
        );
    }

    // ─── Completed ──────────────────────────────────────────────────────────
    const shape = detectResultShape(entry.result);
    const isEmpty = shape.kind === "empty";

    // "More to see" — anything richer than a single scalar/url/empty is worth
    // a full-screen look. Media/text/list/table/object/json all qualify.
    const hasMoreToSee =
        !isEmpty && shape.kind !== "scalar" && shape.kind !== "url" && Boolean(onOpenOverlay);

    return (
        <div className="space-y-2">
            {!isEmpty && (
                <div className="flex items-center justify-end">
                    <CopyButtons
                        label="Result"
                        size="icon"
                        human={() => resultToHuman(entry.result)}
                        agent={() => ({
                            kind: "tool-result",
                            location: "AI Matrx — Tool call result",
                            description: `Result of the "${entry.displayName || entry.toolName}" tool call.`,
                            data: { tool: entry.toolName, callId: entry.callId, result: entry.result },
                        })}
                    />
                </div>
            )}

            <ResultValue value={entry.result} density="inline" />

            {hasMoreToSee && onOpenOverlay && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenOverlay(`tool-group-${groupId}`);
                    }}
                    className="group flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
                >
                    <span>View complete result</span>
                    <Maximize2 className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
                </button>
            )}
        </div>
    );
};

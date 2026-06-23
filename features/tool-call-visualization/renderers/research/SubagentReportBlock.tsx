"use client";

/**
 * SubagentReportBlock — the streaming research report, the showcase of Wave 3.
 *
 * A research sub-agent reads many pages and writes back a synthesized markdown
 * report. The backend delivers that report WHOLE at `tool_completed` (it does
 * NOT token-stream it), so "streaming" here is a CLIENT-SIDE paced reveal of the
 * real, complete report — the same honest theater the search waves use, and the
 * day aidream emits incremental report deltas this lights up for free (it
 * re-reveals on every `entry` change).
 *
 * Treatment — deliberately NOT the agent's primary answer:
 *   • A labeled "Research report" card with a subtle accent, **slightly
 *     narrower than full width** (so it reads as a nested sub-agent artifact).
 *   • While streaming: max-height (~400px), **auto-scrolls to the bottom** and
 *     **user scroll is LOCKED** (`useAutoScrollOnStream`) — it follows the
 *     content like a live feed; a "Streaming" pulse shows in the header.
 *   • Collapsible — three states: **none** (header only), **partial** (the
 *     ~400px scroll viewport), **full** (no cap, the whole report inline).
 *   • On done → a normal, user-controllable tool-result shape: free scroll in
 *     `partial`, or expand to `full`; the report renders through `RichDocument`
 *     so the full action toolkit (copy / save to notes / open editor / …) is
 *     available.
 *
 * Rendered markdown goes through `MarkdownStream` while streaming (light, fast,
 * stream-aware) and `RichDocument` once done (the action surface). Semantic
 * tokens only; React Compiler is on.
 */

import React, { useState } from "react";
import {
    FileText,
    ChevronDown,
    ChevronRight,
    Maximize2,
    Minimize2,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import MarkdownStream from "@/components/MarkdownStream";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { ContentSource } from "@/features/rich-document/types";
import { useAutoScrollOnStream } from "../useAutoScrollOnStream";

/** Collapse state of the report viewport. */
type ReportView = "none" | "partial" | "full";

export interface SubagentReportBlockProps {
    /** The markdown report (whole when done; the accumulating slice mid-stream). */
    report: string;
    /** True while the report is still streaming (paced reveal in flight). */
    streaming: boolean;
    /** Optional queries the sub-agent ran, shown as a sub-label. */
    queries?: string[];
}

/** Max height of the `partial` viewport — the scrollable window while streaming. */
const PARTIAL_MAX_PX = 400;

export const SubagentReportBlock: React.FC<SubagentReportBlockProps> = ({
    report,
    streaming,
    queries,
}) => {
    // While streaming, force the `partial` scroll viewport (so auto-scroll +
    // lock apply). When done, the user controls the view; default `partial`.
    const [view, setView] = useState<ReportView>("partial");
    const effectiveView: ReportView = streaming ? "partial" : view;

    // Auto-scroll to bottom + lock user scroll while streaming.
    const scrollRef = useAutoScrollOnStream<HTMLDivElement>(report, streaming);

    const hasReport = report.trim().length > 0;

    return (
        <div className="mx-auto w-[94%] overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm">
            {/* Header — label + queries + stream pulse + collapse controls */}
            <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-3 py-2">
                <button
                    type="button"
                    onClick={() => setView((v) => (v === "none" ? "partial" : "none"))}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={effectiveView !== "none"}
                >
                    {effectiveView === "none" ? (
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    )}
                    <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" />
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                                Research report
                            </span>
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                                sub-agent
                            </span>
                        </div>
                        {queries && queries.length > 0 && (
                            <div className="truncate text-xs text-muted-foreground">
                                {queries.join(" · ")}
                            </div>
                        )}
                    </div>
                </button>

                {streaming ? (
                    <span className="flex flex-shrink-0 items-center gap-1.5 text-xs font-medium text-primary">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        Streaming
                    </span>
                ) : (
                    effectiveView !== "none" && (
                        <button
                            type="button"
                            onClick={() =>
                                setView((v) => (v === "full" ? "partial" : "full"))
                            }
                            className="flex flex-shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
                            title={view === "full" ? "Collapse to a window" : "Expand fully"}
                        >
                            {view === "full" ? (
                                <>
                                    <Minimize2 className="h-3 w-3" /> Collapse
                                </>
                            ) : (
                                <>
                                    <Maximize2 className="h-3 w-3" /> Expand
                                </>
                            )}
                        </button>
                    )
                )}
            </div>

            {/* Body */}
            {effectiveView !== "none" && (
                <>
                    {streaming ? (
                        // STREAMING — locked, auto-scrolling viewport via MarkdownStream.
                        <div
                            ref={scrollRef}
                            className="overflow-y-auto overscroll-contain p-4"
                            style={{ maxHeight: PARTIAL_MAX_PX }}
                        >
                            {hasReport ? (
                                <MarkdownStream
                                    content={report}
                                    isStreamActive
                                    hideCopyButton
                                    className="text-sm"
                                />
                            ) : (
                                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                                    <FileText className="h-4 w-4 text-primary" />
                                    Synthesizing the report…
                                </div>
                            )}
                        </div>
                    ) : hasReport ? (
                        // DONE — user-controllable. `partial` = a free-scroll window;
                        // `full` = the whole report inline. RichDocument supplies the
                        // action toolkit (copy / save to notes / open editor / …).
                        <div
                            className={cn(
                                effectiveView === "partial" &&
                                    "overflow-y-auto overscroll-contain",
                            )}
                            style={
                                effectiveView === "partial"
                                    ? { maxHeight: PARTIAL_MAX_PX }
                                    : undefined
                            }
                        >
                            <div className="p-4">
                                <RichDocument
                                    content={report}
                                    source={{ type: "raw" } as ContentSource}
                                    actionsVariant="mini-bar"
                                    actionsClassName="mt-2"
                                    actions={{ exclude: ["announcements", "preferences"] }}
                                    hideCopyButton
                                    contentClassName="text-sm"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                            <FileText className="h-4 w-4" />
                            No report was produced.
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

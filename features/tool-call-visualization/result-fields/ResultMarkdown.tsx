"use client";

/**
 * ResultMarkdown — renders a fixed result string through the canonical static
 * markdown renderer ({@link BasicMarkdownContent}). In `inline` density the
 * content is clamped to ~6 lines behind a "Show more" toggle (Collapsible);
 * in `full` density everything renders, nothing truncated.
 *
 * We pass `showCopyButton={false}` — copy is owned by the result-field shell
 * (a single CopyButtons for the whole result), not per markdown block.
 */

import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface ResultMarkdownProps {
    content: string;
    density?: "inline" | "full";
    className?: string;
}

/** Lines beyond this in inline density are hidden until "Show more". */
const INLINE_CLAMP_LINES = 6;

export const ResultMarkdown: React.FC<ResultMarkdownProps> = ({ content, density = "inline", className }) => {
    const [expanded, setExpanded] = React.useState(false);

    if (density === "full") {
        return (
            <div className={cn("min-w-0", className)}>
                <BasicMarkdownContent content={content} showCopyButton={false} />
            </div>
        );
    }

    // Inline: only offer the toggle when the content is actually long enough
    // that clamping hides something (line count OR raw length).
    const lineCount = content.split("\n").length;
    const isLong = lineCount > INLINE_CLAMP_LINES || content.length > 600;

    if (!isLong) {
        return (
            <div className={cn("min-w-0", className)}>
                <BasicMarkdownContent content={content} showCopyButton={false} />
            </div>
        );
    }

    return (
        <Collapsible open={expanded} onOpenChange={setExpanded} className={cn("min-w-0", className)}>
            {!expanded && (
                <div
                    className="relative overflow-hidden"
                    style={{ maxHeight: `${INLINE_CLAMP_LINES * 1.6}rem` }}
                >
                    <BasicMarkdownContent content={content} showCopyButton={false} />
                    {/* Fade the clipped edge so it's clearly truncated, not cut. */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
                </div>
            )}
            <CollapsibleContent>
                <BasicMarkdownContent content={content} showCopyButton={false} />
            </CollapsibleContent>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((v) => !v);
                }}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
                {expanded ? (
                    <>
                        <ChevronUp className="h-3.5 w-3.5" /> Show less
                    </>
                ) : (
                    <>
                        <ChevronDown className="h-3.5 w-3.5" /> Show more
                    </>
                )}
            </button>
        </Collapsible>
    );
};

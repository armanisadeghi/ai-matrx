"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import { ThinkingTraceMarkdown } from "./ThinkingTraceMarkdown";

export interface ThinkingTraceProps {
  /** A single thinking/reasoning text block. */
  text?: string;
  /** Multiple reasoning steps (consolidated) — joined into one trace. */
  texts?: string[];
  /** Hide entirely (per-surface `hideReasoning`). */
  showThinking?: boolean;
  /** True while tokens are still arriving — shows the thought "coming in". */
  isStreaming?: boolean;
}

/**
 * ThinkingTrace — the single, unified renderer for model thinking / reasoning.
 *
 * One primitive for EVERY source: live stream, static markdown, and DB-loaded
 * turns all render through this. There is no per-source variant.
 *
 * It reads like a line of the transcript, not a component:
 *   - collapsed by default — a quiet, muted affordance. No box, no border fill,
 *     no gradient, no background. It takes up about one line.
 *   - while streaming — the latest line of thought streams in on that one line,
 *     so you can watch it think without it being in your face.
 *   - click to expand — the full reasoning text, lightly indented.
 *
 * The legacy boxes (`ThinkingVisualization`, `ReasoningVisualization`,
 * `ConsolidatedReasoningVisualization`) are now thin adapters over this, so
 * the look is identical everywhere it appears.
 */
const ThinkingTrace: React.FC<ThinkingTraceProps> = ({
  text,
  texts,
  showThinking = true,
  isStreaming = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Models sometimes nest reasoning tags (e.g. `<thinking><reasoning>...
  // </reasoning></thinking>`). The outer block is consumed by the splitter,
  // but the inner tags survive as literal text — strip them here so the
  // expanded body and the streaming tail both read like prose, not markup.
  const stripReasoningTags = (s: string): string =>
    s.replace(/<\/?(?:thinking|think|reasoning|reason)>/gi, "");

  const fullText = stripReasoningTags(
    texts && texts.length > 0
      ? texts.filter((t) => t?.trim()).join("\n\n")
      : (text ?? ""),
  ).trim();

  // Keep the expanded body pinned to the newest tokens while streaming.
  useEffect(() => {
    if (expanded && isStreaming && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [fullText, expanded, isStreaming]);

  if (!showThinking || !fullText) return null;

  // Collapsed, mid-stream: show the tail so the thought visibly "comes in".
  const tail =
    fullText
      .split("\n")
      .filter((l) => l.trim())
      .pop() ?? "";
  const collapsedLabel = isStreaming ? tail || "Thinking…" : "Thought process";

  return (
    <div className="my-1.5 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 text-left text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
        />
        {isStreaming && !expanded && (
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/50" />
        )}
        {isStreaming && !expanded ? (
          tail ? (
            <ThinkingTraceMarkdown
              content={tail}
              variant="inline"
              className="min-w-0 flex-1 text-xs"
            />
          ) : (
            // Gradient sweep when tokens haven't arrived yet — same shimmer as
            // "Processing…" / "Planning…".
            <ShimmerText text="Thinking…" className="truncate text-xs" />
          )
        ) : (
          <span className="truncate">
            {expanded ? "Thought process" : collapsedLabel}
          </span>
        )}
      </button>

      {expanded && (
        <div
          ref={bodyRef}
          className="mt-1 ml-1 max-h-[400px] overflow-y-auto border-l border-border/60 pl-3 leading-relaxed"
        >
          <ThinkingTraceMarkdown content={fullText} variant="body" />
        </div>
      )}
    </div>
  );
};

export default ThinkingTrace;

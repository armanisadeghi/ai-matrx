"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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

  const fullText = (
    texts && texts.length > 0
      ? texts.filter((t) => t?.trim()).join("\n\n")
      : (text ?? "")
  ).trim();

  // Keep the expanded body pinned to the newest tokens while streaming.
  useEffect(() => {
    if (expanded && isStreaming && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [fullText, expanded, isStreaming]);

  if (!showThinking || !fullText) return null;

  // Collapsed, mid-stream: show the tail so the thought visibly "comes in".
  const tail = fullText.split("\n").filter((l) => l.trim()).pop() ?? "";
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
        <span className="truncate italic">
          {expanded ? "Thought process" : collapsedLabel}
        </span>
      </button>

      {expanded && (
        <div
          ref={bodyRef}
          className="mt-1 ml-1 max-h-[400px] overflow-y-auto whitespace-pre-wrap border-l border-border/60 pl-3 leading-relaxed text-muted-foreground"
        >
          {fullText}
        </div>
      )}
    </div>
  );
};

export default ThinkingTrace;

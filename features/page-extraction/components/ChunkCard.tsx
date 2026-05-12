/**
 * features/page-extraction/components/ChunkCard.tsx
 *
 * One chunk rendered as an expandable card, modeled on the per-page block
 * cards in the AI-cleaned reader pane.
 *
 * Three states the card shows:
 *
 *   1. Idle (no pageRun yet) — header + per-variation char breakdown.
 *      Expanding reveals the input text that WOULD be sent to the agent.
 *
 *   2. Running (pageRun.status === "running") — auto-expanded. Live
 *      streaming text from the agent appears in a scrolling pre block
 *      that grows as tokens arrive (driven by `pageRun.streamingText`).
 *      Spinner + char counter pulse next to the header.
 *
 *   3. Terminal (completed / failed) — stays expanded if it was expanded
 *      during run. Shows the final raw response and (if completed) the
 *      parsed JSON row count. Failed cards surface the error inline.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPageRange } from "@/features/page-extraction/utils/chunk-preview";
import {
  SOURCE_VARIATION_BY_KIND,
} from "@/features/page-extraction/constants";
import type {
  ChunkPreviewItem,
  SourceVariationKind,
} from "@/features/page-extraction/types";
import type { ActivePageRun } from "@/features/page-extraction/redux/pageExtractionSlice";

export interface ChunkCardProps {
  chunk: ChunkPreviewItem;
  /** Live page-run state (from the active run, if any). Undefined when the
   *  chunk hasn't been launched yet. */
  pageRun?: ActivePageRun;
  /** Click-to-jump callback — clicking the chunk's header jumps the synced
   *  panes to its first page. */
  onJumpToPage?: (page: number) => void;
}

export function ChunkCard({ chunk, pageRun, onJumpToPage }: ChunkCardProps) {
  const isRunning = pageRun?.status === "running";
  const isTerminal =
    pageRun?.status === "completed" || pageRun?.status === "failed";

  // Auto-expand whenever there's something happening (running) or worth
  // showing (terminal). The user can still collapse manually.
  const [expanded, setExpanded] = useState(false);
  const userOverride = useRef(false);
  useEffect(() => {
    if (userOverride.current) return;
    if (isRunning) setExpanded(true);
  }, [isRunning]);
  useEffect(() => {
    if (userOverride.current) return;
    if (isTerminal && (pageRun?.rawResponse?.length ?? 0) > 0) {
      setExpanded(true);
    }
  }, [isTerminal, pageRun?.rawResponse]);

  const pageLabel = formatPageRange(chunk.pageNumbers);
  const statusIcon = pageRunStatusIcon(pageRun);

  const streamingText = pageRun?.streamingText ?? "";
  const finalText = pageRun?.rawResponse ?? "";
  const bodyText =
    isTerminal && finalText.length > 0 ? finalText : streamingText;

  return (
    <div
      className={cn(
        "group border rounded-md text-[11px] transition-colors bg-card",
        isRunning && "border-primary/40 bg-primary/5 ring-1 ring-primary/10",
        pageRun?.status === "completed" && "border-success/30",
        pageRun?.status === "failed" && "border-destructive/40 bg-destructive/5",
        !pageRun && "border-border",
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => {
            userOverride.current = true;
            setExpanded((v) => !v);
          }}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>
        <span className="font-mono font-semibold text-foreground/80 text-[10px]">
          chunk {chunk.chunkIndex + 1}
        </span>
        <button
          type="button"
          className="text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => {
            if (chunk.pageNumbers[0] != null && onJumpToPage)
              onJumpToPage(chunk.pageNumbers[0]);
          }}
          title="Jump to first page in chunk"
        >
          pages {pageLabel}
        </button>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {isRunning ? (
            <span className="font-mono text-primary tabular-nums animate-pulse">
              {streamingText.length.toLocaleString()} chars
            </span>
          ) : isTerminal ? (
            <span className="font-mono">
              {finalText.length.toLocaleString()} chars
              {pageRun?.resultCount != null && (
                <>
                  {" "}· {pageRun.resultCount} row
                  {pageRun.resultCount === 1 ? "" : "s"}
                </>
              )}
            </span>
          ) : (
            <span className="font-mono">
              {chunk.totalChars.toLocaleString()} chars
            </span>
          )}
          {statusIcon}
        </span>
      </div>

      {/* Per-variation breakdown — only when idle or pre-run */}
      {!pageRun && (
        <div className="px-2 pb-1.5 flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
          {Object.entries(chunk.charsByVariation).map(([kind, chars]) => {
            const def = SOURCE_VARIATION_BY_KIND.get(
              kind as SourceVariationKind,
            );
            if (!def) return null;
            return (
              <span
                key={kind}
                className="px-1.5 py-0.5 rounded bg-muted/50 border border-border/60"
              >
                {def.label}:{" "}
                <span className="font-mono font-medium text-foreground/80">
                  {chars.toLocaleString()}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Failure banner */}
      {pageRun?.status === "failed" && pageRun.error && (
        <div className="mx-2 mb-1.5 px-2 py-1 rounded bg-destructive/10 border border-destructive/30 text-destructive text-[10px] leading-snug">
          <AlertTriangle className="w-3 h-3 inline-block mr-1" />
          {pageRun.error}
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border bg-background/60">
          {isRunning && streamingText.length === 0 ? (
            <p className="italic text-muted-foreground text-[10px] px-2 py-2 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Waiting for first token…
            </p>
          ) : pageRun ? (
            // Live stream (during run) OR final raw_response (after).
            <pre
              className={cn(
                "whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-foreground/85 px-2 py-2 max-h-64 overflow-y-auto",
                isRunning && "border-l-2 border-primary/50",
              )}
            >
              {bodyText || (
                <span className="italic text-muted-foreground">
                  (empty response)
                </span>
              )}
            </pre>
          ) : chunk.preview ? (
            // Idle preview — what would be sent to the agent.
            <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-foreground/85 px-2 py-2 max-h-64 overflow-y-auto">
              {chunk.preview}
            </pre>
          ) : (
            <p className="italic text-muted-foreground text-[10px] px-2 py-2">
              (No text in this chunk for the selected variations.)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function pageRunStatusIcon(pageRun?: ActivePageRun) {
  if (!pageRun) return null;
  if (pageRun.status === "running")
    return <Loader2 className="w-3 h-3 text-primary animate-spin" />;
  if (pageRun.status === "completed")
    return <Check className="w-3 h-3 text-success" />;
  if (pageRun.status === "failed")
    return <AlertTriangle className="w-3 h-3 text-destructive" />;
  return null;
}

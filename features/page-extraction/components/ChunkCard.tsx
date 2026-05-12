/**
 * features/page-extraction/components/ChunkCard.tsx
 *
 * One chunk rendered as an expandable card, modeled on the per-page block
 * cards in the AI-cleaned reader pane. Always shows the page range, char
 * count, and per-variation breakdown. Expanding reveals the actual text
 * that will be sent to the agent.
 *
 * Status overlays appear when this chunk has a corresponding page-run row
 * (i.e. the user has launched a run that's processing this chunk).
 */

"use client";

import { useState } from "react";
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
  const [expanded, setExpanded] = useState(false);
  const pageLabel = formatPageRange(chunk.pageNumbers);
  const statusIcon = pageRunStatusIcon(pageRun);

  return (
    <div
      className={cn(
        "group border rounded-md text-[11px] transition-colors bg-card",
        pageRun?.status === "running" && "border-primary/40 bg-primary/5",
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
          onClick={() => setExpanded((v) => !v)}
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
          <span className="font-mono">
            {chunk.totalChars.toLocaleString()} chars
          </span>
          {statusIcon}
        </span>
      </div>

      {/* Per-variation breakdown */}
      <div className="px-2 pb-1.5 flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
        {Object.entries(chunk.charsByVariation).map(([kind, chars]) => {
          const def = SOURCE_VARIATION_BY_KIND.get(kind as SourceVariationKind);
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

      {/* Failure / parse-error banner */}
      {pageRun?.status === "failed" && pageRun.error && (
        <div className="mx-2 mb-1.5 px-2 py-1 rounded bg-destructive/10 border border-destructive/30 text-destructive text-[10px] leading-snug">
          <AlertTriangle className="w-3 h-3 inline-block mr-1" />
          {pageRun.error}
        </div>
      )}

      {/* Body — expanded view shows the actual selection text */}
      {expanded && (
        <div className="border-t border-border bg-background/60">
          {chunk.preview ? (
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

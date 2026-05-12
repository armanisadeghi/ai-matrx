/**
 * features/page-extraction/components/ChunkCard.tsx
 *
 * One CHUNK as a card. A chunk is FIRST AND FOREMOST a slice of input
 * data — the pages plus their content that will be (or were) sent to
 * the agent. The agent's response, when there is one, is shown as a
 * SECONDARY section inside the expanded card so the user can audit
 * what the agent did with their input.
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ ▸ chunk 3 — pages 21-30 · 18,704 chars       ⟳ running  │
 *   │   Cleaned text: 18,704 · Raw text: -                     │
 *   ├─────────────────────────────────────────────────────────┤
 *   │ INPUT (sent to agent)                                    │
 *   │ --- Page 21 ---                                          │
 *   │ <chunk text...>                                          │
 *   │                                                          │
 *   │ AGENT OUTPUT (3 rows extracted)                          │
 *   │ [streaming buffer or final raw_response]                 │
 *   └─────────────────────────────────────────────────────────┘
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
  AlertTriangle,
  FileText,
  Bot,
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
  pageRun?: ActivePageRun;
  onJumpToPage?: (page: number) => void;
}

export function ChunkCard({ chunk, pageRun, onJumpToPage }: ChunkCardProps) {
  const isRunning = pageRun?.status === "running";
  const isTerminal =
    pageRun?.status === "completed" || pageRun?.status === "failed";

  // Auto-expand on running/terminal so the user sees the input + output
  // without an extra click. They can still collapse manually.
  const [expanded, setExpanded] = useState(false);
  const userOverride = useRef(false);
  useEffect(() => {
    if (userOverride.current) return;
    if (isRunning || (isTerminal && (pageRun?.rawResponse?.length ?? 0) > 0)) {
      setExpanded(true);
    }
  }, [isRunning, isTerminal, pageRun?.rawResponse]);

  const pageLabel = formatPageRange(chunk.pageNumbers);
  const statusIcon = pageRunStatusIcon(pageRun);

  const streamingText = pageRun?.streamingText ?? "";
  const finalText = pageRun?.rawResponse ?? "";
  // Show the running buffer while in flight; once terminal, prefer the
  // final raw_response (more reliable — comes from the persisted event).
  const outputText = isTerminal && finalText ? finalText : streamingText;
  const hasOutput = pageRun !== undefined && outputText.length > 0;
  // True after the agent ran but produced nothing — fairly common when
  // the chunk's pages contain no extractable content for the agent's task.
  const ranButEmpty =
    isTerminal && outputText.length === 0 && pageRun?.error == null;

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
          <span className="font-mono">
            {chunk.totalChars.toLocaleString()} chars in
          </span>
          {pageRun?.resultCount != null && pageRun.resultCount > 0 && (
            <span className="font-mono text-success">
              · {pageRun.resultCount} row
              {pageRun.resultCount === 1 ? "" : "s"} out
            </span>
          )}
          {statusIcon}
        </span>
      </div>

      {/* Always-visible per-variation char breakdown — describes the INPUT */}
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

      {/* Failure banner */}
      {pageRun?.status === "failed" && pageRun.error && (
        <div className="mx-2 mb-1.5 px-2 py-1 rounded bg-destructive/10 border border-destructive/30 text-destructive text-[10px] leading-snug">
          <AlertTriangle className="w-3 h-3 inline-block mr-1" />
          {pageRun.error}
        </div>
      )}

      {/* Expanded body — INPUT first, OUTPUT below if present */}
      {expanded && (
        <div className="border-t border-border bg-background/60 divide-y divide-border">
          {/* INPUT — always shown */}
          <Section
            icon={<FileText className="w-3 h-3" />}
            label="Input (sent to agent)"
          >
            {chunk.preview ? (
              <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-foreground/85 max-h-48 overflow-y-auto">
                {chunk.preview}
              </pre>
            ) : (
              <p className="italic text-muted-foreground text-[10px]">
                (No text in this chunk for the selected variations.)
              </p>
            )}
          </Section>

          {/* OUTPUT — only when the chunk has run (or is running) */}
          {pageRun && (
            <Section
              icon={<Bot className="w-3 h-3" />}
              label={
                isRunning
                  ? "Agent output (streaming)"
                  : pageRun.status === "failed"
                    ? "Agent output (incomplete)"
                    : "Agent output"
              }
            >
              {hasOutput ? (
                <pre
                  className={cn(
                    "whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-foreground/85 max-h-48 overflow-y-auto",
                    isRunning && "border-l-2 border-primary/50 pl-2",
                  )}
                >
                  {outputText}
                </pre>
              ) : isRunning ? (
                <p className="italic text-muted-foreground text-[10px] flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Waiting for first token…
                </p>
              ) : ranButEmpty ? (
                <p className="italic text-muted-foreground text-[10px]">
                  (Agent returned no output for this chunk.)
                </p>
              ) : null}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2 py-1.5 space-y-1">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
        {icon}
        {label}
      </div>
      {children}
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

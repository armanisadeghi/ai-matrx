"use client";

import { useMemo } from "react";
import { Search, Maximize2, AlertCircle } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { isTerminal } from "../_shared";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";
import { RagSourceCard } from "./RagSourceCard";
import { parseRag } from "./parseRag";

/**
 * Inline renderer for `rag_search` — the answer's SOURCES as a polished entity
 * card. The user needs to confirm where an answer came from, so each hit is a
 * source card (hover → full-chunk peek). Card chrome: while searching the shell
 * shows the slim glossy "Searching indexed content" line; on completion this
 * card renders directly.
 */
const MAX_INLINE = 6;

export function RagSearchInline({
  entry,
  onOpenOverlay,
  expanded,
  onToggleExpanded,
}: ToolRendererProps) {
  const data = useMemo(() => parseRag(entry), [entry]);

  // While streaming, the shell's slim line carries it — render nothing here.
  if (!isTerminal(entry) && data.hits.length === 0) return null;

  if (data.isError) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Knowledge search failed</div>
          {data.errorMessage ? (
            <div className="text-[11px] text-muted-foreground">
              {data.errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const shown = data.hits.slice(0, MAX_INLINE);
  const hasMore = data.hits.length > shown.length;

  const subtitleParts: string[] = [
    `${data.hits.length} ${data.hits.length === 1 ? "source" : "sources"}`,
  ];
  if (data.total_candidates != null)
    subtitleParts.push(`${data.total_candidates} candidates`);
  if (data.latency_ms != null) subtitleParts.push(`${data.latency_ms}ms`);
  if (data.reranker_model) subtitleParts.push("reranked");

  const actions: EntityAction[] = [];
  if (onOpenOverlay)
    actions.push({
      label: hasMore ? `View all ${data.hits.length} sources` : "Expand",
      icon: Maximize2,
      onSelect: () => onOpenOverlay(),
    });

  return (
    <EntityCard
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      icon={Search}
      accent="cyan"
      title={data.query || "Knowledge search"}
      subtitle={subtitleParts.join(" · ")}
      actions={actions}
    >
      {data.hits.length ? (
        <div className="max-h-[440px] space-y-1.5 overflow-y-auto p-2">
          {shown.map((h, i) => (
            <RagSourceCard key={`${h.chunk_id}-${i}`} hit={h} />
          ))}
          {hasMore && onOpenOverlay ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenOverlay();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Search className="h-4 w-4" />
              View all {data.hits.length} sources
            </button>
          ) : null}
        </div>
      ) : (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No sources matched{data.query ? ` "${data.query}"` : ""}.
        </div>
      )}
    </EntityCard>
  );
}

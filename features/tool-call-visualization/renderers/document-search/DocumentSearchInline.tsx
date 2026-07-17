"use client";

import { useMemo } from "react";
import { FileSearch, AlertCircle } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { isTerminal } from "../_shared";
import { EntityCard } from "../_shared-entity/EntityCard";
import {
  canonicalNormalizedSourceName,
  RagSourceCard,
} from "../rag-search/RagSourceCard";
import { parseDocumentSearch } from "./parseDocumentSearch";

/**
 * Inline renderer for `document_search` — the SAME visual grammar as
 * `rag_search` (the two tools do nearly identical retrieval): a polished
 * entity card whose body is a linear list of source hit cards (snippet,
 * page, relevance, click → viewer). Never a raw JSON dump, never a
 * click-to-reveal-another-click chain.
 */
const MAX_INLINE = 6;

export function DocumentSearchInline({
  entry,
  onOpenOverlay,
  expanded,
  onToggleExpanded,
}: ToolRendererProps) {
  const data = useMemo(() => parseDocumentSearch(entry), [entry]);

  // While streaming, the shell's slim line carries it — render nothing here.
  if (!isTerminal(entry) && data.hits.length === 0) return null;

  if (data.isError) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Document search failed</div>
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
  const topScore = data.hits.reduce((m, h) => Math.max(m, h.score), 0);

  const subtitleParts: string[] = [
    `${data.hits.length} ${data.hits.length === 1 ? "passage" : "passages"}`,
  ];
  if (data.pageCount > 0)
    subtitleParts.push(
      `${data.pageCount} ${data.pageCount === 1 ? "page" : "pages"}`,
    );
  if (data.scope) subtitleParts.push(data.scope.replaceAll("_", " "));

  return (
    <EntityCard
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      icon={FileSearch}
      accent="cyan"
      title={data.query || "Document search"}
      subtitle={subtitleParts.join(" · ")}
      actions={[]}
    >
      {data.hits.length ? (
        <div className="max-h-[440px] space-y-1.5 overflow-y-auto p-2">
          {shown.map((h, i) => (
            <RagSourceCard
              key={`${h.chunk_id}-${i}`}
              hit={h}
              sourceName={canonicalNormalizedSourceName(h, data.hits)}
              topScore={topScore}
              query={data.query}
            />
          ))}
          {hasMore && onOpenOverlay ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenOverlay();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <FileSearch className="h-4 w-4" />
              View all {data.hits.length} passages
            </button>
          ) : null}
        </div>
      ) : (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          No passages matched{data.query ? ` "${data.query}"` : ""}.
        </div>
      )}
    </EntityCard>
  );
}

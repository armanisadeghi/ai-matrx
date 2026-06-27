"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { RagSourceCard } from "./RagSourceCard";
import { parseRag } from "./parseRag";

/**
 * Overlay renderer for `rag_search` — every source for the query, full list, as
 * source cards (hover → full-chunk peek).
 */
export function RagSearchOverlay({ entry }: ToolRendererProps) {
  const data = useMemo(() => parseRag(entry), [entry]);

  if (!data.hits.length) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No sources to display
      </div>
    );
  }

  const meta: string[] = [
    `${data.hits.length} ${data.hits.length === 1 ? "source" : "sources"}`,
  ];
  if (data.total_candidates != null)
    meta.push(`${data.total_candidates} candidates`);
  if (data.latency_ms != null) meta.push(`${data.latency_ms}ms`);
  if (data.reranker_model) meta.push(`reranked · ${data.reranker_model}`);

  return (
    <div className="h-full overflow-y-auto bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-medium text-foreground">
          {data.query || "Knowledge search"}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {meta.join(" · ")}
        </span>
      </div>
      <div className="space-y-1.5">
        {data.hits.map((h, i) => (
          <RagSourceCard key={`${h.chunk_id}-${i}`} hit={h} />
        ))}
      </div>
    </div>
  );
}
